import 'dart:io';

import 'package:drift/drift.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../data/db/database.dart';
import '../../data/local_files.dart';
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';
import 'media_probe.dart';
import 'sample_data.dart';
import 'series_parser.dart';

/// Result of [ImportController.downloadFromServer].
enum DownloadOutcome {
  /// The file was fetched and added to the on-device catalog.
  added,

  /// The item was already on this device; nothing to do.
  alreadyDownloaded,
}

/// Aggregate result of a bulk download ([ImportController.downloadManyFromServer]).
class BulkDownloadResult {
  /// Creates a bulk-download summary.
  const BulkDownloadResult({
    required this.added,
    required this.already,
    required this.failed,
    required this.skippedUnsupported,
    required this.cancelled,
  });

  /// Items newly downloaded to the device.
  final int added;

  /// Items skipped because they were already on the device.
  final int already;

  /// Items whose download or read failed.
  final int failed;

  /// Items skipped because the format can't be read on-device (CBR/MOBI).
  final int skippedUnsupported;

  /// Whether the run stopped early because the user cancelled.
  final bool cancelled;

  /// One-line summary for a snackbar.
  String get summary {
    final parts = <String>[
      if (added > 0) 'Downloaded $added',
      if (already > 0) '$already already on device',
      if (failed > 0) '$failed failed',
      if (skippedUnsupported > 0) '$skippedUnsupported unsupported',
    ];
    final body = parts.isEmpty ? 'Nothing to download' : parts.join(' · ');
    return cancelled ? 'Stopped — $body' : body;
  }
}

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

  /// Opens the system picker for CBZ/CBT/PDF/EPUB and ingests the chosen files.
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

  /// Ingest files at already-stable locations *without* copying them into app
  /// storage — used by watched-folder rescans, which reference the user's files
  /// in place (absolute paths). Re-imports of the same uri are ignored, so this
  /// is safe to call repeatedly. Returns the number newly imported.
  Future<int> ingestExisting(List<String> storedPaths) async {
    if (storedPaths.isEmpty) return 0;
    await _ingest(storedPaths);
    // _ingest leaves the final state's `imported` as this run's count.
    return state.imported;
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
    final filenameTitle = stripLeadingReleaseDate(p.basenameWithoutExtension(relPath)).trim();
    final SeriesInfo s = probe.series;
    final m = probe.embedded;
    // Embedded metadata (ComicInfo.xml / OPF) wins over filename heuristics when
    // present; otherwise fall back to the filename-parsed series/title.
    final title = (m.title?.trim().isNotEmpty ?? false)
        ? m.title!.trim()
        : (filenameTitle.isEmpty ? p.basename(relPath) : filenameTitle);
    return ComicsCompanion.insert(
      uri: relPath,
      title: title,
      pageCount: Value(probe.pageCount),
      fileSize: Value(probe.fileSize),
      mediaType: Value(probe.mediaType),
      coverThumbnail: Value(probe.coverJpg),
      seriesName: Value(m.seriesName ?? s.seriesName),
      volumeNumber: Value(m.volumeNumber ?? s.volumeNumber),
      chapterNumber: Value(m.chapterNumber ?? s.chapterNumber),
      author: Value(m.author),
      artist: Value(m.artist),
      genre: Value(m.genre),
      year: Value(m.year),
      summary: Value(m.summary),
    );
  }

  // --- Downloading remote items for offline use ---

  /// App-storage-relative path a downloaded remote item lives at. Deterministic
  /// (keyed by the connection + the item's server id) so re-downloading the same
  /// item is idempotent and never creates a second catalog row.
  String _downloadRelPath(RemoteSource source, ComicSummary remote) {
    final ext = remote.extension!; // callers guarantee a supported extension
    final safeSource = source.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    return p.join('downloads', '${safeSource}_${remote.id}.$ext');
  }

  /// Whether [remote] from [source] has already been downloaded to this device.
  Future<bool> isDownloaded(RemoteSource source, ComicSummary remote) async {
    final ext = remote.extension;
    if (ext == null || !supportedExtensions.contains(ext)) return false;
    final rel = _downloadRelPath(source, remote);
    final row = await (_db.select(_db.comics)..where((t) => t.uri.equals(rel)))
        .getSingleOrNull();
    return row != null;
  }

  /// Downloads a remote item's original file into app-owned storage and adds it
  /// to the on-device catalog, so it reads fully offline from the local library
  /// (it appears under *This device*).
  ///
  /// Idempotent: a second call for the same server item is a no-op
  /// ([DownloadOutcome.alreadyDownloaded]). Throws [UnsupportedError] when the
  /// format can't be read on-device — only CBZ/PDF/EPUB from the server qualify
  /// (the server may also hold CBR/MOBI, which the local readers can't open).
  Future<DownloadOutcome> downloadFromServer(
    RemoteSource source,
    ComicSummary remote, {
    void Function(int received, int total)? onProgress,
  }) async {
    final ext = remote.extension;
    if (ext == null || !supportedExtensions.contains(ext)) {
      throw UnsupportedError(
        '“${remote.title}” is a ${ext?.toUpperCase() ?? 'format'} that can’t be '
        'read on this device.',
      );
    }

    final rel = _downloadRelPath(source, remote);
    final base = await appStorageDir();
    final abs = p.join(base.path, rel);

    // Already catalogued? Nothing to do.
    final existing = await (_db.select(_db.comics)..where((t) => t.uri.equals(rel)))
        .getSingleOrNull();
    if (existing != null) return DownloadOutcome.alreadyDownloaded;

    // Fetch the file (skip if a previous run left a complete copy on disk).
    // Download to a `.part` and rename on success, so an interrupted download is
    // never catalogued and read as a corrupt file.
    await Directory(p.dirname(abs)).create(recursive: true);
    final file = File(abs);
    if (!await file.exists() || await file.length() == 0) {
      final part = '$abs.part';
      await source.downloadFile(remote.id, part, onReceiveProgress: onProgress);
      await File(part).rename(abs);
    }

    final probe = await probeFile(abs);
    if (probe == null) {
      // Don't leave an unreadable download lying around.
      try {
        await file.delete();
      } catch (_) {/* best effort */}
      throw const FormatException('The downloaded file could not be read.');
    }

    await _db.into(_db.comics).insert(
          _companionForDownload(rel, probe, remote),
          mode: InsertMode.insertOrIgnore,
        );
    // The local library refreshes via the DB change stream when it's the active
    // source (or on the next switch to *This device*).
    return DownloadOutcome.added;
  }

  /// Bulk-downloads [items] from [source] for offline use — used to grab a whole
  /// collection, series/folder, or tag at once. Items the on-device readers can't
  /// open (CBR/MOBI) are skipped; ones already downloaded are no-ops. Downloads
  /// run sequentially (one file at a time, to be gentle on the server); progress
  /// is reported through [onItem] as `(completed, total, currentTitle)`, and the
  /// loop stops between items when [isCancelled] returns true.
  Future<BulkDownloadResult> downloadManyFromServer(
    RemoteSource source,
    List<ComicSummary> items, {
    void Function(int completed, int total, String title)? onItem,
    bool Function()? isCancelled,
  }) async {
    final downloadable = items
        .where((c) => c.extension != null && supportedExtensions.contains(c.extension))
        .toList();
    var added = 0, already = 0, failed = 0;
    for (var i = 0; i < downloadable.length; i++) {
      if (isCancelled?.call() ?? false) break;
      final comic = downloadable[i];
      onItem?.call(i, downloadable.length, comic.title);
      try {
        final outcome = await downloadFromServer(source, comic);
        if (outcome == DownloadOutcome.added) {
          added++;
        } else {
          already++;
        }
      } catch (_) {
        failed++;
      }
    }
    return BulkDownloadResult(
      added: added,
      already: already,
      failed: failed,
      skippedUnsupported: items.length - downloadable.length,
      cancelled: isCancelled?.call() ?? false,
    );
  }

  /// Catalog row for a downloaded remote item. The server's title and series win
  /// (they're already correct), with page count / size / cover from the probe and
  /// any embedded ComicInfo/OPF fields filling the rest.
  ComicsCompanion _companionForDownload(
    String relPath,
    ProbeResult probe,
    ComicSummary remote,
  ) {
    final m = probe.embedded;
    return ComicsCompanion.insert(
      uri: relPath,
      title: remote.title,
      pageCount: Value(probe.pageCount),
      fileSize: Value(probe.fileSize),
      mediaType: Value(probe.mediaType),
      coverThumbnail: Value(probe.coverJpg),
      seriesName: Value(remote.seriesName ?? m.seriesName),
      volumeNumber: Value(remote.volumeNumber ?? m.volumeNumber),
      chapterNumber: Value(remote.chapterNumber ?? m.chapterNumber),
      author: Value(m.author),
      artist: Value(m.artist),
      genre: Value(m.genre),
      year: Value(m.year),
      summary: Value(m.summary),
    );
  }
}
