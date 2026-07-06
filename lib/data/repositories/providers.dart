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
import '../sources/library_source.dart';
import '../sources/local_source.dart';
import '../sources/remote_source.dart';

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

const _activeConnectionKey = 'active_connection';

/// Saved connections + which one is active. Drives [activeSourceProvider].
class ConnectionsState {
  /// Creates a connections state, defaulting to the local source as active.
  const ConnectionsState({this.connections = const [], this.activeId = Connection.localId});

  /// Saved remote connections.
  final List<Connection> connections;

  /// Id of the active source ([Connection.localId] for the on-device library).
  final String activeId;

  /// Returns a copy with the given fields overridden.
  ConnectionsState copyWith({List<Connection>? connections, String? activeId}) => ConnectionsState(
        connections: connections ?? this.connections,
        activeId: activeId ?? this.activeId,
      );

  /// The active remote [Connection], or null when the local source is active.
  Connection? get active =>
      activeId == Connection.localId ? null : connections.where((c) => c.id == activeId).firstOrNull;
}

/// Holds the saved connections and the active selection.
final connectionsProvider =
    NotifierProvider<ConnectionsController, ConnectionsState>(ConnectionsController.new);

/// Loads, mutates, and persists [ConnectionsState] (saved servers + active id).
class ConnectionsController extends Notifier<ConnectionsState> {
  AppDatabase get _db => ref.read(databaseProvider);
  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);

  @override
  ConnectionsState build() {
    final activeId = _prefs.getString(_activeConnectionKey) ?? Connection.localId;
    // Kick off async load; state updates when connections arrive.
    _load(activeId);
    return ConnectionsState(activeId: activeId);
  }

  Future<void> _load(String activeId) async {
    final rows = await _db.select(_db.connections).get();
    final connections = rows
        .map((r) => Connection(
              id: r.id.toString(),
              name: r.name,
              baseUrl: r.baseUrl,
              lastUsername: r.lastUsername,
            ))
        .toList();
    // Fall back to local if the persisted active connection no longer exists.
    final stillValid = activeId == Connection.localId || connections.any((c) => c.id == activeId);
    state = ConnectionsState(
      connections: connections,
      activeId: stillValid ? activeId : Connection.localId,
    );
  }

  /// Inserts a new connection row and reloads state, returning the saved model.
  Future<Connection> addConnection(String name, String baseUrl) async {
    final id = await _db.into(_db.connections).insert(
          ConnectionsCompanion.insert(name: name.trim(), baseUrl: baseUrl.trim()),
        );
    await _load(state.activeId);
    return state.connections.firstWhere((c) => c.id == id.toString());
  }

  /// Deletes a connection, falling back to the local source if it was active.
  Future<void> removeConnection(String id) async {
    final intId = int.tryParse(id);
    if (intId != null) {
      await (_db.delete(_db.connections)..where((c) => c.id.equals(intId))).go();
    }
    final nextActive = state.activeId == id ? Connection.localId : state.activeId;
    await _prefs.setString(_activeConnectionKey, nextActive);
    await _load(nextActive);
  }

  /// Switches the active source and persists the choice.
  Future<void> setActive(String id) async {
    await _prefs.setString(_activeConnectionKey, id);
    state = state.copyWith(activeId: id);
  }

  /// Remembers the last username used for a connection (pre-fills next login).
  Future<void> setLastUsername(String id, String username) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    await (_db.update(_db.connections)..where((c) => c.id.equals(intId)))
        .write(ConnectionsCompanion(lastUsername: Value(username)));
    await _load(state.activeId);
  }

  /// Add a server, optionally log in, verify the session, and make it active.
  /// Returns null on success or a human-readable error (rolling back the add).
  Future<String?> addAndConnect(String name, String url,
      {String? username, String? password}) async {
    final baseUrl = url.trim();
    final hasCreds = username != null && username.isNotEmpty;
    // base_url is UNIQUE and there's no separate "sign in" screen, so re-adding
    // an already-saved server is how you attach credentials to it. Reuse the
    // existing row instead of inserting — a duplicate INSERT throws before login
    // ever runs, which is exactly why a guest connection couldn't be upgraded.
    final existing = state.connections.where((c) => c.baseUrl == baseUrl).firstOrNull;
    final conn = existing ?? await addConnection(name, baseUrl);
    final source = ref.read(remoteSourceProvider(conn));
    try {
      if (hasCreds) {
        await source.login(username, password ?? '');
      }
      // With credentials, require a *real* login — guest access can't save
      // progress (writes 401), so silently accepting it would just recreate the
      // "nothing persists" bug. Without credentials, guest access is fine.
      final ok = hasCreds ? await source.isLoggedIn() : await source.isAuthenticated();
      if (!ok) {
        if (existing == null) await removeConnection(conn.id);
        return hasCreds
            ? 'Sign-in failed. Check the username and password.'
            : 'Could not connect. Check the URL.';
      }
      if (hasCreds) await setLastUsername(conn.id, username);
      await setActive(conn.id);
      return null;
    } catch (e) {
      if (existing == null) await removeConnection(conn.id);
      return 'Connection failed: ${_short(e)}';
    }
  }

  /// Re-authenticate an existing connection.
  Future<String?> login(String connId, String username, String password) async {
    final conn = state.connections.where((c) => c.id == connId).firstOrNull;
    if (conn == null) return 'Unknown connection';
    final source = ref.read(remoteSourceProvider(conn));
    try {
      await source.login(username, password);
      if (!await source.isAuthenticated()) return 'Login failed';
      await setLastUsername(connId, username);
      return null;
    } catch (e) {
      return 'Login failed: ${_short(e)}';
    }
  }

  static String _short(Object e) {
    final s = e.toString();
    return s.length > 80 ? '${s.substring(0, 80)}…' : s;
  }
}

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
