import 'package:cookie_jar/cookie_jar.dart';
import 'package:drift/drift.dart' show Value;
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
    final conn = await addConnection(name, url);
    final source = ref.read(remoteSourceProvider(conn));
    try {
      if (username != null && username.isNotEmpty) {
        await source.login(username, password ?? '');
      }
      if (!await source.isAuthenticated()) {
        await removeConnection(conn.id);
        return 'Could not authenticate. Check the URL and credentials.';
      }
      if (username != null && username.isNotEmpty) await setLastUsername(conn.id, username);
      await setActive(conn.id);
      return null;
    } catch (e) {
      await removeConnection(conn.id);
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
final libraryChangesProvider = StreamProvider<int>((ref) {
  var tick = 0;
  return ref.watch(activeSourceProvider).watchChanges().map((_) => ++tick);
});

/// Catalog results for the active source + current query.
final comicsListProvider = FutureProvider<List<ComicSummary>>((ref) async {
  ref.watch(libraryChangesProvider); // re-run on any catalog change
  final source = ref.watch(activeSourceProvider);
  final query = ref.watch(libraryQueryProvider);
  return source.listComics(query);
});

/// "Continue reading" shelf for the active source.
final continueReadingProvider = FutureProvider<List<ComicSummary>>((ref) async {
  ref.watch(libraryChangesProvider); // re-run on any catalog change
  final source = ref.watch(activeSourceProvider);
  return source.continueReading();
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

/// Auto-derived series groups (Folders tab).
final seriesProvider = FutureProvider<List<SeriesGroup>>((ref) async {
  ref.watch(libraryChangesProvider);
  return ref.watch(activeSourceProvider).listSeries();
});
