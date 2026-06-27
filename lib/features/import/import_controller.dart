import 'dart:io';

import 'package:drift/drift.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../data/db/database.dart';
import '../../data/local_files.dart';
import '../../data/repositories/providers.dart';
import 'media_probe.dart';
import 'sample_data.dart';
import 'series_parser.dart';

/// Progress/result of an import run, surfaced to the UI.
class ImportState {
  /// Creates an import-progress snapshot.
  const ImportState({this.running = false, this.message, this.imported = 0, this.failed = 0});

  /// Whether an import is currently running.
  final bool running;

  /// Status text for the UI, if any.
  final String? message;

  /// Number of files imported so far.
  final int imported;

  /// Number of files that failed to import.
  final int failed;

  /// Returns a copy with the given fields overridden.
  ImportState copyWith({bool? running, String? message, int? imported, int? failed}) =>
      ImportState(
        running: running ?? this.running,
        message: message ?? this.message,
        imported: imported ?? this.imported,
        failed: failed ?? this.failed,
      );
}

/// Exposes the [ImportController] and its current [ImportState].
final importControllerProvider =
    NotifierProvider<ImportController, ImportState>(ImportController.new);

/// Drives file selection and ingest into the local Drift catalog.
class ImportController extends Notifier<ImportState> {
  @override
  ImportState build() => const ImportState();

  AppDatabase get _db => ref.read(databaseProvider);

  /// Opens the system picker for CBZ/PDF/EPUB and ingests the chosen files.
  Future<void> pickAndImport() async {
    final result = await FilePicker.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: supportedExtensions.toList(),
    );
    if (result == null || result.files.isEmpty) return;
    final paths = result.files.map((f) => f.path).whereType<String>().toList();
    await importPaths(paths);
  }

  /// Generates and imports a few synthetic comics — a quick way to populate the
  /// library on a fresh device/simulator without sideloading files.
  Future<void> importSamples() async {
    state = const ImportState(running: true, message: 'Generating samples…');
    await _ingest(await writeSampleComics());
  }

  /// Imports files/folders dropped onto the window (desktop drag-and-drop):
  /// expands dropped directories, keeps only CBZ/PDF/EPUB, then ingests.
  Future<void> importDropped(List<String> droppedPaths) async {
    state = const ImportState(running: true, message: 'Importing…');
    final files = <String>[];
    for (final path in droppedPaths) {
      switch (FileSystemEntity.typeSync(path)) {
        case FileSystemEntityType.directory:
          for (final entity in Directory(path).listSync(recursive: true, followLinks: false)) {
            if (entity is File && _isSupported(entity.path)) files.add(entity.path);
          }
        case FileSystemEntityType.file:
          if (_isSupported(path)) files.add(path);
        default:
          break;
      }
    }
    if (files.isEmpty) {
      state = const ImportState(running: false, message: 'No CBZ, PDF, or EPUB files in that drop');
      return;
    }
    await importPaths(files);
  }

  /// True when [path]'s extension is one we ingest (case-insensitive).
  bool _isSupported(String path) =>
      supportedExtensions.contains(p.extension(path).replaceFirst('.', '').toLowerCase());

  /// Copies externally-picked files into app-owned storage, then ingests them.
  /// Copying makes paths stable across reinstalls (see [importIntoLibrary]).
  Future<void> importPaths(List<String> externalPaths) async {
    state = const ImportState(running: true, message: 'Importing…');
    final relPaths = <String>[];
    for (final ext in externalPaths) {
      try {
        relPaths.add(await importIntoLibrary(ext));
      } catch (_) {
        // Skip files we can't copy (e.g. revoked access).
      }
    }
    await _ingest(relPaths);
  }

  /// Probes and inserts each app-storage-relative path. Re-imports (same uri)
  /// are ignored.
  Future<void> _ingest(List<String> relativePaths) async {
    state = const ImportState(running: true, message: 'Importing…');
    var imported = 0;
    var failed = 0;
    for (final rel in relativePaths) {
      try {
        final abs = await resolveLibraryPath(rel);
        final probe = await probeFile(abs);
        if (probe == null) {
          failed++;
          continue;
        }
        await _db.into(_db.comics).insert(
              _companionFor(rel, probe),
              mode: InsertMode.insertOrIgnore,
            );
        imported++;
        state = state.copyWith(
          imported: imported,
          message: 'Imported $imported of ${relativePaths.length}…',
        );
      } catch (_) {
        failed++;
      }
    }
    // Library views refresh automatically via the DB change stream.
    state = ImportState(
      running: false,
      imported: imported,
      failed: failed,
      message: 'Imported $imported'
          '${failed > 0 ? ', $failed failed' : ''}',
    );
  }

  ComicsCompanion _companionFor(String relPath, ProbeResult probe) {
    final title = stripLeadingReleaseDate(p.basenameWithoutExtension(relPath)).trim();
    final SeriesInfo s = probe.series;
    return ComicsCompanion.insert(
      uri: relPath,
      title: title.isEmpty ? p.basename(relPath) : title,
      pageCount: Value(probe.pageCount),
      mediaType: Value(probe.mediaType),
      coverThumbnail: Value(probe.coverJpg),
      seriesName: Value(s.seriesName),
      volumeNumber: Value(s.volumeNumber),
      chapterNumber: Value(s.chapterNumber),
    );
  }
}
