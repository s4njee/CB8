/// Downloading server items for offline reading.
///
/// A download fetches the item's original file from the active CB8 server into
/// app-owned storage and adds it to the on-device catalog, so it then reads
/// fully offline under *This device*. This is deliberately separate from
/// `import_controller.dart`: importing local files and mirroring server items
/// share the probe/insert machinery but nothing else, and the download flow has
/// its own idempotency and progress concerns.
library;

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../data/db/database.dart';
import '../../data/local_files.dart';
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';
import 'media_probe.dart';

/// Result of [OfflineDownloader.downloadFromServer].
enum DownloadOutcome {
  /// The file was fetched and added to the on-device catalog.
  added,

  /// The item was already on this device; nothing to do.
  alreadyDownloaded,
}

/// Aggregate result of a bulk download ([OfflineDownloader.downloadManyFromServer]).
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

/// Exposes the [OfflineDownloader]. Stateless (progress is reported through
/// callbacks), so a plain provider suffices.
final offlineDownloaderProvider = Provider<OfflineDownloader>(OfflineDownloader.new);

/// Saves remote items to this device so they read offline from the local
/// library.
class OfflineDownloader {
  /// Creates the downloader; reads the database through [_ref].
  OfflineDownloader(this._ref);

  final Ref _ref;

  AppDatabase get _db => _ref.read(databaseProvider);

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
          _companionForDownload(rel, probe, remote, source),
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
    RemoteSource source,
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
      // Link the copy to its server row so reading it offline can sync back.
      originConnectionId: Value(source.id),
      originComicId: Value(remote.id),
    );
  }
}
