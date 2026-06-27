import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

/// Local SQLite database, mirroring CB8's schema (`src/main/db/schema/create.ts`)
/// trimmed to the single-user-on-device case. Multi-user/auth tables live on the
/// server and are reached via the remote source instead.

/// Media kind for a catalog row. CB8 stores this as the `media_type` text column.
class MediaTypes {
  /// Paged image archive (CBZ) or PDF — read in the comic/PDF readers.
  static const comic = 'comic';

  /// Reflowable e-book (EPUB) — read in the EPUB reader.
  static const book = 'book';
}

/// The core catalog row for every comic/book — CB8's `comics` table.
@DataClassName('ComicRow')
class Comics extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Platform-stable handle to the file. On desktop this is a path; on mobile it
  /// is a security-scoped URI (SAF / UIDocumentPicker) — see plan risks.
  TextColumn get uri => text().unique()();

  /// Display title shown on cards and in the reader app bar.
  TextColumn get title => text()();

  /// Total page (comic/PDF) or content-document (EPUB) count; 0 until probed.
  IntColumn get pageCount => integer().withDefault(const Constant(0))();

  /// File size in bytes, for display and sorting.
  IntColumn get fileSize => integer().withDefault(const Constant(0))();

  /// 240x360 JPEG cover, stored inline like CB8's `cover_thumbnail` BLOB.
  BlobColumn get coverThumbnail => blob().nullable()();

  /// When the row was imported; defaults to now.
  DateTimeColumn get dateAdded => dateTime().withDefault(currentDateAndTime)();

  /// Reading progress. `lastPage` for comics/PDF; `lastLocation` is an EPUB CFI.
  IntColumn get lastPage => integer().nullable()();

  /// EPUB CFI (or other opaque locator) for resume; null for paged formats.
  TextColumn get lastLocation => text().nullable()();

  /// Timestamp of the most recent read, used by the Recent shelf.
  DateTimeColumn get lastRead => dateTime().nullable()();

  /// Whether the book has been read to the end.
  BoolColumn get completed => boolean().withDefault(const Constant(false))();

  /// `comic` or `book` — see [MediaTypes].
  TextColumn get mediaType => text().withDefault(const Constant(MediaTypes.comic))();

  // Parsed / scraped metadata.

  /// Series this entry belongs to, parsed from the filename when possible.
  TextColumn get seriesName => text().nullable()();

  /// Volume number within the series, if parsed.
  RealColumn get volumeNumber => real().nullable()();

  /// Chapter number within the series/volume, if parsed.
  RealColumn get chapterNumber => real().nullable()();

  /// Author/writer metadata.
  TextColumn get author => text().nullable()();

  /// Artist/illustrator metadata.
  TextColumn get artist => text().nullable()();

  /// Genre label.
  TextColumn get genre => text().nullable()();

  /// Publication year.
  IntColumn get year => integer().nullable()();

  /// Free-text synopsis.
  TextColumn get summary => text().nullable()();
}

/// Per-book page bookmarks — CB8's `bookmarks` (user scoping dropped locally).
class Bookmarks extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Owning comic; bookmarks are deleted with their comic.
  IntColumn get comicId => integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  /// Page index for comics/PDF, or the EPUB CFI string stuffed into [location].
  IntColumn get page => integer().nullable()();

  /// EPUB CFI (or other locator) when the format isn't page-indexed.
  TextColumn get location => text().nullable()();

  /// Optional user note attached to the bookmark.
  TextColumn get note => text().nullable()();

  /// Creation timestamp; defaults to now.
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}

/// Open/page-turn/complete log — CB8's `reading_history`, drives Recent shelf.
class ReadingHistory extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Owning comic; history is deleted with its comic.
  IntColumn get comicId => integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  /// Action name, e.g. `open`, `page`, `complete`.
  TextColumn get action => text()();

  /// Page index the action occurred on, if applicable.
  IntColumn get page => integer().nullable()();

  /// When the action happened; defaults to now.
  DateTimeColumn get timestamp => dateTime().withDefault(currentDateAndTime)();
}

/// Favorited books — CB8's `user_favorites`.
class Favorites extends Table {
  /// Favorited comic; the row is the (single-column) primary key.
  IntColumn get comicId =>
      integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  /// When the comic was favorited; defaults to now.
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {comicId};
}

/// Named, media-typed collections — CB8's `libraries`.
class Libraries extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Unique library name shown in the Collections tab.
  TextColumn get name => text().unique()();

  /// Media kind this library holds — see [MediaTypes].
  TextColumn get mediaType => text().withDefault(const Constant(MediaTypes.comic))();

  /// Creation timestamp; defaults to now.
  DateTimeColumn get dateCreated => dateTime().withDefault(currentDateAndTime)();
}

/// Join table linking [Comics] to the [Libraries] they belong to.
class LibraryComics extends Table {
  /// Owning library; membership rows are deleted with the library.
  IntColumn get libraryId =>
      integer().references(Libraries, #id, onDelete: KeyAction.cascade)();

  /// Member comic; membership rows are deleted with the comic.
  IntColumn get comicId =>
      integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  @override
  Set<Column> get primaryKey => {libraryId, comicId};
}

/// Series->Volume->Chapter grouping containers — CB8's `folders`.
class Folders extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Folder display name.
  TextColumn get name => text()();

  /// Comic whose cover represents the folder; cleared if that comic is removed.
  IntColumn get coverComicId =>
      integer().nullable().references(Comics, #id, onDelete: KeyAction.setNull)();

  /// Creation timestamp; defaults to now.
  DateTimeColumn get dateCreated => dateTime().withDefault(currentDateAndTime)();
}

/// Join table linking [Comics] to the [Folders] that contain them.
class FolderComics extends Table {
  /// Owning folder; membership rows are deleted with the folder.
  IntColumn get folderId =>
      integer().references(Folders, #id, onDelete: KeyAction.cascade)();

  /// Member comic; membership rows are deleted with the comic.
  IntColumn get comicId =>
      integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  @override
  Set<Column> get primaryKey => {folderId, comicId};
}

/// Free-form labels — CB8's `tags` / `comic_tags`.
class Tags extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// Unique tag label.
  TextColumn get name => text().unique()();
}

/// Join table linking [Comics] to their [Tags].
class ComicTags extends Table {
  /// Tagged comic; tag links are deleted with the comic.
  IntColumn get comicId =>
      integer().references(Comics, #id, onDelete: KeyAction.cascade)();

  /// Applied tag; links are deleted with the tag.
  IntColumn get tagId => integer().references(Tags, #id, onDelete: KeyAction.cascade)();

  @override
  Set<Column> get primaryKey => {comicId, tagId};
}

/// Saved remote servers (the hybrid model). Tokens live in the cookie jar, not
/// here — this table only remembers how to reach a CB8-compatible backend.
@DataClassName('ConnectionRow')
class Connections extends Table {
  /// Auto-incrementing primary key.
  IntColumn get id => integer().autoIncrement()();

  /// User-facing server name.
  TextColumn get name => text()();

  /// Unique base URL of the CB8-compatible backend.
  TextColumn get baseUrl => text().unique()();

  /// Last username used to sign in, pre-filled on the next login.
  TextColumn get lastUsername => text().nullable()();

  /// When the connection was saved; defaults to now.
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}

/// The Drift-generated database over every table in the local schema.
@DriftDatabase(
  tables: [
    Comics,
    Bookmarks,
    ReadingHistory,
    Favorites,
    Libraries,
    LibraryComics,
    Folders,
    FolderComics,
    Tags,
    ComicTags,
    Connections,
  ],
)
class AppDatabase extends _$AppDatabase {
  /// Opens the on-device database (app-data dir on every platform).
  AppDatabase() : super(_open());

  /// Test/in-memory constructor.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  static QueryExecutor _open() =>
      driftDatabase(name: 'cb8'); // app-data dir on every platform
}
