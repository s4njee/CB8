import 'dart:io';

import 'package:drift/drift.dart';
import 'package:path/path.dart' as p;

import '../db/database.dart';
import '../local_files.dart';
import '../models/comic_metadata.dart';
import '../models/comic_summary.dart';
import '../models/groups.dart';
import '../models/reading_stats.dart';
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
  bool get supportsLibraryManagement => true;

  @override
  Stream<void> watchChanges() => _db.tableUpdates().map((_) {});

  static String? _extOf(String uri) {
    final dot = uri.lastIndexOf('.');
    return dot >= 0 ? uri.substring(dot + 1).toLowerCase() : null;
  }

  ComicSummary _toSummary(ComicRow row, {required bool favorite}) {
    return ComicSummary(
      id: row.id.toString(),
      title: row.title,
      pageCount: row.pageCount,
      mediaType: row.mediaType,
      coverThumbnail: row.coverThumbnail,
      lastPage: row.lastPage,
      lastLocation: row.lastLocation,
      lastPercent: row.lastPercent,
      completed: row.completed,
      isFavorite: favorite,
      seriesName: row.seriesName,
      volumeNumber: row.volumeNumber,
      chapterNumber: row.chapterNumber,
      extension: _extOf(row.uri),
      sourceUri: row.uri,
      originConnectionId: row.originConnectionId,
      originComicId: row.originComicId,
    );
  }

  /// Columns needed to render a library card — deliberately *excludes* the
  /// `cover_thumbnail` BLOB so list queries don't pull every cover into memory.
  /// Covers load lazily per visible card (see `localCoverProvider`).
  List<Expression> get _summaryColumns {
    final c = _db.comics;
    return [
      c.id,
      c.uri,
      c.title,
      c.pageCount,
      c.mediaType,
      c.lastPage,
      c.lastLocation,
      c.lastPercent,
      c.completed,
      c.seriesName,
      c.volumeNumber,
      c.chapterNumber,
      c.originConnectionId,
      c.originComicId,
    ];
  }

  ComicSummary _summaryFromRow(TypedResult r, Set<int> favIds) {
    final c = _db.comics;
    final id = r.read(c.id)!;
    final uri = r.read(c.uri)!;
    return ComicSummary(
      id: id.toString(),
      title: r.read(c.title)!,
      pageCount: r.read(c.pageCount)!,
      mediaType: r.read(c.mediaType)!,
      coverThumbnail: null, // loaded lazily by the card to keep lists light
      lastPage: r.read(c.lastPage),
      lastLocation: r.read(c.lastLocation),
      lastPercent: r.read(c.lastPercent),
      completed: r.read(c.completed)!,
      isFavorite: favIds.contains(id),
      seriesName: r.read(c.seriesName),
      volumeNumber: r.read(c.volumeNumber),
      chapterNumber: r.read(c.chapterNumber),
      extension: _extOf(uri),
      sourceUri: uri,
      originConnectionId: r.read(c.originConnectionId),
      originComicId: r.read(c.originComicId),
    );
  }

  @override
  Future<List<ComicSummary>> listComics(LibraryQuery query) async {
    final favIds = await _favoriteIds();
    final c = _db.comics;
    final q = _db.selectOnly(c)..addColumns(_summaryColumns);

    // Build conditions, then AND them in a single where so the BLOB-free
    // projection and the typed builder don't fight over multi-where semantics.
    final conds = <Expression<bool>>[];
    if (query.mediaType != null) {
      conds.add(c.mediaType.equals(query.mediaType!));
    }
    final search = query.search?.trim();
    if (search != null && search.isNotEmpty) {
      final like = '%$search%';
      conds.add(
        c.title.like(like) | c.seriesName.like(like) | c.author.like(like),
      );
    }
    switch (query.readStatus) {
      case ReadStatus.unread:
        conds.add(
          c.lastPage.isNull() &
              c.lastLocation.isNull() &
              c.completed.equals(false),
        );
      case ReadStatus.inProgress:
        conds.add(
          (c.lastPage.isNotNull() | c.lastLocation.isNotNull()) &
              c.completed.equals(false),
        );
      case ReadStatus.completed:
        conds.add(c.completed.equals(true));
      case ReadStatus.all:
        break;
    }
    if (query.favoritesOnly) {
      if (favIds.isEmpty) return const [];
      conds.add(c.id.isIn(favIds));
    }
    if (query.tag != null) {
      final sub = _db.selectOnly(_db.comicTags)
        ..addColumns([_db.comicTags.comicId])
        ..join([
          innerJoin(_db.tags, _db.tags.id.equalsExp(_db.comicTags.tagId)),
        ])
        ..where(_db.tags.name.equals(query.tag!));
      conds.add(c.id.isInQuery(sub));
    }
    if (query.libraryId != null) {
      final libId = int.tryParse(query.libraryId!);
      if (libId == null) return const [];
      final sub = _db.selectOnly(_db.libraryComics)
        ..addColumns([_db.libraryComics.comicId])
        ..where(_db.libraryComics.libraryId.equals(libId));
      conds.add(c.id.isInQuery(sub));
    }
    if (query.seriesName != null) {
      conds.add(c.seriesName.equals(query.seriesName!));
    }
    if (query.hasBeenRead) conds.add(c.lastRead.isNotNull());

    if (conds.isNotEmpty) q.where(conds.reduce((a, b) => a & b));

    // Series views read best ordered by volume then chapter; everything else
    // uses the requested sort.
    if (query.seriesName != null) {
      q.orderBy([
        OrderingTerm(expression: c.volumeNumber, nulls: NullsOrder.last),
        OrderingTerm(expression: c.chapterNumber, nulls: NullsOrder.last),
        OrderingTerm(expression: c.title),
      ]);
    } else {
      final mode = query.descending ? OrderingMode.desc : OrderingMode.asc;
      q.orderBy([
        switch (query.sort) {
          LibrarySort.title => OrderingTerm(expression: c.title, mode: mode),
          LibrarySort.dateAdded => OrderingTerm(
            expression: c.dateAdded,
            mode: mode,
          ),
          LibrarySort.fileSize => OrderingTerm(
            expression: c.fileSize,
            mode: mode,
          ),
          LibrarySort.pageCount => OrderingTerm(
            expression: c.pageCount,
            mode: mode,
          ),
          LibrarySort.lastRead => OrderingTerm(
            expression: c.lastRead,
            mode: mode,
          ),
        },
      ]);
    }
    q.limit(query.limit, offset: query.offset);

    final rows = await q.get();
    return rows.map((r) => _summaryFromRow(r, favIds)).toList();
  }

  @override
  Future<List<ComicSummary>> continueReading({int limit = 20}) async {
    final favIds = await _favoriteIds();
    final c = _db.comics;
    final q = _db.selectOnly(c)
      ..addColumns(_summaryColumns)
      ..where(
        (c.lastPage.isNotNull() | c.lastLocation.isNotNull()) &
            c.completed.equals(false) &
            c.lastRead.isNotNull(),
      )
      ..orderBy([OrderingTerm(expression: c.lastRead, mode: OrderingMode.desc)])
      ..limit(limit);
    final rows = await q.get();
    return rows.map((r) => _summaryFromRow(r, favIds)).toList();
  }

  @override
  Future<ComicSummary?> getComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return null;
    final row = await (_db.select(
      _db.comics,
    )..where((t) => t.id.equals(intId))).getSingleOrNull();
    if (row == null) return null;
    final favIds = await _favoriteIds();
    return _toSummary(row, favorite: favIds.contains(row.id));
  }

  @override
  Future<void> setProgress(
    String id, {
    int? page,
    String? location,
    double? percent,
    bool? completed,
  }) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    await (_db.update(_db.comics)..where((t) => t.id.equals(intId))).write(
      ComicsCompanion(
        lastPage: page == null ? const Value.absent() : Value(page),
        lastLocation: location == null ? const Value.absent() : Value(location),
        lastPercent: percent == null ? const Value.absent() : Value(percent),
        completed: completed == null ? const Value.absent() : Value(completed),
        lastRead: Value(DateTime.now()),
      ),
    );
    await _db
        .into(_db.readingHistory)
        .insert(
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
      await _db
          .into(_db.favorites)
          .insert(
            FavoritesCompanion(comicId: Value(intId)),
            mode: InsertMode.insertOrIgnore,
          );
    } else {
      await (_db.delete(
        _db.favorites,
      )..where((t) => t.comicId.equals(intId))).go();
    }
  }

  // --- Metadata editing ---

  @override
  Future<ComicMetadata?> getMetadata(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return null;
    final row = await (_db.select(
      _db.comics,
    )..where((t) => t.id.equals(intId))).getSingleOrNull();
    if (row == null) return null;
    return ComicMetadata(
      title: row.title,
      seriesName: row.seriesName,
      volumeNumber: row.volumeNumber,
      chapterNumber: row.chapterNumber,
      author: row.author,
      artist: row.artist,
      genre: row.genre,
      year: row.year,
      summary: row.summary,
    );
  }

  @override
  Future<void> updateMetadata(String id, ComicMetadata meta) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    final title = meta.title.trim();
    await (_db.update(_db.comics)..where((t) => t.id.equals(intId))).write(
      ComicsCompanion(
        title: title.isEmpty ? const Value.absent() : Value(title),
        seriesName: Value(_blankToNull(meta.seriesName)),
        volumeNumber: Value(meta.volumeNumber),
        chapterNumber: Value(meta.chapterNumber),
        author: Value(_blankToNull(meta.author)),
        artist: Value(_blankToNull(meta.artist)),
        genre: Value(_blankToNull(meta.genre)),
        year: Value(meta.year),
        summary: Value(_blankToNull(meta.summary)),
      ),
    );
  }

  static String? _blankToNull(String? s) {
    final t = s?.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  @override
  Future<void> deleteComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    final row = await (_db.select(
      _db.comics,
    )..where((t) => t.id.equals(intId))).getSingleOrNull();
    // Removing the row cascades to favorites/tags/history/membership.
    await (_db.delete(_db.comics)..where((t) => t.id.equals(intId))).go();
    // Only delete files the app owns (copied in under a relative path). External
    // files reached by absolute path — e.g. watched folders — are left in place.
    if (row != null && !p.isAbsolute(row.uri)) {
      try {
        final abs = await resolveLibraryPath(row.uri);
        final file = File(abs);
        if (await file.exists()) await file.delete();
      } catch (_) {
        // Best effort — a missing file shouldn't fail the catalog delete.
      }
    }
  }

  // --- Want-to-read / on-deck shelf ---

  @override
  Future<bool> isWantToRead(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return false;
    final row = await (_db.select(
      _db.wantToRead,
    )..where((t) => t.comicId.equals(intId))).getSingleOrNull();
    return row != null;
  }

  @override
  Future<void> setWantToRead(String id, bool want) async {
    final intId = int.tryParse(id);
    if (intId == null) return;
    if (want) {
      await _db
          .into(_db.wantToRead)
          .insert(
            WantToReadCompanion(comicId: Value(intId)),
            mode: InsertMode.insertOrIgnore,
          );
    } else {
      await (_db.delete(
        _db.wantToRead,
      )..where((t) => t.comicId.equals(intId))).go();
    }
  }

  @override
  Future<List<ComicSummary>> wantToRead({int limit = 50}) async {
    final favIds = await _favoriteIds();
    final c = _db.comics;
    final q = _db.selectOnly(c)
      ..addColumns(_summaryColumns)
      ..join([
        innerJoin(_db.wantToRead, _db.wantToRead.comicId.equalsExp(c.id)),
      ])
      ..orderBy([
        OrderingTerm(
          expression: _db.wantToRead.createdAt,
          mode: OrderingMode.desc,
        ),
      ])
      ..limit(limit);
    final rows = await q.get();
    return rows.map((r) => _summaryFromRow(r, favIds)).toList();
  }

  // --- Duplicate detection ---

  @override
  Future<List<DuplicateGroup>> findDuplicates() async {
    final favIds = await _favoriteIds();
    final groups = <DuplicateGroup>[];
    final claimed = <int>{}; // ids already placed in a stronger group

    // Strongest signal first: identical byte size + page count (file_size is
    // populated at import; legacy rows with size 0 are excluded here and fall
    // through to the title pass below).
    final bySize = await _db
        .customSelect(
          'SELECT GROUP_CONCAT(id) AS ids FROM comics '
          'WHERE file_size > 0 '
          'GROUP BY file_size, page_count HAVING COUNT(*) > 1',
          readsFrom: {_db.comics},
        )
        .get();
    for (final r in bySize) {
      final ids = _parseIds(r.read<String?>('ids'));
      if (ids.length < 2) continue;
      claimed.addAll(ids);
      final items = await _summariesByIds(ids, favIds);
      if (items.length > 1) {
        groups.add(DuplicateGroup(reason: 'Identical files', items: items));
      }
    }

    // Weaker signal: same normalized title (case-insensitive), for rows the size
    // pass didn't already claim.
    final byTitle = await _db
        .customSelect(
          'SELECT GROUP_CONCAT(id) AS ids FROM comics '
          'GROUP BY LOWER(TRIM(title)) HAVING COUNT(*) > 1',
          readsFrom: {_db.comics},
        )
        .get();
    for (final r in byTitle) {
      final ids = _parseIds(
        r.read<String?>('ids'),
      ).where((id) => !claimed.contains(id)).toList();
      if (ids.length < 2) continue;
      claimed.addAll(ids);
      final items = await _summariesByIds(ids, favIds);
      if (items.length > 1) {
        groups.add(DuplicateGroup(reason: 'Matching title', items: items));
      }
    }
    return groups;
  }

  static List<int> _parseIds(String? csv) {
    if (csv == null || csv.isEmpty) return const [];
    return csv.split(',').map(int.tryParse).whereType<int>().toList();
  }

  Future<List<ComicSummary>> _summariesByIds(
    List<int> ids,
    Set<int> favIds,
  ) async {
    final c = _db.comics;
    final q = _db.selectOnly(c)
      ..addColumns(_summaryColumns)
      ..where(c.id.isIn(ids))
      ..orderBy([OrderingTerm(expression: c.dateAdded)]);
    final rows = await q.get();
    return rows.map((r) => _summaryFromRow(r, favIds)).toList();
  }

  /// Loads a single comic's cover BLOB. List queries deliberately skip the BLOB
  /// for memory, so each card fetches its cover lazily through this (one
  /// primary-key lookup per visible card).
  Future<Uint8List?> coverBytes(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return null;
    final c = _db.comics;
    final row =
        await (_db.selectOnly(c)
              ..addColumns([c.coverThumbnail])
              ..where(c.id.equals(intId)))
            .getSingleOrNull();
    return row?.read(c.coverThumbnail);
  }

  Future<Set<int>> _favoriteIds() async {
    final rows = await _db.select(_db.favorites).get();
    return rows.map((r) => r.comicId).toSet();
  }

  // --- Tags ---

  @override
  Future<List<TagCount>> listTags() async {
    final rows = await _db
        .customSelect(
          'SELECT t.name AS name, COUNT(ct.comic_id) AS cnt '
          'FROM tags t LEFT JOIN comic_tags ct ON ct.tag_id = t.id '
          'GROUP BY t.id ORDER BY t.name COLLATE NOCASE',
          readsFrom: {_db.tags, _db.comicTags},
        )
        .get();
    return rows
        .map(
          (r) =>
              TagCount(name: r.read<String>('name'), count: r.read<int>('cnt')),
        )
        .toList();
  }

  @override
  Future<List<String>> tagsForComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return const [];
    final query =
        _db.select(_db.tags).join([
            innerJoin(
              _db.comicTags,
              _db.comicTags.tagId.equalsExp(_db.tags.id),
            ),
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
      await (_db.delete(
        _db.comicTags,
      )..where((t) => t.comicId.equals(intId))).go();
      for (final name in names) {
        final tagId = await _tagId(name);
        await _db
            .into(_db.comicTags)
            .insert(
              ComicTagsCompanion.insert(comicId: intId, tagId: tagId),
              mode: InsertMode.insertOrIgnore,
            );
      }
    });
  }

  Future<int> _tagId(String name) async {
    final existing = await (_db.select(
      _db.tags,
    )..where((t) => t.name.equals(name))).getSingleOrNull();
    if (existing != null) return existing.id;
    return _db.into(_db.tags).insert(TagsCompanion.insert(name: name));
  }

  // --- Collections (libraries) ---

  @override
  Future<List<LibraryInfo>> listLibraries() async {
    final rows = await _db
        .customSelect(
          'SELECT l.id AS id, l.name AS name, COUNT(lc.comic_id) AS cnt, '
          '(SELECT cover_thumbnail FROM comics c WHERE c.id = '
          '(SELECT comic_id FROM library_comics WHERE library_id = l.id LIMIT 1)) AS cover '
          'FROM libraries l LEFT JOIN library_comics lc ON lc.library_id = l.id '
          'GROUP BY l.id ORDER BY l.name COLLATE NOCASE',
          readsFrom: {_db.libraries, _db.libraryComics, _db.comics},
        )
        .get();
    return rows
        .map(
          (r) => LibraryInfo(
            id: r.read<int>('id').toString(),
            name: r.read<String>('name'),
            count: r.read<int>('cnt'),
            cover: r.read<Uint8List?>('cover'),
          ),
        )
        .toList();
  }

  @override
  Future<String> createLibrary(String name) async {
    final trimmed = name.trim();
    // insertOrIgnore's return value can't be trusted: on an ignored insert
    // sqlite leaves last_insert_rowid() at the connection's previous value
    // (e.g. a reading_history row), so we'd hand back a rowid for the wrong
    // table. Always resolve the id by the unique name instead.
    await _db
        .into(_db.libraries)
        .insert(
          LibrariesCompanion.insert(name: trimmed),
          mode: InsertMode.insertOrIgnore,
        );
    final row = await (_db.select(
      _db.libraries,
    )..where((l) => l.name.equals(trimmed))).getSingle();
    return row.id.toString();
  }

  @override
  Future<void> setInLibrary(
    String libraryId,
    String comicId,
    bool member,
  ) async {
    final lib = int.tryParse(libraryId);
    final comic = int.tryParse(comicId);
    if (lib == null || comic == null) return;
    if (member) {
      await _db
          .into(_db.libraryComics)
          .insert(
            LibraryComicsCompanion.insert(libraryId: lib, comicId: comic),
            mode: InsertMode.insertOrIgnore,
          );
    } else {
      await (_db.delete(
        _db.libraryComics,
      )..where((t) => t.libraryId.equals(lib) & t.comicId.equals(comic))).go();
    }
  }

  @override
  Future<Set<String>> librariesForComic(String id) async {
    final intId = int.tryParse(id);
    if (intId == null) return const {};
    final rows = await (_db.select(
      _db.libraryComics,
    )..where((t) => t.comicId.equals(intId))).get();
    return rows.map((r) => r.libraryId.toString()).toSet();
  }

  // --- Series (auto from parsed metadata) ---

  @override
  Future<List<SeriesGroup>> listSeries() async {
    final rows = await _db
        .customSelect(
          "SELECT series_name AS name, COUNT(*) AS cnt, "
          "(SELECT cover_thumbnail FROM comics c2 WHERE c2.series_name = c.series_name "
          "ORDER BY volume_number, chapter_number LIMIT 1) AS cover "
          "FROM comics c WHERE series_name IS NOT NULL AND series_name != '' "
          "GROUP BY series_name ORDER BY series_name COLLATE NOCASE",
          readsFrom: {_db.comics},
        )
        .get();
    return rows
        .map(
          (r) => SeriesGroup(
            name: r.read<String>('name'),
            count: r.read<int>('cnt'),
            cover: r.read<Uint8List?>('cover'),
          ),
        )
        .toList();
  }

  @override
  Future<ReadingStats?> readingStats() async {
    final h = _db.readingHistory;
    final rows = await (_db.selectOnly(h)
          ..addColumns([h.comicId, h.timestamp, h.action]))
        .get();
    final events = [
      for (final r in rows)
        HistoryEvent(
          comicId: r.read(h.comicId)!,
          timestamp: r.read(h.timestamp)!,
          completed: r.read(h.action) == 'completed',
        ),
    ];
    return computeReadingStats(events);
  }
}
