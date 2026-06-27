import 'package:drift/drift.dart';

import '../db/database.dart';
import '../models/comic_summary.dart';
import '../models/groups.dart';
import 'library_source.dart';

/// On-device library backed by the Drift database.
///
/// Search currently uses a `LIKE` scan over title/series/author; the FTS5
/// virtual table from the plan is a follow-up in the library milestone.
class LocalSource implements LibrarySource {
  /// Wraps the app's Drift [AppDatabase].
  LocalSource(this._db);

  final AppDatabase _db;

  @override
  String get id => 'local';

  @override
  String get name => 'This device';

  @override
  Stream<void> watchChanges() => _db.tableUpdates().map((_) {});

  ComicSummary _toSummary(ComicRow row, {required bool favorite}) {
    final uri = row.uri;
    final dot = uri.lastIndexOf('.');
    final ext = dot >= 0 ? uri.substring(dot + 1).toLowerCase() : null;
    return ComicSummary(
      id: row.id.toString(),
      title: row.title,
      pageCount: row.pageCount,
      mediaType: row.mediaType,
      coverThumbnail: row.coverThumbnail,
      lastPage: row.lastPage,
      lastLocation: row.lastLocation,
      completed: row.completed,
      isFavorite: favorite,
      seriesName: row.seriesName,
      volumeNumber: row.volumeNumber,
      chapterNumber: row.chapterNumber,
      extension: ext,
      sourceUri: uri,
    );
  }

  @override
  Future<List<ComicSummary>> listComics(LibraryQuery query) async {
    final favIds = await _favoriteIds();
    final q = _db.select(_db.comics);

    if (query.mediaType != null) {
      q.where((t) => t.mediaType.equals(query.mediaType!));
    }
    final search = query.search?.trim();
    if (search != null && search.isNotEmpty) {
      final like = '%$search%';
      q.where((t) =>
          t.title.like(like) | t.seriesName.like(like) | t.author.like(like));
    }
    switch (query.readStatus) {
      case ReadStatus.unread:
        q.where((t) => t.lastPage.isNull() & t.completed.equals(false));
      case ReadStatus.inProgress:
        q.where((t) => t.lastPage.isNotNull() & t.completed.equals(false));
      case ReadStatus.completed:
        q.where((t) => t.completed.equals(true));
      case ReadStatus.all:
        break;
    }
    if (query.favoritesOnly) {
      if (favIds.isEmpty) return const [];
      q.where((t) => t.id.isIn(favIds));
    }
    if (query.tag != null) {
      final sub = _db.selectOnly(_db.comicTags)
        ..addColumns([_db.comicTags.comicId])
        ..join([innerJoin(_db.tags, _db.tags.id.equalsExp(_db.comicTags.tagId))])
        ..where(_db.tags.name.equals(query.tag!));
      q.where((t) => t.id.isInQuery(sub));
    }
    if (query.libraryId != null) {
      final libId = int.tryParse(query.libraryId!);
      if (libId == null) return const [];
      final sub = _db.selectOnly(_db.libraryComics)
        ..addColumns([_db.libraryComics.comicId])
        ..where(_db.libraryComics.libraryId.equals(libId));
      q.where((t) => t.id.isInQuery(sub));
    }
    if (query.seriesName != null) {
      q.where((t) => t.seriesName.equals(query.seriesName!));
    }
    if (query.hasBeenRead) {
      q.where((t) => t.lastRead.isNotNull());
    }

    // Series views read best ordered by volume then chapter; everything else
    // uses the requested sort.
    if (query.seriesName != null) {
      q.orderBy([
        (t) => OrderingTerm(expression: t.volumeNumber, nulls: NullsOrder.last),
        (t) => OrderingTerm(expression: t.chapterNumber, nulls: NullsOrder.last),
        (t) => OrderingTerm(expression: t.title),
      ]);
    } else {
      final mode = query.descending ? OrderingMode.desc : OrderingMode.asc;
      q.orderBy([
        (t) => switch (query.sort) {
              LibrarySort.title => OrderingTerm(expression: t.title, mode: mode),
              LibrarySort.dateAdded => OrderingTerm(expression: t.dateAdded, mode: mode),
              LibrarySort.fileSize => OrderingTerm(expression: t.fileSize, mode: mode),
              LibrarySort.pageCount => OrderingTerm(expression: t.pageCount, mode: mode),
              LibrarySort.lastRead => OrderingTerm(expression: t.lastRead, mode: mode),
            },
      ]);
    }
    q.limit(query.limit, offset: query.offset);

    final rows = await q.get();
    return rows
        .map((r) => _toSummary(r, favorite: favIds.contains(r.id)))
        .toList();
  }

  @override
  Future<List<ComicSummary>> continueReading({int limit = 20}) async {
    final favIds = await _favoriteIds();
    final q = _db.select(_db.comics)
      ..where((t) =>
          t.lastPage.isNotNull() & t.completed.equals(false) & t.lastRead.isNotNull())
      ..orderBy([(t) => OrderingTerm(expression: t.lastRead, mode: OrderingMode.desc)])
      ..limit(limit);
    final rows = await q.get();
    return rows.map((r) => _toSummary(r, favorite: favIds.contains(r.id))).toList();
  }

  @override
  Future<ComicSummary?> getComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return null;
    final row = await (_db.select(_db.comics)..where((t) => t.id.equals(intId)))
        .getSingleOrNull();
    if (row == null) return null;
    final favIds = await _favoriteIds();
    return _toSummary(row, favorite: favIds.contains(row.id));
  }

  @override
  Future<void> setProgress(String id, {int? page, String? location, bool? completed}) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    await (_db.update(_db.comics)..where((t) => t.id.equals(intId))).write(
      ComicsCompanion(
        lastPage: page == null ? const Value.absent() : Value(page),
        lastLocation: location == null ? const Value.absent() : Value(location),
        completed: completed == null ? const Value.absent() : Value(completed),
        lastRead: Value(DateTime.now()),
      ),
    );
    await _db.into(_db.readingHistory).insert(
          ReadingHistoryCompanion.insert(
            comicId: intId,
            action: completed == true ? 'completed' : 'page-turned',
            page: Value(page),
          ),
        );
  }

  @override
  Future<void> setFavorite(String id, bool favorite) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    if (favorite) {
      await _db.into(_db.favorites).insert(
            FavoritesCompanion(comicId: Value(intId)),
            mode: InsertMode.insertOrIgnore,
          );
    } else {
      await (_db.delete(_db.favorites)..where((t) => t.comicId.equals(intId))).go();
    }
  }

  Future<Set<int>> _favoriteIds() async {
    final rows = await _db.select(_db.favorites).get();
    return rows.map((r) => r.comicId).toSet();
  }

  // --- Tags ---

  @override
  Future<List<TagCount>> listTags() async {
    final rows = await _db.customSelect(
      'SELECT t.name AS name, COUNT(ct.comic_id) AS cnt '
      'FROM tags t LEFT JOIN comic_tags ct ON ct.tag_id = t.id '
      'GROUP BY t.id ORDER BY t.name COLLATE NOCASE',
      readsFrom: {_db.tags, _db.comicTags},
    ).get();
    return rows
        .map((r) => TagCount(name: r.read<String>('name'), count: r.read<int>('cnt')))
        .toList();
  }

  @override
  Future<List<String>> tagsForComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return const [];
    final query = _db.select(_db.tags).join([
      innerJoin(_db.comicTags, _db.comicTags.tagId.equalsExp(_db.tags.id)),
    ])
      ..where(_db.comicTags.comicId.equals(intId))
      ..orderBy([OrderingTerm(expression: _db.tags.name)]);
    final rows = await query.get();
    return rows.map((r) => r.readTable(_db.tags).name).toList();
  }

  @override
  Future<void> setTagsForComic(String id, List<String> tags) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    final names = tags.map((t) => t.trim()).where((t) => t.isNotEmpty).toSet();
    await _db.transaction(() async {
      await (_db.delete(_db.comicTags)..where((t) => t.comicId.equals(intId))).go();
      for (final name in names) {
        final tagId = await _tagId(name);
        await _db.into(_db.comicTags).insert(
              ComicTagsCompanion.insert(comicId: intId, tagId: tagId),
              mode: InsertMode.insertOrIgnore,
            );
      }
    });
  }

  Future<int> _tagId(String name) async {
    final existing =
        await (_db.select(_db.tags)..where((t) => t.name.equals(name))).getSingleOrNull();
    if (existing != null) return existing.id;
    return _db.into(_db.tags).insert(TagsCompanion.insert(name: name));
  }

  // --- Collections (libraries) ---

  @override
  Future<List<LibraryInfo>> listLibraries() async {
    final rows = await _db.customSelect(
      'SELECT l.id AS id, l.name AS name, COUNT(lc.comic_id) AS cnt, '
      '(SELECT cover_thumbnail FROM comics c WHERE c.id = '
      '(SELECT comic_id FROM library_comics WHERE library_id = l.id LIMIT 1)) AS cover '
      'FROM libraries l LEFT JOIN library_comics lc ON lc.library_id = l.id '
      'GROUP BY l.id ORDER BY l.name COLLATE NOCASE',
      readsFrom: {_db.libraries, _db.libraryComics, _db.comics},
    ).get();
    return rows
        .map((r) => LibraryInfo(
              id: r.read<int>('id').toString(),
              name: r.read<String>('name'),
              count: r.read<int>('cnt'),
              cover: r.read<Uint8List?>('cover'),
            ))
        .toList();
  }

  @override
  Future<String> createLibrary(String name) async {
    final id = await _db.into(_db.libraries).insert(
          LibrariesCompanion.insert(name: name.trim()),
          mode: InsertMode.insertOrIgnore,
        );
    if (id != 0) return id.toString();
    // Name already exists — return the existing id.
    final existing =
        await (_db.select(_db.libraries)..where((l) => l.name.equals(name.trim()))).getSingle();
    return existing.id.toString();
  }

  @override
  Future<void> setInLibrary(String libraryId, String comicId, bool member) async {
    final lib = int.tryParse(libraryId);
    final comic = int.tryParse(comicId);
    if (lib == null || comic == null) return;
    if (member) {
      await _db.into(_db.libraryComics).insert(
            LibraryComicsCompanion.insert(libraryId: lib, comicId: comic),
            mode: InsertMode.insertOrIgnore,
          );
    } else {
      await (_db.delete(_db.libraryComics)
            ..where((t) => t.libraryId.equals(lib) & t.comicId.equals(comic)))
          .go();
    }
  }

  @override
  Future<Set<String>> librariesForComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return const {};
    final rows = await (_db.select(_db.libraryComics)..where((t) => t.comicId.equals(intId))).get();
    return rows.map((r) => r.libraryId.toString()).toSet();
  }

  // --- Series (auto from parsed metadata) ---

  @override
  Future<List<SeriesGroup>> listSeries() async {
    final rows = await _db.customSelect(
      "SELECT series_name AS name, COUNT(*) AS cnt, "
      "(SELECT cover_thumbnail FROM comics c2 WHERE c2.series_name = c.series_name "
      "ORDER BY volume_number, chapter_number LIMIT 1) AS cover "
      "FROM comics c WHERE series_name IS NOT NULL AND series_name != '' "
      "GROUP BY series_name ORDER BY series_name COLLATE NOCASE",
      readsFrom: {_db.comics},
    ).get();
    return rows
        .map((r) => SeriesGroup(
              name: r.read<String>('name'),
              count: r.read<int>('cnt'),
              cover: r.read<Uint8List?>('cover'),
            ))
        .toList();
  }
}
