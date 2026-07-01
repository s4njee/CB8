/// Editable / scrapeable bibliographic metadata for a single catalog item.
///
/// Distinct from [ComicSummary] (the lightweight row the grids render): this is
/// the full editable record loaded on demand by the metadata editor, and the
/// shape that import-time ingestion (ComicInfo.xml / EPUB OPF) and external
/// scrapers fill in.
class ComicMetadata {
  /// Creates a metadata record. Only [title] is required; everything else is
  /// optional and null when unknown.
  const ComicMetadata({
    required this.title,
    this.seriesName,
    this.volumeNumber,
    this.chapterNumber,
    this.author,
    this.artist,
    this.genre,
    this.year,
    this.summary,
  });

  /// Display title.
  final String title;

  /// Series this entry belongs to.
  final String? seriesName;

  /// Volume number within the series.
  final double? volumeNumber;

  /// Chapter number within the series/volume.
  final double? chapterNumber;

  /// Author / writer.
  final String? author;

  /// Artist / illustrator.
  final String? artist;

  /// Genre label.
  final String? genre;

  /// Publication year.
  final int? year;

  /// Free-text synopsis.
  final String? summary;

  /// Returns a copy with the given fields overridden. Pass a non-null value to
  /// set a field; omitted fields are kept. To clear a field, pass an empty value
  /// where the caller normalizes empties to null before persisting.
  ComicMetadata copyWith({
    String? title,
    String? seriesName,
    double? volumeNumber,
    double? chapterNumber,
    String? author,
    String? artist,
    String? genre,
    int? year,
    String? summary,
  }) =>
      ComicMetadata(
        title: title ?? this.title,
        seriesName: seriesName ?? this.seriesName,
        volumeNumber: volumeNumber ?? this.volumeNumber,
        chapterNumber: chapterNumber ?? this.chapterNumber,
        author: author ?? this.author,
        artist: artist ?? this.artist,
        genre: genre ?? this.genre,
        year: year ?? this.year,
        summary: summary ?? this.summary,
      );
}
