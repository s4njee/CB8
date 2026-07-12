import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:path/path.dart' as p;

/// Comic archive (CBZ/CBT) decoding for the comic reader.
///
/// This is the "local pages" half behind `ComicPageSource`
/// (comic_page_source.dart): it finds the image entries in an archive and
/// serves their bytes in reading order. Import-time probing
/// (`features/import/media_probe.dart`) reuses the same helpers, so the pages
/// the reader shows always match what the importer counted.

/// Image entry extensions found inside comic archives. `avif`/`jxl` are listed
/// so newer-format pages aren't silently dropped; whether a given page actually
/// renders depends on the platform image codec (the reader shows a placeholder
/// for any page it can't decode).
const cbzImageExtensions = {
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.jxl',
};

/// Decode a comic archive's raw [bytes] into an [Archive], choosing the decoder
/// by content so both **CBZ** (zip) and **CBT** (tar) are supported. ZIP files
/// begin with the `PK` signature; anything else is treated as a tar.
///
/// CBR (RAR) and CB7 (7-Zip) are *not* handled — those formats need a native
/// decoder that the pure-Dart `archive` package doesn't provide.
Archive decodeComicArchive(Uint8List bytes) {
  final isZip = bytes.length >= 2 && bytes[0] == 0x50 && bytes[1] == 0x4B;
  return isZip ? ZipDecoder().decodeBytes(bytes) : TarDecoder().decodeBytes(bytes);
}

/// An opened CBZ archive with its image pages sorted in reading order.
///
/// Holds the decoded archive in memory and extracts page bytes on demand; the
/// reader keeps one instance alive for the duration of a reading session.
class CbzArchive {
  /// Wraps the already-sorted page entries (see [open]/[pagesOf]).
  CbzArchive(this._pages);

  final List<ArchiveFile> _pages;

  /// Memoized per-page bytes. Critical for performance: `MemoryImage`'s cache key
  /// is the byte buffer's *identity*, so returning a fresh copy each call (the
  /// old behaviour) defeated the image cache and forced a full re-decode of every
  /// visible page on each rebuild (e.g. tapping to toggle the reader chrome).
  /// Returning a stable instance lets the cache do its job.
  final Map<int, Uint8List> _bytes = {};

  /// Number of image pages in the archive.
  int get pageCount => _pages.length;

  /// Decompressed bytes for page [index] — the same instance on every call.
  Uint8List pageBytes(int index) => _bytes[index] ??= _decode(_pages[index]);

  static Uint8List _decode(ArchiveFile f) {
    final content = f.content;
    // `archive` already caches the decompressed content, so when it's a
    // Uint8List we reuse that instance directly (no extra copy).
    return content is Uint8List ? content : Uint8List.fromList(content as List<int>);
  }

  /// Reads and decodes the comic archive (CBZ/zip or CBT/tar) at [path] into an
  /// in-memory archive.
  static Future<CbzArchive> open(String path) async {
    final bytes = await File(path).readAsBytes();
    return CbzArchive(pagesOf(decodeComicArchive(bytes)));
  }

  /// The image entries of [archive], sorted naturally (page2 before page10).
  static List<ArchiveFile> pagesOf(Archive archive) {
    return archive.files
        .where((f) =>
            f.isFile && cbzImageExtensions.contains(p.extension(f.name).toLowerCase()))
        .toList()
      ..sort((a, b) => naturalCompare(a.name, b.name));
  }
}

/// Compare names so embedded numbers order numerically, not lexically.
int naturalCompare(String a, String b) {
  final ra = _chunk(a);
  final rb = _chunk(b);
  for (var i = 0; i < ra.length && i < rb.length; i++) {
    final na = int.tryParse(ra[i]);
    final nb = int.tryParse(rb[i]);
    final c = (na != null && nb != null)
        ? na.compareTo(nb)
        : ra[i].toLowerCase().compareTo(rb[i].toLowerCase());
    if (c != 0) return c;
  }
  return ra.length.compareTo(rb.length);
}

List<String> _chunk(String s) =>
    RegExp(r'\d+|\D+').allMatches(s).map((m) => m.group(0)!).toList();
