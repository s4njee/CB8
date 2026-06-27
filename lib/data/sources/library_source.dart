import '../models/comic_summary.dart';
import '../models/groups.dart';

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
}

/// The seam that makes the app hybrid: the UI depends only on this interface,
/// while [LocalSource] (on-device Drift + file readers) and [RemoteSource]
/// (a CB8-compatible server) implement it.
abstract interface class LibrarySource {
  /// Stable identifier for the active connection ('local' or a server id).
  String get id;

  /// Human label shown in the connection selector.
  String get name;

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

  /// Persist reading progress for a book.
  Future<void> setProgress(String id, {int? page, String? location, bool? completed});

  /// Toggle favorite state.
  Future<void> setFavorite(String id, bool favorite);

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
}
