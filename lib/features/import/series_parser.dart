/// Parse Series / Volume / Chapter info from a filename.
///
/// Direct Dart port of CB8's `src/main/seriesParser.ts`. Comic files encode the
/// series, volume, and chapter in their name (e.g. "Naruto v01 c003.cbz"); this
/// turns that into structured data so the library can group by
/// Series -> Volume -> Chapter. Behaviour and regexes are kept identical to the
/// TypeScript original so the unit-test corpus carries over.
library;

/// Parsed series metadata; any field may be null when unknown.
class SeriesInfo {
  /// Creates parsed series metadata.
  const SeriesInfo({this.seriesName, this.volumeNumber, this.chapterNumber});

  /// Series name, or null if none was parsed.
  final String? seriesName;

  /// Volume number, or null if none was parsed.
  final double? volumeNumber;

  /// Chapter number, or null if none was parsed.
  final double? chapterNumber;

  /// The empty result (all fields null).
  static const empty = SeriesInfo();
}

/// Collapse runs of whitespace and trim, for a tidy series name.
String normalizeSeriesName(String name) =>
    name.trim().replaceAll(RegExp(r'\s+'), ' ').trim();

// Volume/chapter markers require a prefix so series with numeric names
// ("7SEEDS", "20th Century Boys") don't get eaten.
final _volRe = RegExp(r'\b(?:v(?:ol(?:ume)?)?\.?\s*)(\d+(?:\.\d+)?)\b', caseSensitive: false);
final _chRe = RegExp(r'(?:\bc(?:h(?:apter)?)?\.?\s*|#)(\d+(?:\.\d+)?)(?:-\d+(?:\.\d+)?)?\b', caseSensitive: false);
final _yearRe = RegExp(r'\((\d{4})\)');

// Leading scanlation group: "[Stick]" or "(Group)" at the very start.
final _leadingGroupRe = RegExp(r'^\s*[\[(][^\])]+[\])]\s*');

// Trailing bracketed metadata: (Digital), (f), {Group}, [Tag], etc.
final _trailingTagRe = RegExp(r'\s*[\[({][^\])}]+[\])}]\s*$');

// Leading release-date prefix: "199305 X-Force ..." or "2010 Spider-Man ...".
final _leadingDateRe = RegExp(r'^\d{4,8}\s+');

// Bare 1-3 digit issue number following a volume marker, e.g. "v1 022".
final _volThenIssueRe = RegExp(r'\bv(?:ol(?:ume)?)?\.?\s*\d+(?:\.\d+)?\s+(\d{1,3})\b', caseSensitive: false);

/// Remove a leading release-date prefix (YYYY / YYYYMM / YYYYMMDD).
String stripLeadingReleaseDate(String s) => s.replaceFirst(_leadingDateRe, '');

/// Parse a filename into series name, volume, and chapter numbers.
SeriesInfo parseSeriesFromFilename(String filename) {
  if (filename.isEmpty) return SeriesInfo.empty;

  final noExt = filename.replaceFirst(RegExp(r'\.[^./\\]+$'), '');
  // Dots act as separators ("Title.v01") except when part of a decimal ("v1.5").
  final cleaned = noExt
      .replaceAll(RegExp(r'\.(?!\d)'), ' ')
      .replaceAll(RegExp(r'_+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .replaceFirst(_leadingDateRe, '');

  final volMatch = _volRe.firstMatch(cleaned);
  final chMatch = _chRe.firstMatch(cleaned);
  final double? volumeNumber = volMatch != null ? double.parse(volMatch.group(1)!) : null;
  double? chapterNumber = chMatch != null ? double.parse(chMatch.group(1)!) : null;

  // Volume but no explicit chapter: look for a bare 1-3 digit issue after it.
  if (volumeNumber != null && chapterNumber == null) {
    final issueMatch = _volThenIssueRe.firstMatch(cleaned);
    if (issueMatch != null) chapterNumber = double.parse(issueMatch.group(1)!);
  }

  if (volumeNumber == null && chapterNumber == null) return SeriesInfo.empty;

  // Series = everything before the first volume/chapter/year marker.
  var cutIndex = cleaned.length;
  for (final re in [_volRe, _chRe, _yearRe]) {
    final m = re.firstMatch(cleaned);
    if (m != null && m.start < cutIndex) cutIndex = m.start;
  }
  var series = cleaned.substring(0, cutIndex);

  // Strip leading scanlation group (only once, at start).
  series = series.replaceFirst(_leadingGroupRe, '');

  // Strip any trailing bracketed tags that fall between series and marker.
  String prev;
  do {
    prev = series;
    series = series.replaceFirst(_trailingTagRe, '');
  } while (series != prev);

  // Strip trailing separators.
  series = series.replaceFirst(RegExp(r'[\s\-–—|•·~]+$'), '').trim();

  final normalized = normalizeSeriesName(series);
  return SeriesInfo(
    seriesName: normalized.isNotEmpty ? normalized : null,
    volumeNumber: volumeNumber,
    chapterNumber: chapterNumber,
  );
}
