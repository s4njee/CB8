import 'package:dio/dio.dart';

/// One candidate match from an external metadata provider, ready to apply to a
/// catalog item's editable fields.
class ScrapedResult {
  /// Creates a scraped candidate.
  const ScrapedResult({
    required this.source,
    required this.title,
    this.author,
    this.year,
    this.genre,
    this.summary,
    this.thumbnailUrl,
  });

  /// Provider label ('Google Books' / 'Open Library'), shown in the picker.
  final String source;

  /// Candidate title.
  final String title;

  /// Candidate author(s).
  final String? author;

  /// Candidate publication year.
  final int? year;

  /// Candidate genre / subject.
  final String? genre;

  /// Candidate synopsis.
  final String? summary;

  /// Optional cover thumbnail URL, for preview in the picker.
  final String? thumbnailUrl;

  /// A short subtitle for the picker row (author · year).
  String get subtitle => [
        if (author != null && author!.isNotEmpty) author,
        if (year != null) '$year',
      ].join(' · ');
}

/// Looks up book/comic metadata from keyless public providers.
///
/// Tries Google Books first (rich descriptions + categories); if it returns
/// nothing or errors, falls back to Open Library. Both are free and require no
/// API key, which keeps the feature dependency- and credential-free. Network
/// failures yield an empty list rather than throwing — the caller is a search UI.
class MetadataScraper {
  /// Creates a scraper with an optional injected [dio] (for tests).
  MetadataScraper({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  /// Searches for [query], returning up to [limit] candidates (possibly empty).
  Future<List<ScrapedResult>> search(String query, {int limit = 12}) async {
    final q = query.trim();
    if (q.isEmpty) return const [];
    final google = await _searchGoogleBooks(q, limit);
    if (google.isNotEmpty) return google;
    return _searchOpenLibrary(q, limit);
  }

  Future<List<ScrapedResult>> _searchGoogleBooks(String q, int limit) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        'https://www.googleapis.com/books/v1/volumes',
        queryParameters: {'q': q, 'maxResults': limit, 'printType': 'books'},
      );
      final items = (res.data?['items'] as List?) ?? const [];
      return items
          .map((e) => _fromGoogleVolume(e as Map<String, dynamic>))
          .whereType<ScrapedResult>()
          .toList();
    } catch (_) {
      return const [];
    }
  }

  ScrapedResult? _fromGoogleVolume(Map<String, dynamic> item) {
    final info = item['volumeInfo'] as Map<String, dynamic>?;
    if (info == null) return null;
    final title = info['title'] as String?;
    if (title == null || title.isEmpty) return null;
    final authors = (info['authors'] as List?)?.cast<String>();
    final categories = (info['categories'] as List?)?.cast<String>();
    final images = info['imageLinks'] as Map<String, dynamic>?;
    return ScrapedResult(
      source: 'Google Books',
      title: title,
      author: authors == null || authors.isEmpty ? null : authors.join(', '),
      year: _yearFrom(info['publishedDate'] as String?),
      genre: categories == null || categories.isEmpty ? null : categories.first,
      summary: info['description'] as String?,
      thumbnailUrl: (images?['thumbnail'] ?? images?['smallThumbnail']) as String?,
    );
  }

  Future<List<ScrapedResult>> _searchOpenLibrary(String q, int limit) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        'https://openlibrary.org/search.json',
        queryParameters: {'q': q, 'limit': limit},
      );
      final docs = (res.data?['docs'] as List?) ?? const [];
      return docs
          .map((e) => _fromOpenLibraryDoc(e as Map<String, dynamic>))
          .whereType<ScrapedResult>()
          .toList();
    } catch (_) {
      return const [];
    }
  }

  ScrapedResult? _fromOpenLibraryDoc(Map<String, dynamic> doc) {
    final title = doc['title'] as String?;
    if (title == null || title.isEmpty) return null;
    final authors = (doc['author_name'] as List?)?.cast<String>();
    final subjects = (doc['subject'] as List?)?.cast<String>();
    final coverId = doc['cover_i'];
    return ScrapedResult(
      source: 'Open Library',
      title: title,
      author: authors == null || authors.isEmpty ? null : authors.join(', '),
      year: (doc['first_publish_year'] as num?)?.toInt(),
      genre: subjects == null || subjects.isEmpty ? null : subjects.first,
      summary: null, // search.json doesn't return descriptions
      thumbnailUrl:
          coverId == null ? null : 'https://covers.openlibrary.org/b/id/$coverId-M.jpg',
    );
  }

  static int? _yearFrom(String? s) {
    if (s == null) return null;
    final m = RegExp(r'\d{4}').firstMatch(s);
    return m == null ? null : int.tryParse(m.group(0)!);
  }
}
