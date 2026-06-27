import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:path/path.dart' as p;

/// Image entry extensions found inside comic archives.
const cbzImageExtensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'};

/// An opened CBZ archive with its image pages sorted in reading order.
///
/// Holds the decoded archive in memory and extracts page bytes on demand; the
/// reader keeps one instance alive for the duration of a reading session.
class CbzArchive {
  /// Wraps the already-sorted page entries (see [open]/[pagesOf]).
  CbzArchive(this._pages);

  final List<ArchiveFile> _pages;

  /// Number of image pages in the archive.
  int get pageCount => _pages.length;

  /// Decompressed bytes for page [index].
  Uint8List pageBytes(int index) =>
      Uint8List.fromList(_pages[index].content as List<int>);

  /// Reads and decodes the CBZ (zip) at [path] into an in-memory archive.
  static Future<CbzArchive> open(String path) async {
    final bytes = await File(path).readAsBytes();
    return CbzArchive(pagesOf(ZipDecoder().decodeBytes(bytes)));
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
