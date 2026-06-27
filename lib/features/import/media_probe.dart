import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:pdfrx/pdfrx.dart';

import '../../data/db/database.dart';
import '../reader/comic/cbz_archive.dart';
import 'series_parser.dart';

/// What a probe of a single file yields, ready to insert into the catalog.
class ProbeResult {
  /// Creates a probe result for one ingested file.
  ProbeResult({
    required this.mediaType,
    required this.pageCount,
    required this.coverJpg,
    required this.series,
  });

  /// `comic` or `book` — see [MediaTypes].
  final String mediaType;

  /// Page (comic/PDF) or content-document (EPUB) count.
  final int pageCount;

  /// JPEG-encoded cover thumbnail, or null if none could be extracted.
  final Uint8List? coverJpg;

  /// Series/volume/chapter parsed from the filename.
  final SeriesInfo series;
}

/// Comic archive extensions we ingest in v1. CBR/RAR deferred (see plan).
const comicExtensions = {'cbz'};

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
  final pages = CbzArchive.pagesOf(ZipDecoder().decodeBytes(bytes));

  Uint8List? cover;
  if (pages.isNotEmpty) {
    final raw = pages.first.content as List<int>;
    cover = _encodeCover(img.decodeImage(Uint8List.fromList(raw)));
  }
  return ProbeResult(
    mediaType: MediaTypes.comic,
    pageCount: pages.length,
    coverJpg: cover,
    series: series,
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
  return ProbeResult(
    mediaType: MediaTypes.book,
    pageCount: contentDocs,
    coverJpg: cover,
    series: series,
  );
}

/// Resize to fit within the 240x360 cover box (preserving aspect) and JPEG-encode.
Uint8List? _encodeCover(img.Image? src) {
  if (src == null) return null;
  final fitsByWidth = src.width / src.height > _coverW / _coverH;
  final resized = fitsByWidth
      ? img.copyResize(src, width: _coverW)
      : img.copyResize(src, height: _coverH);
  return img.encodeJpg(resized, quality: 82);
}
