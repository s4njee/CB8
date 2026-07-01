import 'dart:async';
import 'dart:io';

import 'package:collection/collection.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../data/db/database.dart';
import '../../data/models/groups.dart';
import '../../data/repositories/providers.dart';
import 'import_controller.dart';
import 'media_probe.dart';

/// Holds the watched folders and drives their (re)scanning.
final watchedFoldersProvider =
    NotifierProvider<WatchedFoldersController, List<WatchedFolderInfo>>(
        WatchedFoldersController.new);

/// Manages folders CB8 ingests automatically.
///
/// A folder is referenced *in place* (its files are imported by absolute path,
/// not copied into app storage), so a watched folder mirrors an external library
/// without duplicating it. A rescan walks each folder for supported files and
/// ingests anything not already in the catalog. On desktop the controller also
/// live-watches each folder while the app runs and rescans on launch; mobile
/// relies on the manual "Rescan" action (background file watching isn't
/// available there).
class WatchedFoldersController extends Notifier<List<WatchedFolderInfo>> {
  AppDatabase get _db => ref.read(databaseProvider);

  final _watchers = <String, StreamSubscription<FileSystemEvent>>{};
  final _debounce = <String, Timer>{};

  @override
  List<WatchedFolderInfo> build() {
    ref.onDispose(_disposeWatchers);
    // Load, then (desktop) rescan auto folders and start live watching.
    _load().then((_) {
      if (_isDesktop) {
        unawaited(rescanAll());
        _startWatching();
      }
    });
    return const [];
  }

  static bool get _isDesktop =>
      Platform.isMacOS || Platform.isWindows || Platform.isLinux;

  Future<void> _load() async {
    final rows = await (_db.select(_db.watchedFolders)
          ..orderBy([(t) => OrderingTerm(expression: t.path)]))
        .get();
    state = [
      for (final r in rows)
        WatchedFolderInfo(
          id: r.id.toString(),
          path: r.path,
          autoScan: r.autoScan,
          lastScanned: r.lastScanned,
        ),
    ];
  }

  /// Adds [path] as a watched folder and runs an initial scan. Returns a
  /// human-readable error, or null on success.
  Future<String?> addFolder(String path) async {
    if (!await Directory(path).exists()) return 'Folder not found';
    await _db.into(_db.watchedFolders).insert(
          WatchedFoldersCompanion.insert(path: path),
          mode: InsertMode.insertOrIgnore,
        );
    await _load();
    if (_isDesktop) _startWatching();
    await rescanPath(path);
    return null;
  }

  /// Stops watching and forgets a folder (does not delete already-imported items).
  Future<void> removeFolder(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    final row = await (_db.select(_db.watchedFolders)..where((t) => t.id.equals(intId)))
        .getSingleOrNull();
    if (row != null) {
      _watchers.remove(row.path)?.cancel();
      _debounce.remove(row.path)?.cancel();
    }
    await (_db.delete(_db.watchedFolders)..where((t) => t.id.equals(intId))).go();
    await _load();
  }

  /// Rescans every watched folder. Returns the total number of items imported.
  Future<int> rescanAll() async {
    var total = 0;
    for (final folder in [...state]) {
      total += await rescanPath(folder.path);
    }
    return total;
  }

  /// Rescans one folder by id. Returns how many new items were imported.
  Future<int> rescan(String id) async {
    final folder = state.where((f) => f.id == id).firstOrNull;
    if (folder == null) return 0;
    return rescanPath(folder.path);
  }

  /// Walks [path], imports supported files not already in the catalog, and
  /// stamps the folder's last-scanned time. Returns the count newly imported.
  Future<int> rescanPath(String path) async {
    final dir = Directory(path);
    if (!await dir.exists()) return 0;

    final found = <String>[];
    await for (final entity in dir.list(recursive: true, followLinks: false)) {
      if (entity is File && _isSupported(entity.path)) found.add(entity.path);
    }
    // Skip files already imported (matched by their absolute uri).
    final known = await _knownUris(found);
    final fresh = found.where((f) => !known.contains(f)).toList();

    final imported = fresh.isEmpty
        ? 0
        : await ref.read(importControllerProvider.notifier).ingestExisting(fresh);

    await (_db.update(_db.watchedFolders)..where((t) => t.path.equals(path)))
        .write(WatchedFoldersCompanion(lastScanned: Value(DateTime.now())));
    await _load();
    return imported;
  }

  Future<Set<String>> _knownUris(List<String> candidates) async {
    if (candidates.isEmpty) return const {};
    final rows = await (_db.selectOnly(_db.comics)
          ..addColumns([_db.comics.uri])
          ..where(_db.comics.uri.isIn(candidates)))
        .get();
    return rows.map((r) => r.read(_db.comics.uri)!).toSet();
  }

  static bool _isSupported(String path) =>
      supportedExtensions.contains(p.extension(path).replaceFirst('.', '').toLowerCase());

  // --- Live watching (desktop) ---

  void _startWatching() {
    if (!_isDesktop) return;
    for (final folder in state) {
      if (!folder.autoScan || _watchers.containsKey(folder.path)) continue;
      final dir = Directory(folder.path);
      if (!dir.existsSync()) continue;
      _watchers[folder.path] = dir
          .watch(events: FileSystemEvent.create | FileSystemEvent.move, recursive: true)
          .listen((_) => _onFsEvent(folder.path));
    }
  }

  // Filesystem events can arrive in bursts (a multi-file copy); debounce so a
  // batch triggers a single rescan.
  void _onFsEvent(String path) {
    _debounce[path]?.cancel();
    _debounce[path] = Timer(const Duration(seconds: 2), () => unawaited(rescanPath(path)));
  }

  void _disposeWatchers() {
    for (final s in _watchers.values) {
      s.cancel();
    }
    for (final t in _debounce.values) {
      t.cancel();
    }
    _watchers.clear();
    _debounce.clear();
  }
}
