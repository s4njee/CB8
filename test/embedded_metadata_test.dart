import 'package:cb8_flutter/features/import/embedded_metadata.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseComicInfoXml', () {
    test('reads the common ComicRack fields', () {
      const xml = '''
<?xml version="1.0"?>
<ComicInfo>
  <Title>The Big One</Title>
  <Series>Awesome Comic</Series>
  <Number>12</Number>
  <Volume>3</Volume>
  <Writer>Jane Writer</Writer>
  <Penciller>Sam Artist</Penciller>
  <Genre>Action</Genre>
  <Year>2019</Year>
  <Summary>A thrilling tale &amp; more.</Summary>
</ComicInfo>''';
      final m = parseComicInfoXml(xml);
      expect(m.title, 'The Big One');
      expect(m.seriesName, 'Awesome Comic');
      expect(m.chapterNumber, 12);
      expect(m.volumeNumber, 3);
      expect(m.author, 'Jane Writer');
      expect(m.artist, 'Sam Artist');
      expect(m.genre, 'Action');
      expect(m.year, 2019);
      expect(m.summary, 'A thrilling tale & more.'); // entity decoded
    });

    test('falls back to Inker then CoverArtist for artist', () {
      const xml = '<ComicInfo><Inker>Ink Person</Inker></ComicInfo>';
      expect(parseComicInfoXml(xml).artist, 'Ink Person');
    });

    test('missing fields stay null and isEmpty reflects an empty doc', () {
      final m = parseComicInfoXml('<ComicInfo></ComicInfo>');
      expect(m.title, isNull);
      expect(m.isEmpty, isTrue);
    });
  });

  group('parseOpf', () {
    test('reads Dublin Core terms with namespace prefixes', () {
      const xml = '''
<?xml version="1.0"?>
<package xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>A Fine Book</dc:title>
    <dc:creator opf:role="aut">A. Author</dc:creator>
    <dc:subject>Fantasy</dc:subject>
    <dc:date>2021-05-01</dc:date>
    <dc:description>An &lt;epic&gt; story.</dc:description>
  </metadata>
</package>''';
      final m = parseOpf(xml);
      expect(m.title, 'A Fine Book');
      expect(m.author, 'A. Author');
      expect(m.genre, 'Fantasy');
      expect(m.year, 2021);
      expect(m.summary, 'An <epic> story.');
    });

    test('handles a year-only date', () {
      const xml = '<package><dc:date>1998</dc:date></package>';
      expect(parseOpf(xml).year, 1998);
    });
  });
}
