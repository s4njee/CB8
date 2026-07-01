import 'dart:typed_data';

import 'comic_summary.dart';

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

/// A set of catalog items that appear to be duplicates of one another, with a
/// human-readable [reason] for why they were grouped (e.g. identical file size
/// or matching title).
class DuplicateGroup {
  /// Creates a duplicate group.
  const DuplicateGroup({required this.reason, required this.items});

  /// Why these items were grouped (shown as the group header).
  final String reason;

  /// The duplicate items — always two or more, newest-imported last.
  final List<ComicSummary> items;
}

/// A folder CB8 watches for automatic ingestion (see `WatchedFolders` table).
class WatchedFolderInfo {
  /// Creates a watched-folder summary.
  const WatchedFolderInfo({
    required this.id,
    required this.path,
    required this.autoScan,
    this.lastScanned,
  });

  /// Watched-folder id.
  final String id;

  /// Absolute path of the watched directory.
  final String path;

  /// Whether it is rescanned automatically on app launch.
  final bool autoScan;

  /// When it was last scanned, or null if never.
  final DateTime? lastScanned;
}

