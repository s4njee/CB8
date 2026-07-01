/// Bibliographic metadata read from *inside* a file at import time:
/// `ComicInfo.xml` (CBZ/CBT comics) or the EPUB OPF package document. Every field
/// is nullable — only what the file actually declares is filled in, and the
/// importer merges these over the filename-parsed series info.
class EmbeddedMetadata {
  /// Creates an embedded-metadata record; all fields optional.
  const EmbeddedMetadata({
    this.title,
    this.seriesName,
    this.volumeNumber,
    this.chapterNumber,
    this.author,
    this.artist,
    this.genre,
    this.year,
    this.summary,
  });

  /// An empty record (nothing was found).
  static const empty = EmbeddedMetadata();

  /// Title.
  final String? title;

  /// Series name.
  final String? seriesName;

  /// Volume number.
  final double? volumeNumber;

  /// Chapter / issue number.
  final double? chapterNumber;

  /// Author / writer (may be a comma-separated list).
  final String? author;

  /// Artist / illustrator.
  final String? artist;

  /// Genre.
  final String? genre;

  /// Publication year.
  final int? year;

  /// Synopsis.
  final String? summary;

  /// Whether nothing was extracted.
  bool get isEmpty =>
      title == null &&
      seriesName == null &&
      volumeNumber == null &&
      chapterNumber == null &&
      author == null &&
      artist == null &&
      genre == null &&
      year == null &&
      summary == null;
}

/// Parses a ComicInfo.xml document (the ComicRack metadata sidecar bundled in
/// many CBZ files). Unknown/absent fields are left null.
EmbeddedMetadata parseComicInfoXml(String xml) {
  return EmbeddedMetadata(
    title: _tag(xml, 'Title'),
    seriesName: _tag(xml, 'Series'),
    volumeNumber: _toDouble(_tag(xml, 'Volume')),
    chapterNumber: _toDouble(_tag(xml, 'Number')),
    author: _tag(xml, 'Writer'),
    artist: _tag(xml, 'Penciller') ?? _tag(xml, 'Inker') ?? _tag(xml, 'CoverArtist'),
    genre: _tag(xml, 'Genre'),
    year: _toInt(_tag(xml, 'Year')),
    summary: _tag(xml, 'Summary'),
  );
}

/// Parses an EPUB OPF package document, reading the Dublin Core (`dc:*`) terms.
EmbeddedMetadata parseOpf(String xml) {
  final date = _tag(xml, 'date');
  return EmbeddedMetadata(
    title: _tag(xml, 'title'),
    author: _tag(xml, 'creator'),
    genre: _tag(xml, 'subject'),
    year: _yearFrom(date),
    summary: _tag(xml, 'description'),
  );
}

/// Returns the trimmed inner text of the first `<tag>`/`<ns:tag>` element, with
/// XML entities decoded; null if absent or empty. Matches an optional namespace
/// prefix so the same call works for ComicInfo (`<Title>`) and OPF (`<dc:title>`).
String? _tag(String xml, String localName) {
  final re = RegExp(
    '<(?:\\w+:)?$localName(?:\\s[^>]*)?>(.*?)</(?:\\w+:)?$localName>',
    caseSensitive: false,
    dotAll: true,
  );
  final m = re.firstMatch(xml);
  if (m == null) return null;
  final text = _decodeEntities(m.group(1)!).trim();
  return text.isEmpty ? null : text;
}

String _decodeEntities(String s) => s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAllMapped(RegExp(r'&#(\d+);'), (m) => String.fromCharCode(int.parse(m.group(1)!)))
    .replaceAll('&amp;', '&');

double? _toDouble(String? s) => s == null ? null : double.tryParse(s.trim());

int? _toInt(String? s) => s == null ? null : int.tryParse(s.trim());

int? _yearFrom(String? s) {
  if (s == null) return null;
  final m = RegExp(r'\d{4}').firstMatch(s);
  return m == null ? null : int.tryParse(m.group(0)!);
}
