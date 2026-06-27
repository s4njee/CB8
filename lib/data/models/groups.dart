import 'dart:typed_data';

/// A tag with how many comics carry it (for the Tags browser).
class TagCount {
  /// Creates a tag/count pair.
  const TagCount({required this.name, required this.count});

  /// Tag label.
  final String name;

  /// Number of comics carrying the tag.
  final int count;
}

/// A named collection (CB8 "library") with its size and a representative cover.
class LibraryInfo {
  /// Creates a collection summary.
  const LibraryInfo({required this.id, required this.name, required this.count, this.cover});

  /// Collection id.
  final String id;

  /// Collection name.
  final String name;

  /// Number of comics in the collection.
  final int count;

  /// Representative cover bytes, if any.
  final Uint8List? cover;
}

/// An auto-derived series group (by parsed `seriesName`) with a cover.
class SeriesGroup {
  /// Creates a series group summary.
  const SeriesGroup({required this.name, required this.count, this.cover});

  /// Parsed series name.
  final String name;

  /// Number of entries in the series.
  final int count;

  /// Representative cover bytes, if any.
  final Uint8List? cover;
}
