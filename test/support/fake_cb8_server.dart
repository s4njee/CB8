import 'dart:convert';
import 'dart:io';

/// Minimal in-process CB8 server for tests — faithful to the subset
/// [RemoteSource] uses. Crucially it mirrors the real server's auth model:
/// progress writes require a real session and are **401'd for guests**, which is
/// the behaviour that caused the "nothing saves" bug in the field.
class FakeCb8Server {
  FakeCb8Server({
    this.validUser = 'root',
    this.validPass = 'root',
    this.guestAccess = true,
  });

  /// Credentials that authenticate via POST /api/auth/login.
  final String validUser;
  final String validPass;

  /// Whether unauthenticated callers are treated as guests (read-only).
  bool guestAccess;

  static const _cookieName = 'cb8.session_token';
  HttpServer? _server;
  String? _sessionToken; // set once a valid login happens

  /// Progress writes the server *accepted* (i.e. from an authed caller).
  final List<Map<String, dynamic>> acceptedProgress = [];

  /// In-memory catalog; progress mutates these rows.
  final Map<int, Map<String, dynamic>> comics = {
    1: {
      'id': 1,
      'title': 'Test Book',
      'pageCount': 10,
      'fileExt': 'epub',
      'mediaType': 'book',
      'lastPage': null,
      'lastLocation': null,
      'favorited': false,
    },
  };

  String get baseUrl => 'http://${_server!.address.address}:${_server!.port}';

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen(_handle);
  }

  Future<void> stop() async => _server?.close(force: true);

  bool _isAuthed(HttpRequest req) =>
      _sessionToken != null &&
      req.cookies.any((c) => c.name == _cookieName && c.value == _sessionToken);

  Future<void> _handle(HttpRequest req) async {
    final res = req.response..headers.contentType = ContentType.json;
    final path = req.uri.path;

    Future<void> send(int code, Object body) async {
      res.statusCode = code;
      res.write(jsonEncode(body));
      await res.close();
    }

    if (req.method == 'GET' && path == '/api/auth/session') {
      final authed = _isAuthed(req);
      return send(200, {
        'authenticated': authed,
        'guestAccess': guestAccess,
        'user': authed ? {'id': 1, 'username': validUser} : null,
      });
    }

    if (req.method == 'POST' && path == '/api/auth/login') {
      final body = await _readJson(req);
      if (body['username'] == validUser && body['password'] == validPass) {
        _sessionToken = 'tok-${DateTime.now().microsecondsSinceEpoch}';
        res.cookies.add(Cookie(_cookieName, _sessionToken!)..path = '/');
        return send(200, {
          'ok': true,
          'user': {'id': 1, 'username': validUser},
        });
      }
      return send(401, {'error': 'Invalid credentials'});
    }

    final getComic = RegExp(r'^/api/comics/(\d+)$').firstMatch(path);
    if (req.method == 'GET' && getComic != null) {
      final c = comics[int.parse(getComic.group(1)!)];
      return c == null ? send(404, {'error': 'nf'}) : send(200, c);
    }

    final putProg = RegExp(r'^/api/comics/(\d+)/progress$').firstMatch(path);
    if (req.method == 'PUT' && putProg != null) {
      if (!_isAuthed(req)) return send(401, {'error': 'Unauthorized'});
      final id = int.parse(putProg.group(1)!);
      final body = await _readJson(req);
      acceptedProgress.add({'id': id, ...body});
      final c = comics[id];
      if (c != null) {
        if (body['page'] != null) c['lastPage'] = body['page'];
        if (body['location'] != null) c['lastLocation'] = body['location'];
      }
      return send(200, {'ok': true});
    }

    return send(404, {'error': 'not found'});
  }

  Future<Map<String, dynamic>> _readJson(HttpRequest req) async {
    final s = await utf8.decoder.bind(req).join();
    if (s.isEmpty) return {};
    try {
      return jsonDecode(s) as Map<String, dynamic>;
    } catch (_) {
      return {};
    }
  }
}
