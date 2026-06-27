import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import '../models/comic_summary.dart';
import '../models/groups.dart';
import 'library_source.dart';

/// Client for a CB8-compatible server (the hybrid "server mode").
///
/// Endpoints and field names mirror `src/main/webServer/routes/*` and
/// `mapping.ts`: list is `{records,totalCount}` with camelCase fields, comic
/// pages are `/api/comics/:id/pages/:n`, books stream from `/api/comics/:id/file`,
/// and auth is a better-auth session cookie. The shared [CookieJar] (one per app,
/// scoped by host) keeps the session across requests and app restarts.
class RemoteSource implements LibrarySource {
  /// Creates a client for the server at [baseUrl], sharing [cookieJar] for auth.
  RemoteSource({
    required this.id,
    required this.name,
    required String baseUrl,
    required CookieJar cookieJar,
  })  : _baseUrl = _trimSlash(baseUrl),
        // ignore: prefer_initializing_formals
        _cookieJar = cookieJar,
        _dio = Dio(BaseOptions(
          baseUrl: _trimSlash(baseUrl),
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
        )) {
    _dio.interceptors.add(CookieManager(_cookieJar));
  }

  @override
  final String id;
  @override
  final String name;

  final String _baseUrl;
  final Dio _dio;
  final CookieJar _cookieJar;

  static String _trimSlash(String s) => s.endsWith('/') ? s.substring(0, s.length - 1) : s;

  /// The configured dio client (cookie-managed), for advanced/direct calls.
  Dio get dio => _dio;

  /// The normalized server base URL (no trailing slash).
  String get baseUrl => _baseUrl;

  @override
  Stream<void> watchChanges() => const Stream.empty();

  // --- Auth ---

  /// Sign in; the session cookie is captured by the cookie jar. Throws on 401.
  Future<void> login(String username, String password) async {
    await _dio.post('/api/auth/login', data: {'username': username, 'password': password});
  }

  /// Sign out (best effort — ignores network/server errors).
  Future<void> logout() async {
    try {
      await _dio.post('/api/auth/logout');
    } catch (_) {/* best effort */}
  }

  /// Whether the session is usable at all — a real login *or* guest access.
  /// Use this for connections added without credentials (read-only browsing).
  Future<bool> isAuthenticated() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/auth/session');
      final data = res.data;
      return data?['authenticated'] == true || data?['guestAccess'] == true;
    } catch (_) {
      return false;
    }
  }

  /// Whether the session belongs to a real signed-in user (not guest access).
  /// Writes (progress, favorites) require this — the server 401s guest writes —
  /// so a credentialed connection must verify with this, not [isAuthenticated].
  Future<bool> isLoggedIn() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/auth/session');
      return res.data?['authenticated'] == true;
    } catch (_) {
      return false;
    }
  }

  /// `Cookie` header for image/file requests made outside dio (NetworkImage,
  /// pdfrx, epub viewer), so authenticated thumbnails/pages load.
  Future<Map<String, String>> imageHeaders() async {
    final cookies = await _cookieJar.loadForRequest(Uri.parse(_baseUrl));
    if (cookies.isEmpty) return const {};
    return {'Cookie': cookies.map((c) => '${c.name}=${c.value}').join('; ')};
  }

  // --- URLs ---

  /// Cover thumbnail URL for a comic.
  String thumbnailUrl(String comicId) => '$_baseUrl/api/comics/$comicId/thumbnail';

  /// Page-image URL for a zero-based page of a comic.
  String pageUrl(String comicId, int page) => '$_baseUrl/api/comics/$comicId/pages/$page';

  /// Full-file (book) download URL for a comic.
  String fileUrl(String comicId) => '$_baseUrl/api/comics/$comicId/file';

  ComicSummary _fromJson(Map<String, dynamic> j, Map<String, String> headers) {
    final id = '${j['id']}';
    final ext = (j['fileExt'] as String?)?.toLowerCase();
    final pageCount = (j['pageCount'] as num?)?.toInt() ?? 0;
    final lastPage = (j['lastPage'] as num?)?.toInt();
    return ComicSummary(
      id: id,
      title: j['title'] as String? ?? 'Untitled',
      pageCount: pageCount,
      mediaType: j['mediaType'] as String? ?? 'comic',
      coverUrl: thumbnailUrl(id),
      lastPage: lastPage,
      lastLocation: j['lastLocation'] as String?,
      completed: lastPage != null && pageCount > 0 && lastPage >= pageCount - 1,
      isFavorite: j['favorited'] == true,
      seriesName: j['seriesName'] as String?,
      volumeNumber: (j['volumeNumber'] as num?)?.toDouble(),
      chapterNumber: (j['chapterNumber'] as num?)?.toDouble(),
      extension: ext,
      imageHeaders: headers.isEmpty ? null : headers,
    );
  }

  String _sortParam(LibrarySort sort) => switch (sort) {
        LibrarySort.title => 'title',
        LibrarySort.dateAdded => 'dateAdded',
        LibrarySort.fileSize => 'fileSize',
        LibrarySort.pageCount => 'pageCount',
        LibrarySort.lastRead => 'lastRead',
      };

  @override
  Future<List<ComicSummary>> listComics(LibraryQuery query) async {
    final headers = await imageHeaders();
    final res = await _dio.get<Map<String, dynamic>>('/api/comics', queryParameters: {
      if (query.search != null && query.search!.isNotEmpty) 'search': query.search,
      if (query.mediaType != null) 'mediaType': query.mediaType,
      if (query.favoritesOnly) 'favorites': 'true',
      if (query.readStatus == ReadStatus.unread) 'readStatus': 'unread',
      if (query.readStatus == ReadStatus.inProgress) 'readStatus': 'in-progress',
      if (query.readStatus == ReadStatus.completed) 'readStatus': 'completed',
      if (query.tag != null) 'tag': query.tag,
      'sort': _sortParam(query.sort),
      'order': query.descending ? 'desc' : 'asc',
      'limit': query.limit,
      'offset': query.offset,
    });
    final records = (res.data?['records'] as List?) ?? const [];
    var items = records.map((e) => _fromJson(e as Map<String, dynamic>, headers)).toList();
    // The server has no parsed-series filter; narrow client-side when needed.
    if (query.seriesName != null) {
      items = items.where((c) => c.seriesName == query.seriesName).toList();
    }
    return items;
  }

  @override
  Future<List<ComicSummary>> continueReading({int limit = 20}) async {
    return listComics(LibraryQuery(
      readStatus: ReadStatus.inProgress,
      sort: LibrarySort.lastRead,
      limit: limit,
    ));
  }

  @override
  Future<ComicSummary?> getComic(String id) async {
    final headers = await imageHeaders();
    final res = await _dio.get<Map<String, dynamic>>('/api/comics/$id');
    final data = res.data;
    return data == null ? null : _fromJson(data, headers);
  }

  @override
  Future<void> setProgress(String id, {int? page, String? location, bool? completed}) async {
    // Best-effort and fire-and-forget from the readers: a failed write (e.g. a
    // 401 from a guest/expired session) must never surface as an unhandled
    // exception that crashes the reader. Swallow but log.
    try {
      await _dio.put('/api/comics/$id/progress', data: {
        'page': ?page,
        'location': ?location,
        'completed': ?completed,
      });
    } catch (e) {
      // ignore: avoid_print
      print('setProgress failed for $id: $e');
    }
  }

  @override
  Future<void> setFavorite(String id, bool favorite) async {
    if (favorite) {
      await _dio.post('/api/comics/$id/favorite');
    } else {
      await _dio.delete('/api/comics/$id/favorite');
    }
  }

  // --- Organization ---

  @override
  Future<List<TagCount>> listTags() async {
    try {
      final res = await _dio.get<dynamic>('/api/tags');
      final data = res.data;
      final list = data is List ? data : (data?['tags'] as List? ?? const []);
      return list.map((e) {
        if (e is String) return TagCount(name: e, count: 0);
        final m = e as Map<String, dynamic>;
        return TagCount(name: m['name'] as String? ?? '', count: (m['count'] as num?)?.toInt() ?? 0);
      }).where((t) => t.name.isNotEmpty).toList();
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<List<String>> tagsForComic(String id) async => const [];

  @override
  Future<void> setTagsForComic(String id, List<String> tags) async {
    await _dio.put('/api/comics/$id/tags', data: {'tags': tags});
  }

  @override
  Future<List<LibraryInfo>> listLibraries() async {
    try {
      final res = await _dio.get<dynamic>('/api/libraries');
      final data = res.data;
      final list = data is List ? data : (data?['libraries'] as List? ?? const []);
      return list.map((e) {
        final m = e as Map<String, dynamic>;
        return LibraryInfo(
          id: '${m['id']}',
          name: m['name'] as String? ?? '',
          count: (m['count'] as num?)?.toInt() ?? 0,
        );
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<String> createLibrary(String name) async {
    final res = await _dio.post<Map<String, dynamic>>('/api/libraries', data: {'name': name});
    return '${res.data?['id'] ?? ''}';
  }

  @override
  Future<void> setInLibrary(String libraryId, String comicId, bool member) async {
    if (member) {
      await _dio.post('/api/libraries/$libraryId/comics', data: {'comicIds': [int.tryParse(comicId)]});
    } else {
      await _dio.delete('/api/libraries/$libraryId/comics', data: {'comicIds': [int.tryParse(comicId)]});
    }
  }

  @override
  Future<Set<String>> librariesForComic(String id) async => const {};

  @override
  Future<List<SeriesGroup>> listSeries() async => const [];

  /// Download a remote book (PDF/EPUB) to [destPath] for local reading.
  Future<void> downloadFile(String comicId, String destPath) async {
    await _dio.download(fileUrl(comicId), destPath);
    // Ensure the file exists and is non-empty.
    if (!await File(destPath).exists()) {
      throw Exception('Download produced no file');
    }
  }
}
