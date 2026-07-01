import 'package:cb8_flutter/data/db/database.dart';
import 'package:cb8_flutter/data/models/comic_metadata.dart';
import 'package:cb8_flutter/data/sources/library_source.dart';
import 'package:cb8_flutter/data/sources/local_source.dart';
import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Inserts a comic row and returns its id as the string LocalSource uses.
Future<String> _insert(
  AppDatabase db, {
  required String uri,
  required String title,
  int fileSize = 0,
  int pageCount = 0,
}) async {
  final id = await db
      .into(db.comics)
      .insert(
        ComicsCompanion.insert(
          uri: uri,
          title: title,
          fileSize: Value(fileSize),
          pageCount: Value(pageCount),
        ),
      );
  return id.toString();
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  late AppDatabase db;
  late LocalSource source;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    source = LocalSource(db);
  });
  tearDown(() => db.close());

  test('reports library-management capability', () {
    expect(source.supportsLibraryManagement, isTrue);
  });

  group('metadata editing', () {
    test('round-trips edited fields', () async {
      final id = await _insert(db, uri: '/a/one.cbz', title: 'Original');
      await source.updateMetadata(
        id,
        const ComicMetadata(
          title: 'New Title',
          seriesName: 'My Series',
          volumeNumber: 2,
          chapterNumber: 5,
          author: 'Writer',
          artist: 'Artist',
          genre: 'Action',
          year: 2020,
          summary: 'A summary.',
        ),
      );
      final meta = await source.getMetadata(id);
      expect(meta, isNotNull);
      expect(meta!.title, 'New Title');
      expect(meta.seriesName, 'My Series');
      expect(meta.volumeNumber, 2);
      expect(meta.chapterNumber, 5);
      expect(meta.author, 'Writer');
      expect(meta.artist, 'Artist');
      expect(meta.genre, 'Action');
      expect(meta.year, 2020);
      expect(meta.summary, 'A summary.');
    });

    test(
      'blank strings clear optional fields; blank title is ignored',
      () async {
        final id = await _insert(db, uri: '/a/two.cbz', title: 'Keep Me');
        await source.updateMetadata(
          id,
          const ComicMetadata(title: 'Set', author: 'X'),
        );
        await source.updateMetadata(
          id,
          const ComicMetadata(title: '  ', author: '  '),
        );
        final meta = await source.getMetadata(id);
        expect(meta!.title, 'Set'); // blank title not applied
        expect(meta.author, isNull); // blank author cleared
      },
    );
  });

  group('want-to-read shelf', () {
    test('add, query, and remove', () async {
      final id = await _insert(db, uri: '/a/w.cbz', title: 'Queued');
      expect(await source.isWantToRead(id), isFalse);

      await source.setWantToRead(id, true);
      expect(await source.isWantToRead(id), isTrue);
      final shelf = await source.wantToRead();
      expect(shelf.map((c) => c.id), contains(id));

      await source.setWantToRead(id, false);
      expect(await source.isWantToRead(id), isFalse);
      expect(await source.wantToRead(), isEmpty);
    });
  });

  group('reading progress', () {
    test(
      'locator-only EPUB progress is in-progress and appears in continue reading',
      () async {
        final id = await _insert(db, uri: '/a/book.epub', title: 'Book');
        await source.setProgress(
          id,
          location:
              '{"href":"chapter-1.xhtml","locations":{"progression":0.42}}',
          completed: false,
        );

        final inProgress = await source.listComics(
          const LibraryQuery(readStatus: ReadStatus.inProgress),
        );
        expect(inProgress.map((c) => c.id), contains(id));

        final unread = await source.listComics(
          const LibraryQuery(readStatus: ReadStatus.unread),
        );
        expect(unread.map((c) => c.id), isNot(contains(id)));

        final shelf = await source.continueReading();
        expect(shelf.map((c) => c.id), contains(id));
      },
    );
  });

  group('duplicate detection', () {
    test('groups identical file size + page count', () async {
      await _insert(
        db,
        uri: '/a/x1.cbz',
        title: 'A',
        fileSize: 1000,
        pageCount: 20,
      );
      await _insert(
        db,
        uri: '/a/x2.cbz',
        title: 'B',
        fileSize: 1000,
        pageCount: 20,
      );
      await _insert(
        db,
        uri: '/a/x3.cbz',
        title: 'C',
        fileSize: 999,
        pageCount: 20,
      );

      final groups = await source.findDuplicates();
      expect(groups, hasLength(1));
      expect(groups.first.reason, 'Identical files');
      expect(groups.first.items, hasLength(2));
    });

    test('groups matching titles not already caught by size', () async {
      await _insert(db, uri: '/a/y1.cbz', title: 'Same Name', fileSize: 1);
      await _insert(db, uri: '/a/y2.cbz', title: 'same name ', fileSize: 2);

      final groups = await source.findDuplicates();
      expect(groups, hasLength(1));
      expect(groups.first.reason, 'Matching title');
      expect(groups.first.items, hasLength(2));
    });

    test('no duplicates yields an empty list', () async {
      await _insert(
        db,
        uri: '/a/u1.cbz',
        title: 'Unique 1',
        fileSize: 10,
        pageCount: 1,
      );
      await _insert(
        db,
        uri: '/a/u2.cbz',
        title: 'Unique 2',
        fileSize: 20,
        pageCount: 2,
      );
      expect(await source.findDuplicates(), isEmpty);
    });
  });

  test('deleteComic removes the catalog row', () async {
    final id = await _insert(db, uri: '/a/del.cbz', title: 'Bye');
    await source.deleteComic(id);
    expect(await source.getComic(id), isNull);
  });
}
