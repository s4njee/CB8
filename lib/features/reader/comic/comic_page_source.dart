import 'package:flutter/widgets.dart';

import 'cbz_archive.dart';

/// Where the comic reader gets each page's image — local archive bytes or remote
/// page-image URLs — so the reader is agnostic to the active source.
abstract class ComicPageSource {
  /// Number of pages available.
  int get pageCount;

  /// Image provider for the zero-based page [index].
  ImageProvider imageFor(int index);

  /// Release any held resources (e.g. an open PDF document). No-op for sources
  /// that hold nothing.
  void dispose() {}
}

/// Pages from an on-device CBZ archive.
class LocalCbzPageSource implements ComicPageSource {
  /// Wraps an already-opened [CbzArchive].
  LocalCbzPageSource(this._archive);
  final CbzArchive _archive;

  @override
  int get pageCount => _archive.pageCount;

  @override
  ImageProvider imageFor(int index) => MemoryImage(_archive.pageBytes(index));

  @override
  void dispose() {}
}

/// Pages fetched from a CB8 server's `/api/comics/:id/pages/:n` endpoint.
class RemotePageSource implements ComicPageSource {
  /// Creates a remote page source from a page-count and a URL builder.
  RemotePageSource({required this.pageCount, required this.urlFor, this.headers});

  @override
  final int pageCount;

  /// Builds the image URL for a zero-based page index.
  final String Function(int index) urlFor;

  /// HTTP headers (e.g. session cookie) sent with each page request.
  final Map<String, String>? headers;

  @override
  ImageProvider imageFor(int index) => NetworkImage(urlFor(index), headers: headers);

  @override
  void dispose() {}
}
