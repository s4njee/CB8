/// A saved CB8 server (the hybrid "server mode"). Tokens/cookies live in the
/// cookie jar, not here — this just remembers how to reach a server.
class Connection {
  /// Creates a saved-server descriptor.
  const Connection({
    required this.id,
    required this.name,
    required this.baseUrl,
    this.lastUsername,
  });

  /// Stable connection id (the local source uses [localId]).
  final String id;

  /// User-facing server name.
  final String name;

  /// Base URL of the CB8-compatible backend.
  final String baseUrl;

  /// Last username used to sign in, pre-filled on the next login.
  final String? lastUsername;

  /// Sentinel id for the always-present on-device library.
  static const localId = 'local';

  @override
  bool operator ==(Object other) =>
      other is Connection &&
      other.id == id &&
      other.name == name &&
      other.baseUrl == baseUrl &&
      other.lastUsername == lastUsername;

  @override
  int get hashCode => Object.hash(id, name, baseUrl, lastUsername);
}
