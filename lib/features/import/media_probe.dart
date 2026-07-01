import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:collection/collection.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:pdfrx/pdfrx.dart';

import '../../data/db/database.dart';
import '../reader/comic/cbz_archive.dart';
import 'embedded_metadata.dart';
import 'series_parser.dart';

/// What a probe of a single file yields, ready to insert into the catalog.
class ProbeResult {
  /// Creates a probe result for one ingested file.
  ProbeResult({
    required this.mediaType,
    required this.pageCount,
    required this.coverJpg,
    required this.series,
    this.fileSize = 0,
    this.embedded = EmbeddedMetadata.empty,
  });

  /// `comic` or `book` — see [MediaTypes].
  final String mediaType;

  /// Page (comic/PDF) or content-document (EPUB) count.
  final int pageCount;

  /// JPEG-encoded cover thumbnail, or null if none could be extracted.
  final Uint8List? coverJpg;

  /// Series/volume/chapter parsed from the filename.
  final SeriesInfo series;

  /// Size of the source file in bytes (used for sorting and duplicate detection).
  final int fileSize;

  /// Metadata read from inside the file (ComicInfo.xml / EPUB OPF), if any.
  final EmbeddedMetadata embedded;
}

/// Comic archive extensions we ingest. CBZ (zip) and CBT (tar) are supported by
/// the pure-Dart `archive` package; CBR (RAR) / CB7 (7-Zip) need a native
/// decoder and are deferred.
const comicExtensions = {'cbz', 'cbt'};

/// Book extensions we ingest in v1.
const bookExtensions = {'pdf', 'epub'};

/// Union of all importable extensions.
const supportedExtensions = {...comicExtensions, ...bookExtensions};

/// Cover target box — matches CB8's 240x360 thumbnails.
const _coverW = 240;
const _coverH = 360;

/// Inspect a file and extract media type, page/chapter count, a cover thumbnail,
/// and parsed series info. Returns null for unsupported extensions.
///
/// NOTE: runs decode/resize on the calling isolate; moving the heavy work to a
/// background isolate (`compute`) is a follow-up for large libraries.
Future<ProbeResult?> probeFile(String path) async {
  final ext = p.extension(path).replaceFirst('.', '').toLowerCase();
  final series = parseSeriesFromFilename(p.basename(path));
  switch (ext) {
    case 'cbz':
    case 'cbt':
      return _probeCbz(path, series);
    case 'pdf':
      return _probePdf(path, series);
    case 'epub':
      return _probeEpub(path, series);
    default:
      return null;
  }
}

Future<ProbeResult> _probeCbz(String path, SeriesInfo series) async {
  final bytes = await File(path).readAsBytes();
  final archive = decodeComicArchive(bytes);
  final pages = CbzArchive.pagesOf(archive);

  Uint8List? cover;
  if (pages.isNotEmpty) {
    final raw = pages.first.content as List<int>;
    cover = _encodeCover(img.decodeImage(Uint8List.fromList(raw)));
  }

  // ComicInfo.xml is the de-facto comic metadata sidecar (ComicRack et al).
  var embedded = EmbeddedMetadata.empty;
  final infoEntry = archive.files.firstWhereOrNull(
    (f) => f.isFile && p.basename(f.name).toLowerCase() == 'comicinfo.xml',
  );
  if (infoEntry != null && infoEntry.size > 0) {
    try {
      embedded = parseComicInfoXml(_decodeUtf8(infoEntry.content as List<int>));
    } catch (_) {
      // Malformed sidecar — fall back to filename-parsed series only.
    }
  }

  return ProbeResult(
    mediaType: MediaTypes.comic,
    pageCount: pages.length,
    coverJpg: cover,
    series: series,
    fileSize: bytes.length,
    embedded: embedded,
  );
}

Future<ProbeResult> _probePdf(String path, SeriesInfo series) async {
  final doc = await PdfDocument.openFile(path);
  try {
    final count = doc.pages.length;
    Uint8List? cover;
    if (count > 0) {
      final page = doc.pages.first;
      final w = 480;
      final h = (w * page.height / page.width).round();
      final rendered = await page.render(width: w, height: h);
      if (rendered != null) {
        final src = img.Image.fromBytes(
          width: rendered.width,
          height: rendered.height,
          bytes: rendered.pixels.buffer,
          numChannels: 4,
        );
        cover = _encodeCover(src);
        rendered.dispose();
      }
    }
    return ProbeResult(
      mediaType: MediaTypes.book,
      pageCount: count,
      coverJpg: cover,
      series: series,
      fileSize: await File(path).length(),
    );
  } finally {
    await doc.dispose();
  }
}

Future<ProbeResult> _probeEpub(String path, SeriesInfo series) async {
  // Lightweight EPUB probe over the raw zip (an EPUB is a ZIP): approximate the
  // chapter count from content documents and pull a cover image. Full EPUB
  // parsing/rendering arrives with the EPUB reader milestone.
  final bytes = await File(path).readAsBytes();
  final archive = ZipDecoder().decodeBytes(bytes);

  final contentDocs = archive.files
      .where((f) => f.isFile && RegExp(r'\.x?html?$', caseSensitive: false).hasMatch(f.name))
      .length;

  final images = archive.files
      .where((f) =>
          f.isFile && cbzImageExtensions.contains(p.extension(f.name).toLowerCase()))
      .toList();
  final coverEntry = images.firstWhere(
    (f) => f.name.toLowerCase().contains('cover'),
    orElse: () => images.isNotEmpty ? images.first : ArchiveFile('', 0, <int>[]),
  );

  Uint8List? cover;
  if (coverEntry.size > 0) {
    cover = _encodeCover(img.decodeImage(Uint8List.fromList(coverEntry.content as List<int>)));
  }

  // The OPF package document carries Dublin Core metadata (title/author/etc.).
  var embedded = EmbeddedMetadata.empty;
  final opfEntry = archive.files.firstWhereOrNull(
    (f) => f.isFile && p.extension(f.name).toLowerCase() == '.opf',
  );
  if (opfEntry != null && opfEntry.size > 0) {
    try {
      embedded = parseOpf(_decodeUtf8(opfEntry.content as List<int>));
    } catch (_) {
      // Malformed OPF — skip.
    }
  }

  return ProbeResult(
    mediaType: MediaTypes.book,
    pageCount: contentDocs,
    coverJpg: cover,
    series: series,
    fileSize: bytes.length,
    embedded: embedded,
  );
}

/// Decodes archive entry bytes as UTF-8, tolerating malformed sequences.
String _decodeUtf8(List<int> bytes) => utf8.decode(bytes, allowMalformed: true);

/// Resize to fit within the 240x360 cover box (preserving aspect) and JPEG-encode.
Uint8List? _encodeCover(img.Image? src) {
  if (src == null) return null;
  final fitsByWidth = src.width / src.height > _coverW / _coverH;
  final resized = fitsByWidth
      ? img.copyResize(src, width: _coverW)
      : img.copyResize(src, height: _coverH);
  return img.encodeJpg(resized, quality: 82);
}
