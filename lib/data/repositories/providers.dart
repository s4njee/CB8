/// Riverpod wiring for the data layer — the single import every feature uses
/// to reach it.
///
/// Composes the layer's building blocks into providers: the Drift database,
/// the local/remote [LibrarySource]s and the *active* one (chosen by the
/// connections state in `connections_controller.dart`, a part of this
/// library), the library query/refresh plumbing, and the catalog list
/// providers the screens watch. Features import only this file; the sources
/// and models stay behind it.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/widgets.dart' show PaintingBinding;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../db/database.dart';
import '../models/comic_summary.dart';
import '../models/connection.dart';
import '../models/groups.dart';
import '../models/reading_stats.dart';
import '../sources/library_source.dart';
import '../sources/local_source.dart';
import '../sources/remote_source.dart';

part 'connections_controller.dart';

/// Single app-wide Drift database.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

/// SharedPreferences, overridden in main().
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('sharedPreferencesProvider must be overridden in main()');
});

/// App-wide cookie jar (session cookies, scoped by host), overridden in main()
/// with a persistent jar so logins survive restarts.
final cookieJarProvider = Provider<CookieJar>((ref) => CookieJar());

/// The on-device source. Always available in the hybrid model.
final localSourceProvider = Provider<LibrarySource>((ref) {
  return LocalSource(ref.watch(databaseProvider));
});

/// Lazily loads a single local comic's cover thumbnail by id. The list queries
/// skip the cover BLOB to stay light, so each card watches this — only on-screen
/// covers are loaded/decoded, and `autoDispose` frees them as cards scroll off.
final localCoverProvider =
    FutureProvider.autoDispose.family<Uint8List?, String>((ref, id) async {
  // Keep the bytes alive briefly after the last card stops watching, so
  // scrolling back doesn't re-hit the DB — and, because MemoryImage keys the
  // decoded-image cache by byte-buffer identity, doesn't re-decode either.
  final link = ref.keepAlive();
  Timer? evict;
  ref.onCancel(() => evict = Timer(const Duration(seconds: 30), link.close));
  ref.onResume(() => evict?.cancel());
  ref.onDispose(() => evict?.cancel());
  final source = ref.watch(localSourceProvider);
  if (source is LocalSource) return source.coverBytes(id);
  return null;
});

/// Builds (and caches) a [RemoteSource] for a connection.
final remoteSourceProvider = Provider.family<RemoteSource, Connection>((ref, conn) {
  return RemoteSource(
    id: conn.id,
    name: conn.name,
    baseUrl: conn.baseUrl,
    cookieJar: ref.watch(cookieJarProvider),
  );
});

/// The active source: the on-device library, or the selected server.
final activeSourceProvider = Provider<LibrarySource>((ref) {
  final conns = ref.watch(connectionsProvider);
  final active = conns.active;
  if (active == null) return ref.watch(localSourceProvider);
  return ref.watch(remoteSourceProvider(active));
});

/// Auth state of the active source, for the guest-mode indicator. Null when the
/// on-device library is active (always read/write); otherwise the active remote
/// connection's [RemoteSessionState]. Re-runs when the active connection changes;
/// invalidate it after a sign-in to refresh the badge.
final sessionStatusProvider = FutureProvider<RemoteSessionState?>((ref) async {
  final source = ref.watch(activeSourceProvider);
  if (source is! RemoteSource) return null;
  return source.sessionState();
});

/// UI-driven query state for the main library views.
final libraryQueryProvider =
    NotifierProvider<LibraryQueryController, LibraryQuery>(LibraryQueryController.new);

/// Mutable query state for the main library views (search, filters, sort).
class LibraryQueryController extends Notifier<LibraryQuery> {
  @override
  LibraryQuery build() => const LibraryQuery();

  /// Sets the search term; empty/blank clears it.
  void setSearch(String? value) =>
      state = state.copyWith(search: (value?.isEmpty ?? true) ? null : value);

  /// Filters by media type ('comic' | 'book' | null for all).
  void setMediaType(String? value) => state = state.copyWith(mediaType: value);

  /// Sets the read-status facet.
  void setReadStatus(ReadStatus value) => state = state.copyWith(readStatus: value);

  /// Toggles the favorites-only filter.
  void toggleFavorites() => state = state.copyWith(favoritesOnly: !state.favoritesOnly);

  /// Sets the sort key and optional direction.
  void setSort(LibrarySort sort, {bool? descending}) =>
      state = state.copyWith(sort: sort, descending: descending);
}

/// Emits a distinct, increasing tick whenever the active source's catalog
/// changes (imports, progress, favorites). The list providers watch this so the
/// UI refreshes automatically — no manual invalidation from widgets needed.
///
/// The value must change each event: mapping every change to the same value
/// (e.g. null) makes Riverpod dedupe `AsyncData(null) == AsyncData(null)` and
/// skip the refetch after the first change.
///
/// Events are throttled (leading + trailing): Drift emits one event per write,
/// so a page turn (progress + history rows) or a bulk import would otherwise
/// refetch every catalog provider once per statement. The leading edge keeps a
/// single change (favorite toggle, one import) instantly visible; anything
/// arriving inside the window is coalesced into one trailing tick.
final libraryChangesProvider = StreamProvider<int>((ref) {
  const window = Duration(milliseconds: 400);
  var tick = 0;
  var pending = false;
  Timer? timer;
  final controller = StreamController<int>();

  void emit() {
    if (!controller.isClosed) controller.add(++tick);
  }

  void onWindowEnd() {
    if (pending) {
      pending = false;
      emit();
      timer = Timer(window, onWindowEnd); // keep coalescing sustained bursts
    } else {
      timer = null;
    }
  }

  final sub = ref.watch(activeSourceProvider).watchChanges().listen((_) {
    if (timer == null) {
      emit();
      timer = Timer(window, onWindowEnd);
    } else {
      pending = true;
    }
  });
  ref.onDispose(() {
    sub.cancel();
    timer?.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Catalog results for the active source + current query.
final comicsListProvider = FutureProvider<List<ComicSummary>>((ref) async {
  ref.watch(libraryChangesProvider); // re-run on any catalog change
  final source = ref.watch(activeSourceProvider);
  final query = ref.watch(libraryQueryProvider);
  return source.listComics(query);
});

/// "Continue reading" shelf for the active source, minus anything the user has
/// cleared (see [DismissedContinueController]) that hasn't been read further.
final continueReadingProvider = FutureProvider<List<ComicSummary>>((ref) async {
  ref.watch(libraryChangesProvider); // re-run on any catalog change
  final source = ref.watch(activeSourceProvider);
  final dismissed = ref.watch(dismissedContinueProvider);
  final items = await source.continueReading();
  if (dismissed.isEmpty) return items;
  // Keep an item if it was never cleared, or its position has since changed
  // (the user read further) — in which case it returns to the shelf.
  return items.where((c) => dismissed[c.id] != continueSignature(c)).toList();
});

/// Position fingerprint for a continue-reading entry. It changes whenever the
/// reader advances, which is how a cleared item later returns to the shelf.
String continueSignature(ComicSummary c) => '${c.lastPage ?? ''}|${c.lastLocation ?? ''}';

/// Comic ids the user has cleared from "Continue reading", each mapped to the
/// reading position it had at clear time.
///
/// This only hides entries from the shelf — it **never touches saved progress**,
/// so every book still resumes exactly where it left off. An entry stays hidden
/// only while its position is unchanged; reading further changes the signature
/// and the book reappears. The set is persisted (a clear survives restarts) and
/// works for both the local and remote sources, since it simply filters
/// whatever the active source returns — so it needs no server support.
class DismissedContinueController extends Notifier<Map<String, String>> {
  static const _prefKey = 'continue_reading_dismissed_v1';

  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);

  @override
  Map<String, String> build() {
    final raw = _prefs.getString(_prefKey);
    if (raw == null || raw.isEmpty) return const {};
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return decoded.map((k, v) => MapEntry(k, '$v'));
    } catch (_) {
      return const {};
    }
  }

  /// Hide [items] (the current in-progress set), remembering each one's
  /// position. Replaces any earlier set, which also prunes stale entries.
  Future<void> dismiss(Iterable<ComicSummary> items) async {
    final next = {for (final c in items) c.id: continueSignature(c)};
    state = next;
    await _prefs.setString(_prefKey, jsonEncode(next));
  }
}

/// Tracks which items the user cleared from the continue-reading shelf.
final dismissedContinueProvider =
    NotifierProvider<DismissedContinueController, Map<String, String>>(
        DismissedContinueController.new);

/// Clears the whole continue-reading shelf for the active source while keeping
/// every book's saved position. Fetches the full in-progress set (not just the
/// visible shelf) so nothing is left behind, records it as dismissed, and
/// refreshes the shelf. Returns how many items were cleared.
Future<int> clearContinueReading(WidgetRef ref) async {
  final source = ref.read(activeSourceProvider);
  final inProgress = await source.continueReading(limit: 1000);
  await ref.read(dismissedContinueProvider.notifier).dismiss(inProgress);
  ref.invalidate(continueReadingProvider);
  return inProgress.length;
}

/// "Want to read" / on-deck shelf for the active source. Empty for sources that
/// don't support library management (remote servers), so the shelf simply hides.
final wantToReadProvider = FutureProvider<List<ComicSummary>>((ref) async {
  ref.watch(libraryChangesProvider); // re-run on any catalog change
  return ref.watch(activeSourceProvider).wantToRead();
});

/// Likely-duplicate groups for the active source (Settings → Find duplicates).
final duplicatesProvider = FutureProvider<List<DuplicateGroup>>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).findDuplicates();
});

/// Comics for an arbitrary query — used by the tag/collection/series browsers
/// (each passes its own filtered [LibraryQuery]).
final browseComicsProvider =
    FutureProvider.family<List<ComicSummary>, LibraryQuery>((ref, query) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).listComics(query);
});

/// All tags with counts (Tags tab).
final tagsProvider = FutureProvider<List<TagCount>>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).listTags();
});

/// All collections with sizes/covers (Collections tab).
final librariesProvider = FutureProvider<List<LibraryInfo>>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).listLibraries();
});

/// Auto-derived series groups (Series tab).
final seriesProvider = FutureProvider<List<SeriesGroup>>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).listSeries();
});

/// Aggregated reading stats for the active source (null when unsupported, e.g.
/// a remote server). Refetches when the catalog changes so finishing a book
/// updates the numbers.
final readingStatsProvider = FutureProvider<ReadingStats?>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).readingStats();
});

/// Force every catalog provider to refetch from the active source.
///
/// Local sources live-refresh via [libraryChangesProvider] (Drift table
/// notifications), but a remote [RemoteSource] has no change stream — so when
/// the server's library is edited elsewhere (e.g. cleared and rebuilt) the app
/// keeps showing the cached results. Pull-to-refresh calls this to re-pull.
void invalidateLibraryProviders(WidgetRef ref) {
  ref.invalidate(comicsListProvider);
  ref.invalidate(continueReadingProvider);
  ref.invalidate(wantToReadProvider);
  ref.invalidate(browseComicsProvider);
  ref.invalidate(tagsProvider);
  ref.invalidate(librariesProvider);
  ref.invalidate(seriesProvider);
  // Covers load via NetworkImage, keyed by the thumbnail URL. A server-side
  // clear+rebuild can reissue the same comic ids (so the same URL now points at
  // a different image), which the image cache would otherwise serve stale.
  // Evicting here makes the explicit refresh gesture a true full reload.
  PaintingBinding.instance.imageCache
    ..clear()
    ..clearLiveImages();
}
