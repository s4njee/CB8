import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:cb8_flutter/features/import/media_probe.dart';
import 'package:cb8_flutter/features/reader/comic/cbz_archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;

/// Builds a CBZ on disk with [pages] solid-color JPEG images, named out of order
/// to also exercise the natural sort.
String _writeCbz(Directory dir, String name, int pages) {
  final archive = Archive();
  for (var i = 1; i <= pages; i++) {
    final image = img.Image(width: 40, height: 60);
    img.fill(image, color: img.ColorRgb8(0x22, 0x44, 0xAA));
    final jpg = img.encodeJpg(image, quality: 70);
    // Non-zero-padded names so "page2" must sort before "page10".
    archive.addFile(ArchiveFile('page$i.jpg', jpg.length, jpg));
  }
  final path = p.join(dir.path, name);
  File(path).writeAsBytesSync(Uint8List.fromList(ZipEncoder().encode(archive)!));
  return path;
}

/// Builds a CBT (tar) comic with [pages] solid-color JPEG images.
String _writeCbt(Directory dir, String name, int pages) {
  final archive = Archive();
  for (var i = 1; i <= pages; i++) {
    final image = img.Image(width: 40, height: 60);
    img.fill(image, color: img.ColorRgb8(0x10, 0x80, 0x30));
    final jpg = img.encodeJpg(image, quality: 70);
    archive.addFile(ArchiveFile('page$i.jpg', jpg.length, jpg));
  }
  final path = p.join(dir.path, name);
  File(path).writeAsBytesSync(Uint8List.fromList(TarEncoder().encode(archive)));
  return path;
}

void main() {
  late Directory tmp;
  setUp(() => tmp = Directory.systemTemp.createTempSync('cb8_cbz_test'));
  tearDown(() => tmp.deleteSync(recursive: true));

  test('probeFile reads a CBZ: page count, cover, comic media type', () async {
    final path = _writeCbz(tmp, 'Probe Series v01.cbz', 12);
    final result = await probeFile(path);

    expect(result, isNotNull);
    expect(result!.mediaType, 'comic');
    expect(result.pageCount, 12);
    expect(result.coverJpg, isNotNull);
    expect(img.decodeImage(result.coverJpg!), isNotNull); // cover is valid JPEG
    expect(result.series.seriesName, 'Probe Series');
    expect(result.series.volumeNumber, 1);
  });

  test('CbzArchive opens and yields decodable pages in natural order', () async {
    final path = _writeCbz(tmp, 'Reader.cbz', 11);
    final archive = await CbzArchive.open(path);

    expect(archive.pageCount, 11);
    // First and last pages decode to real images.
    expect(img.decodeImage(archive.pageBytes(0)), isNotNull);
    expect(img.decodeImage(archive.pageBytes(10)), isNotNull);
  });

  test('probeFile reads a CBT (tar) comic: page count and comic media type', () async {
    final path = _writeCbt(tmp, 'Tar Series v02.cbt', 8);
    final result = await probeFile(path);

    expect(result, isNotNull);
    expect(result!.mediaType, 'comic');
    expect(result.pageCount, 8);
    expect(result.coverJpg, isNotNull);
    expect(result.series.seriesName, 'Tar Series');
    expect(result.series.volumeNumber, 2);
  });

  test('CbzArchive opens a CBT (tar) and yields decodable pages', () async {
    final path = _writeCbt(tmp, 'Reader.cbt', 5);
    final archive = await CbzArchive.open(path);

    expect(archive.pageCount, 5);
    expect(img.decodeImage(archive.pageBytes(0)), isNotNull);
    expect(img.decodeImage(archive.pageBytes(4)), isNotNull);
  });

  test('AVIF and JXL are recognized as comic page extensions', () {
    // Newer page formats must not be silently dropped from an archive's listing
    // (actual decode depends on the platform codec, handled by the reader).
    expect(cbzImageExtensions, containsAll(<String>['.avif', '.jxl']));
  });

  test('probeFile ingests ComicInfo.xml metadata and file size from a CBZ', () async {
    final archive = Archive();
    final image = img.Image(width: 40, height: 60);
    img.fill(image, color: img.ColorRgb8(0x33, 0x33, 0x33));
    final jpg = img.encodeJpg(image, quality: 70);
    archive.addFile(ArchiveFile('page1.jpg', jpg.length, jpg));
    const info = '<?xml version="1.0"?><ComicInfo>'
        '<Title>Embedded Title</Title><Series>Embedded Series</Series>'
        '<Number>7</Number><Writer>W. Riter</Writer><Year>2015</Year>'
        '</ComicInfo>';
    final infoBytes = info.codeUnits;
    archive.addFile(ArchiveFile('ComicInfo.xml', infoBytes.length, infoBytes));
    final path = p.join(tmp.path, 'WithInfo v03.cbz');
    File(path).writeAsBytesSync(Uint8List.fromList(ZipEncoder().encode(archive)!));

    final result = await probeFile(path);
    expect(result, isNotNull);
    expect(result!.fileSize, greaterThan(0));
    expect(result.embedded.title, 'Embedded Title');
    expect(result.embedded.seriesName, 'Embedded Series');
    expect(result.embedded.chapterNumber, 7);
    expect(result.embedded.author, 'W. Riter');
    expect(result.embedded.year, 2015);
  });

  test('unsupported extension returns null', () async {
    final path = p.join(tmp.path, 'notes.txt');
    File(path).writeAsStringSync('hello');
    expect(await probeFile(path), isNull);
  });
}
