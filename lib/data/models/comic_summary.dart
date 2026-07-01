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

  /// Returns a copy with [sourceUri] overridden (used after resolving a remote
  /// download to a local temp path).
  ComicSummary copyWith({String? sourceUri}) => ComicSummary(
        id: id,
        title: title,
        pageCount: pageCount,
        mediaType: mediaType,
        coverThumbnail: coverThumbnail,
        coverUrl: coverUrl,
        lastPage: lastPage,
        lastLocation: lastLocation,
        lastPercent: lastPercent,
        completed: completed,
        isFavorite: isFavorite,
        seriesName: seriesName,
        volumeNumber: volumeNumber,
        chapterNumber: chapterNumber,
        extension: extension,
        sourceUri: sourceUri ?? this.sourceUri,
        imageHeaders: imageHeaders,
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
