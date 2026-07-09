import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';

/// Cross-device progress sync for downloaded-for-offline copies.
///
/// A downloaded copy is a local row linked to a server item (see
/// `ComicSummary.hasServerOrigin`). Reading it offline updates only the local
/// row, so these helpers mirror progress back to the origin server and pull the
/// server's position on open — that's what makes "further along on another
/// device" work. Every server call is best-effort: a signed-out/guest/offline
/// server must never block or crash offline reading.

/// The [RemoteSource] for a downloaded copy's origin server, or null when the
/// item isn't a linked copy or its origin connection is no longer saved.
RemoteSource? originSourceFor(WidgetRef ref, ComicSummary comic) {
  if (!comic.hasServerOrigin) return null;
  final conn = ref
      .read(connectionsProvider)
      .connections
      .where((c) => c.id == comic.originConnectionId)
      .firstOrNull;
  if (conn == null) return null;
  return ref.read(remoteSourceProvider(conn));
}

/// Best-effort: push a downloaded copy's just-saved progress to its origin
/// server so other devices see it. No-op for non-linked items; swallows errors
/// (RemoteSource.setProgress already 401-swallows for guests).
void mirrorProgressToOrigin(
  WidgetRef ref,
  ComicSummary comic, {
  int? page,
  String? location,
  double? percent,
  bool? completed,
}) {
  final origin = originSourceFor(ref, comic);
  if (origin == null) return;
  origin.setProgress(
    comic.originComicId!,
    page: page,
    location: location,
    percent: percent,
    completed: completed,
  );
}

/// A newer reading position found on a downloaded copy's origin server.
class RemoteProgress {
  /// Creates a remote-progress snapshot.
  const RemoteProgress({
    required this.fraction,
    this.lastPage,
    this.lastLocation,
    this.lastPercent,
    required this.completed,
  });

  /// Whole-book fraction 0..1 (for the prompt's "X%").
  final double fraction;

  /// Page-based position (paged formats).
  final int? lastPage;

  /// Locator position (EPUB).
  final String? lastLocation;

  /// Whole-book percent (EPUB).
  final double? lastPercent;

  /// Whether the server considers the item finished.
  final bool completed;
}

/// Minimum fraction the server must be *ahead* of the local copy before we
/// bother prompting — avoids nagging over a page or two of drift.
const double _syncAheadThreshold = 0.02;

/// Pulls the origin server's position for a downloaded [comic] and returns it
/// only when it's meaningfully ahead of the local copy (so the reader can offer
/// to jump there). Returns null when there's no origin, the server is
/// unreachable, or local is already level/ahead.
Future<RemoteProgress?> pullNewerOriginProgress(
  WidgetRef ref,
  ComicSummary comic,
) async {
  final origin = originSourceFor(ref, comic);
  if (origin == null) return null;
  ComicSummary? server;
  try {
    server = await origin.getComic(comic.originComicId!);
  } catch (_) {
    return null; // offline / server error — read the local copy as-is.
  }
  if (server == null) return null;

  final ahead = server.progress - comic.progress > _syncAheadThreshold;
  final newlyFinished = server.completed && !comic.completed;
  if (!ahead && !newlyFinished) return null;

  return RemoteProgress(
    fraction: server.progress,
    lastPage: server.lastPage,
    lastLocation: server.lastLocation,
    lastPercent: server.lastPercent,
    completed: server.completed,
  );
}
