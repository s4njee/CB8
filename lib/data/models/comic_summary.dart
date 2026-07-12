import 'dart:typed_data';

/// Source-agnostic view of a catalog row used across the UI.
///
/// Both [LocalSource] (Drift rows) and [RemoteSource] (CB8 REST JSON) map into
/// this so screens never branch on where content came from.
class ComicSummary {
  /// Creates a source-agnostic catalog entry.
  const ComicSummary({
    required this.id,
    required this.title,
    required this.pageCount,
    required this.mediaType,
    this.coverThumbnail,
    this.coverUrl,
    this.lastPage,
    this.lastLocation,
    this.lastPercent,
    this.completed = false,
    this.isFavorite = false,
    this.seriesName,
    this.volumeNumber,
    this.chapterNumber,
    this.extension,
    this.sourceUri,
    this.imageHeaders,
    this.originConnectionId,
    this.originComicId,
  });

  /// Stable id within the active source.
  final String id;

  /// Display title.
  final String title;

  /// Total pages (comic/PDF) or content documents (EPUB).
  final int pageCount;

  /// 'comic' or 'book' (see [MediaTypes]).
  final String mediaType;

  /// Inline cover bytes (local source). Mutually exclusive with [coverUrl].
  final Uint8List? coverThumbnail;

  /// Remote cover endpoint (remote source).
  final String? coverUrl;

  /// Last page read (comics/PDF); null if never opened.
  final int? lastPage;

  /// Last EPUB CFI (or other locator); null for paged formats / unopened.
  final String? lastLocation;

  /// Whole-book reading position as a 0–100 percentage for reflowable formats
  /// (EPUB), which have no meaningful `lastPage`. Null for paged formats and
  /// unopened items. Drives [progress] when present.
  final double? lastPercent;

  /// Whether the item has been read to the end.
  final bool completed;

  /// Whether the item is favorited.
  final bool isFavorite;

  /// Parsed series name, if any.
  final String? seriesName;

  /// Parsed volume number, if any.
  final double? volumeNumber;

  /// Parsed chapter number, if any.
  final double? chapterNumber;

  /// Lowercase file extension without the dot ('cbz' | 'pdf' | 'epub'), for the
  /// format badge on cards. May be null for remote items that don't expose it.
  final String? extension;

  /// For local items, the on-device file path the readers open. Null for remote
  /// items (those read via [coverUrl]/page URLs on the [RemoteSource]).
  final String? sourceUri;

  /// HTTP headers (e.g. session cookie) needed to fetch [coverUrl]/page images
  /// for a remote item. Null for local items.
  final Map<String, String>? imageHeaders;

  /// For a downloaded-for-offline copy, the connection id of the server it came
  /// from; null for imported items and for remote items themselves. Paired with
  /// [originComicId] to sync this copy's progress back to its server row.
  final String? originConnectionId;

  /// For a downloaded copy, this item's id on its origin server; null otherwise.
  final String? originComicId;

  /// True when this local row is a downloaded copy linked to a server item, so
  /// its progress can be mirrored back (see the reader's sync path).
  bool get hasServerOrigin =>
      originConnectionId != null && originComicId != null;

  /// Returns a copy with the given fields overridden; omitted fields are kept
  /// (none of these can be cleared back to null through this method).
  /// [sourceUri] is overridden after resolving a remote download to a local
  /// temp path; the progress fields back [withProgress].
  ComicSummary copyWith({
    String? sourceUri,
    int? lastPage,
    String? lastLocation,
    double? lastPercent,
    bool? completed,
  }) =>
      ComicSummary(
        id: id,
        title: title,
        pageCount: pageCount,
        mediaType: mediaType,
        coverThumbnail: coverThumbnail,
        coverUrl: coverUrl,
        lastPage: lastPage ?? this.lastPage,
        lastLocation: lastLocation ?? this.lastLocation,
        lastPercent: lastPercent ?? this.lastPercent,
        completed: completed ?? this.completed,
        isFavorite: isFavorite,
        seriesName: seriesName,
        volumeNumber: volumeNumber,
        chapterNumber: chapterNumber,
        extension: extension,
        sourceUri: sourceUri ?? this.sourceUri,
        imageHeaders: imageHeaders,
        originConnectionId: originConnectionId,
        originComicId: originComicId,
      );

  /// Returns a copy with reading-position fields overridden — used when adopting
  /// a newer position pulled from a downloaded copy's origin server.
  ComicSummary withProgress({
    int? lastPage,
    String? lastLocation,
    double? lastPercent,
    bool? completed,
  }) =>
      copyWith(
        lastPage: lastPage,
        lastLocation: lastLocation,
        lastPercent: lastPercent,
        completed: completed,
      );

  /// Fraction read in the range 0..1, for the progress bar drawn on the card.
  double get progress {
    if (completed) return 1;
    // Reflowable formats (EPUB) track a whole-book percentage rather than a
    // page index; prefer it when present.
    if (lastPercent != null) return (lastPercent! / 100).clamp(0, 1).toDouble();
    if (pageCount <= 0 || lastPage == null) return 0;
    return (lastPage! / (pageCount - 1)).clamp(0, 1).toDouble();
  }

  /// Whether reading has started but isn't finished.
  bool get inProgress => progress > 0 && !completed;
}
