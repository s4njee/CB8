import '../models/comic_metadata.dart';
import '../models/comic_summary.dart';
import '../models/groups.dart';
import '../models/reading_stats.dart';

/// How the library is sorted. Mirrors CB8's sort options
/// (`src/main/webServer/routes/comics.ts`).
enum LibrarySort {
  /// Alphabetical by title.
  title,

  /// By import date.
  dateAdded,

  /// By file size on disk.
  fileSize,

  /// By total page count.
  pageCount,

  /// By most-recent read time.
  lastRead,
}

/// Read-status facet, mirroring CB8's filter strips.
enum ReadStatus {
  /// No read-status filter.
  all,

  /// Never opened.
  unread,

  /// Opened but not finished.
  inProgress,

  /// Read to the end.
  completed,
}

/// Query parameters shared by every source.
class LibraryQuery {
  /// Creates a catalog query; all parameters are optional with sensible defaults.
  const LibraryQuery({
    this.search,
    this.mediaType,
    this.readStatus = ReadStatus.all,
    this.favoritesOnly = false,
    this.tag,
    this.libraryId,
    this.seriesName,
    this.hasBeenRead = false,
    this.sort = LibrarySort.dateAdded,
    this.descending = true,
    this.limit = 60,
    this.offset = 0,
  });

  /// Free-text search over title/metadata; null or empty matches everything.
  final String? search;

  /// 'comic' | 'book' | null (= all).
  final String? mediaType;

  /// Read-status facet to filter by.
  final ReadStatus readStatus;

  /// Restrict to favorited items only.
  final bool favoritesOnly;

  /// Restrict to comics carrying this tag.
  final String? tag;

  /// Restrict to comics in this collection (library) id.
  final String? libraryId;

  /// Restrict to comics in this parsed series.
  final String? seriesName;

  /// Restrict to comics that have been opened (have a last-read timestamp).
  final bool hasBeenRead;

  /// Sort key.
  final LibrarySort sort;

  /// Sort direction; true = descending.
  final bool descending;

  /// Maximum rows to return (page size).
  final int limit;

  /// Row offset for paging.
  final int offset;

  // Sentinel so copyWith can tell "leave unchanged" apart from "set to null".
  // Nullable fields (search/mediaType/tag/…) must be clearable — e.g. the "All"
  // chip sets mediaType to null, which `?? this.mediaType` would silently keep.
  static const Object _keep = Object();

  /// Returns a copy with the given fields overridden. Nullable fields use a
  /// [_keep] sentinel so passing `null` explicitly clears them.
  LibraryQuery copyWith({
    Object? search = _keep,
    Object? mediaType = _keep,
    ReadStatus? readStatus,
    bool? favoritesOnly,
    Object? tag = _keep,
    Object? libraryId = _keep,
    Object? seriesName = _keep,
    bool? hasBeenRead,
    LibrarySort? sort,
    bool? descending,
    int? limit,
    int? offset,
  }) {
    return LibraryQuery(
      search: identical(search, _keep) ? this.search : search as String?,
      mediaType: identical(mediaType, _keep) ? this.mediaType : mediaType as String?,
      readStatus: readStatus ?? this.readStatus,
      favoritesOnly: favoritesOnly ?? this.favoritesOnly,
      tag: identical(tag, _keep) ? this.tag : tag as String?,
      libraryId: identical(libraryId, _keep) ? this.libraryId : libraryId as String?,
      seriesName: identical(seriesName, _keep) ? this.seriesName : seriesName as String?,
      hasBeenRead: hasBeenRead ?? this.hasBeenRead,
      sort: sort ?? this.sort,
      descending: descending ?? this.descending,
      limit: limit ?? this.limit,
      offset: offset ?? this.offset,
    );
  }

  /// Value equality. Queries key Riverpod *family* providers (e.g.
  /// `browseComicsProvider`); without it, every rebuild that constructs an
  /// equal-but-new query created a fresh provider — a refetch per rebuild plus
  /// a permanently cached duplicate result set.
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LibraryQuery &&
          other.search == search &&
          other.mediaType == mediaType &&
          other.readStatus == readStatus &&
          other.favoritesOnly == favoritesOnly &&
          other.tag == tag &&
          other.libraryId == libraryId &&
          other.seriesName == seriesName &&
          other.hasBeenRead == hasBeenRead &&
          other.sort == sort &&
          other.descending == descending &&
          other.limit == limit &&
          other.offset == offset;

  @override
  int get hashCode => Object.hash(search, mediaType, readStatus, favoritesOnly,
      tag, libraryId, seriesName, hasBeenRead, sort, descending, limit, offset);
}

/// The seam that makes the app hybrid: the UI depends only on this interface,
/// while [LocalSource] (on-device Drift + file readers) and [RemoteSource]
/// (a CB8-compatible server) implement it.
abstract interface class LibrarySource {
  /// Stable identifier for the active connection ('local' or a server id).
  String get id;

  /// Human label shown in the connection selector.
  String get name;

  /// Whether this source supports owner-style library management — editing
  /// metadata, deleting items, the want-to-read shelf, duplicate detection, and
  /// watched folders. True for the on-device library; false for a remote CB8
  /// server (those features have no place in the server's REST contract). The UI
  /// reads this capability instead of branching on the concrete source type.
  bool get supportsLibraryManagement;

  /// Paged catalog query.
  Future<List<ComicSummary>> listComics(LibraryQuery query);

  /// "Continue reading" shelf — in-progress items, most-recent first.
  Future<List<ComicSummary>> continueReading({int limit = 20});

  /// Emits whenever the catalog changes, so views can refresh. Local sources
  /// back this with DB change notifications; remote sources may return an empty
  /// stream (or poll) until a sync mechanism exists.
  Stream<void> watchChanges();

  /// Single item detail.
  Future<ComicSummary?> getComic(String id);

  /// Persist reading progress for a book. [percent] is whole-book progress
  /// 0–100 for reflowable formats (EPUB), where a page index is meaningless.
  Future<void> setProgress(
    String id, {
    int? page,
    String? location,
    double? percent,
    bool? completed,
  });

  /// Toggle favorite state.
  Future<void> setFavorite(String id, bool favorite);

  // --- Metadata editing ---

  /// Full editable metadata for an item, or null if it doesn't exist. Only
  /// meaningful when [supportsLibraryManagement] is true.
  Future<ComicMetadata?> getMetadata(String id);

  /// Persist edited [meta] for an item. No-op when the source can't manage
  /// metadata (see [supportsLibraryManagement]).
  Future<void> updateMetadata(String id, ComicMetadata meta);

  /// Remove an item from the catalog (and delete its owned file for the local
  /// source). No-op when the source can't manage its library.
  Future<void> deleteComic(String id);

  // --- Want-to-read / on-deck shelf ---

  /// Whether [id] is on the want-to-read shelf.
  Future<bool> isWantToRead(String id);

  /// Add/remove [id] to/from the want-to-read shelf.
  Future<void> setWantToRead(String id, bool want);

  /// The want-to-read shelf — queued items, most-recently-added first.
  Future<List<ComicSummary>> wantToRead({int limit = 50});

  // --- Duplicate detection ---

  /// Groups of likely-duplicate items (by identical size/page-count or matching
  /// title). Empty when the source can't introspect duplicates.
  Future<List<DuplicateGroup>> findDuplicates();

  // --- Organization: tags ---

  /// All tags with their comic counts, for the Tags browser.
  Future<List<TagCount>> listTags();

  /// Tag names attached to a comic.
  Future<List<String>> tagsForComic(String id);

  /// Replace a comic's tags with [tags] (creating any new tag names).
  Future<void> setTagsForComic(String id, List<String> tags);

  // --- Organization: collections (libraries) ---

  /// All collections with sizes and a representative cover.
  Future<List<LibraryInfo>> listLibraries();

  /// Create a collection, returning its id.
  Future<String> createLibrary(String name);

  /// Add/remove a comic to/from a collection.
  Future<void> setInLibrary(String libraryId, String comicId, bool member);

  /// Collection ids a comic currently belongs to.
  Future<Set<String>> librariesForComic(String id);

  // --- Organization: series (auto from parsed metadata) ---

  /// Distinct parsed series with counts and a cover.
  Future<List<SeriesGroup>> listSeries();

  // --- Reading activity ---

  /// Aggregated reading stats for this source, or null when the source can't
  /// provide them (e.g. remote — the server doesn't expose an aggregate yet).
  /// Local computes them from the on-device reading-history log.
  Future<ReadingStats?> readingStats();
}
