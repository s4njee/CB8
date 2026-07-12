// Saved-server connections: [ConnectionsState] plus the [ConnectionsController]
// that loads, mutates, and persists it. The active selection here decides what
// `activeSourceProvider` resolves to, so this file is effectively the switch
// between the on-device library and a remote CB8 server.
//
// This is a `part` of providers.dart (not its own library) so the split is
// invisible to callers: every feature keeps importing providers.dart and sees
// the exact same public surface.
part of 'providers.dart';

/// SharedPreferences key remembering which connection was last active.
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
///
/// Connection rows live in the database; the *active* choice lives in
/// SharedPreferences so it can be read synchronously in [build] — the app
/// starts on the right source without waiting for the async row load.
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

  /// Truncates an exception for the one-line error strings returned above.
  static String _short(Object e) {
    final s = e.toString();
    return s.length > 80 ? '${s.substring(0, 80)}…' : s;
  }
}
