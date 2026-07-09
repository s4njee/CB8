// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $ComicsTable extends Comics with TableInfo<$ComicsTable, ComicRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ComicsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _uriMeta = const VerificationMeta('uri');
  @override
  late final GeneratedColumn<String> uri = GeneratedColumn<String>(
    'uri',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pageCountMeta = const VerificationMeta(
    'pageCount',
  );
  @override
  late final GeneratedColumn<int> pageCount = GeneratedColumn<int>(
    'page_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _fileSizeMeta = const VerificationMeta(
    'fileSize',
  );
  @override
  late final GeneratedColumn<int> fileSize = GeneratedColumn<int>(
    'file_size',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _coverThumbnailMeta = const VerificationMeta(
    'coverThumbnail',
  );
  @override
  late final GeneratedColumn<Uint8List> coverThumbnail =
      GeneratedColumn<Uint8List>(
        'cover_thumbnail',
        aliasedName,
        true,
        type: DriftSqlType.blob,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _dateAddedMeta = const VerificationMeta(
    'dateAdded',
  );
  @override
  late final GeneratedColumn<DateTime> dateAdded = GeneratedColumn<DateTime>(
    'date_added',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  static const VerificationMeta _lastPageMeta = const VerificationMeta(
    'lastPage',
  );
  @override
  late final GeneratedColumn<int> lastPage = GeneratedColumn<int>(
    'last_page',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastLocationMeta = const VerificationMeta(
    'lastLocation',
  );
  @override
  late final GeneratedColumn<String> lastLocation = GeneratedColumn<String>(
    'last_location',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastPercentMeta = const VerificationMeta(
    'lastPercent',
  );
  @override
  late final GeneratedColumn<double> lastPercent = GeneratedColumn<double>(
    'last_percent',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastReadMeta = const VerificationMeta(
    'lastRead',
  );
  @override
  late final GeneratedColumn<DateTime> lastRead = GeneratedColumn<DateTime>(
    'last_read',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _completedMeta = const VerificationMeta(
    'completed',
  );
  @override
  late final GeneratedColumn<bool> completed = GeneratedColumn<bool>(
    'completed',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("completed" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _originConnectionIdMeta =
      const VerificationMeta('originConnectionId');
  @override
  late final GeneratedColumn<String> originConnectionId =
      GeneratedColumn<String>(
        'origin_connection_id',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _originComicIdMeta = const VerificationMeta(
    'originComicId',
  );
  @override
  late final GeneratedColumn<String> originComicId = GeneratedColumn<String>(
    'origin_comic_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _mediaTypeMeta = const VerificationMeta(
    'mediaType',
  );
  @override
  late final GeneratedColumn<String> mediaType = GeneratedColumn<String>(
    'media_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(MediaTypes.comic),
  );
  static const VerificationMeta _seriesNameMeta = const VerificationMeta(
    'seriesName',
  );
  @override
  late final GeneratedColumn<String> seriesName = GeneratedColumn<String>(
    'series_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _volumeNumberMeta = const VerificationMeta(
    'volumeNumber',
  );
  @override
  late final GeneratedColumn<double> volumeNumber = GeneratedColumn<double>(
    'volume_number',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _chapterNumberMeta = const VerificationMeta(
    'chapterNumber',
  );
  @override
  late final GeneratedColumn<double> chapterNumber = GeneratedColumn<double>(
    'chapter_number',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _authorMeta = const VerificationMeta('author');
  @override
  late final GeneratedColumn<String> author = GeneratedColumn<String>(
    'author',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _artistMeta = const VerificationMeta('artist');
  @override
  late final GeneratedColumn<String> artist = GeneratedColumn<String>(
    'artist',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _genreMeta = const VerificationMeta('genre');
  @override
  late final GeneratedColumn<String> genre = GeneratedColumn<String>(
    'genre',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _yearMeta = const VerificationMeta('year');
  @override
  late final GeneratedColumn<int> year = GeneratedColumn<int>(
    'year',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _summaryMeta = const VerificationMeta(
    'summary',
  );
  @override
  late final GeneratedColumn<String> summary = GeneratedColumn<String>(
    'summary',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    uri,
    title,
    pageCount,
    fileSize,
    coverThumbnail,
    dateAdded,
    lastPage,
    lastLocation,
    lastPercent,
    lastRead,
    completed,
    originConnectionId,
    originComicId,
    mediaType,
    seriesName,
    volumeNumber,
    chapterNumber,
    author,
    artist,
    genre,
    year,
    summary,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'comics';
  @override
  VerificationContext validateIntegrity(
    Insertable<ComicRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('uri')) {
      context.handle(
        _uriMeta,
        uri.isAcceptableOrUnknown(data['uri']!, _uriMeta),
      );
    } else if (isInserting) {
      context.missing(_uriMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('page_count')) {
      context.handle(
        _pageCountMeta,
        pageCount.isAcceptableOrUnknown(data['page_count']!, _pageCountMeta),
      );
    }
    if (data.containsKey('file_size')) {
      context.handle(
        _fileSizeMeta,
        fileSize.isAcceptableOrUnknown(data['file_size']!, _fileSizeMeta),
      );
    }
    if (data.containsKey('cover_thumbnail')) {
      context.handle(
        _coverThumbnailMeta,
        coverThumbnail.isAcceptableOrUnknown(
          data['cover_thumbnail']!,
          _coverThumbnailMeta,
        ),
      );
    }
    if (data.containsKey('date_added')) {
      context.handle(
        _dateAddedMeta,
        dateAdded.isAcceptableOrUnknown(data['date_added']!, _dateAddedMeta),
      );
    }
    if (data.containsKey('last_page')) {
      context.handle(
        _lastPageMeta,
        lastPage.isAcceptableOrUnknown(data['last_page']!, _lastPageMeta),
      );
    }
    if (data.containsKey('last_location')) {
      context.handle(
        _lastLocationMeta,
        lastLocation.isAcceptableOrUnknown(
          data['last_location']!,
          _lastLocationMeta,
        ),
      );
    }
    if (data.containsKey('last_percent')) {
      context.handle(
        _lastPercentMeta,
        lastPercent.isAcceptableOrUnknown(
          data['last_percent']!,
          _lastPercentMeta,
        ),
      );
    }
    if (data.containsKey('last_read')) {
      context.handle(
        _lastReadMeta,
        lastRead.isAcceptableOrUnknown(data['last_read']!, _lastReadMeta),
      );
    }
    if (data.containsKey('completed')) {
      context.handle(
        _completedMeta,
        completed.isAcceptableOrUnknown(data['completed']!, _completedMeta),
      );
    }
    if (data.containsKey('origin_connection_id')) {
      context.handle(
        _originConnectionIdMeta,
        originConnectionId.isAcceptableOrUnknown(
          data['origin_connection_id']!,
          _originConnectionIdMeta,
        ),
      );
    }
    if (data.containsKey('origin_comic_id')) {
      context.handle(
        _originComicIdMeta,
        originComicId.isAcceptableOrUnknown(
          data['origin_comic_id']!,
          _originComicIdMeta,
        ),
      );
    }
    if (data.containsKey('media_type')) {
      context.handle(
        _mediaTypeMeta,
        mediaType.isAcceptableOrUnknown(data['media_type']!, _mediaTypeMeta),
      );
    }
    if (data.containsKey('series_name')) {
      context.handle(
        _seriesNameMeta,
        seriesName.isAcceptableOrUnknown(data['series_name']!, _seriesNameMeta),
      );
    }
    if (data.containsKey('volume_number')) {
      context.handle(
        _volumeNumberMeta,
        volumeNumber.isAcceptableOrUnknown(
          data['volume_number']!,
          _volumeNumberMeta,
        ),
      );
    }
    if (data.containsKey('chapter_number')) {
      context.handle(
        _chapterNumberMeta,
        chapterNumber.isAcceptableOrUnknown(
          data['chapter_number']!,
          _chapterNumberMeta,
        ),
      );
    }
    if (data.containsKey('author')) {
      context.handle(
        _authorMeta,
        author.isAcceptableOrUnknown(data['author']!, _authorMeta),
      );
    }
    if (data.containsKey('artist')) {
      context.handle(
        _artistMeta,
        artist.isAcceptableOrUnknown(data['artist']!, _artistMeta),
      );
    }
    if (data.containsKey('genre')) {
      context.handle(
        _genreMeta,
        genre.isAcceptableOrUnknown(data['genre']!, _genreMeta),
      );
    }
    if (data.containsKey('year')) {
      context.handle(
        _yearMeta,
        year.isAcceptableOrUnknown(data['year']!, _yearMeta),
      );
    }
    if (data.containsKey('summary')) {
      context.handle(
        _summaryMeta,
        summary.isAcceptableOrUnknown(data['summary']!, _summaryMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ComicRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ComicRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      uri: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}uri'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      pageCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}page_count'],
      )!,
      fileSize: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}file_size'],
      )!,
      coverThumbnail: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}cover_thumbnail'],
      ),
      dateAdded: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}date_added'],
      )!,
      lastPage: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}last_page'],
      ),
      lastLocation: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_location'],
      ),
      lastPercent: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}last_percent'],
      ),
      lastRead: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_read'],
      ),
      completed: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}completed'],
      )!,
      originConnectionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin_connection_id'],
      ),
      originComicId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin_comic_id'],
      ),
      mediaType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}media_type'],
      )!,
      seriesName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}series_name'],
      ),
      volumeNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}volume_number'],
      ),
      chapterNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}chapter_number'],
      ),
      author: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}author'],
      ),
      artist: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}artist'],
      ),
      genre: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}genre'],
      ),
      year: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}year'],
      ),
      summary: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}summary'],
      ),
    );
  }

  @override
  $ComicsTable createAlias(String alias) {
    return $ComicsTable(attachedDatabase, alias);
  }
}

class ComicRow extends DataClass implements Insertable<ComicRow> {
  /// Auto-incrementing primary key.
  final int id;

  /// Platform-stable handle to the file. On desktop this is a path; on mobile it
  /// is a security-scoped URI (SAF / UIDocumentPicker) — see plan risks.
  final String uri;

  /// Display title shown on cards and in the reader app bar.
  final String title;

  /// Total page (comic/PDF) or content-document (EPUB) count; 0 until probed.
  final int pageCount;

  /// File size in bytes, for display and sorting.
  final int fileSize;

  /// 240x360 JPEG cover, stored inline like CB8's `cover_thumbnail` BLOB.
  final Uint8List? coverThumbnail;

  /// When the row was imported; defaults to now.
  final DateTime dateAdded;

  /// Reading progress. `lastPage` for paged formats; `lastLocation` is a
  /// Readium Locator JSON string for EPUB.
  final int? lastPage;

  /// Opaque reader locator for resume; null for paged formats.
  final String? lastLocation;

  /// Whole-book reading position 0–100 for reflowable formats (EPUB), where a
  /// page index is meaningless. Null for paged formats / unopened books.
  final double? lastPercent;

  /// Timestamp of the most recent read, used by the Recent shelf.
  final DateTime? lastRead;

  /// Whether the book has been read to the end.
  final bool completed;

  /// Connection id of the server this item was downloaded from; null if imported.
  final String? originConnectionId;

  /// This item's id on its origin server; null if imported.
  final String? originComicId;

  /// `comic` or `book` — see [MediaTypes].
  final String mediaType;

  /// Series this entry belongs to, parsed from the filename when possible.
  final String? seriesName;

  /// Volume number within the series, if parsed.
  final double? volumeNumber;

  /// Chapter number within the series/volume, if parsed.
  final double? chapterNumber;

  /// Author/writer metadata.
  final String? author;

  /// Artist/illustrator metadata.
  final String? artist;

  /// Genre label.
  final String? genre;

  /// Publication year.
  final int? year;

  /// Free-text synopsis.
  final String? summary;
  const ComicRow({
    required this.id,
    required this.uri,
    required this.title,
    required this.pageCount,
    required this.fileSize,
    this.coverThumbnail,
    required this.dateAdded,
    this.lastPage,
    this.lastLocation,
    this.lastPercent,
    this.lastRead,
    required this.completed,
    this.originConnectionId,
    this.originComicId,
    required this.mediaType,
    this.seriesName,
    this.volumeNumber,
    this.chapterNumber,
    this.author,
    this.artist,
    this.genre,
    this.year,
    this.summary,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['uri'] = Variable<String>(uri);
    map['title'] = Variable<String>(title);
    map['page_count'] = Variable<int>(pageCount);
    map['file_size'] = Variable<int>(fileSize);
    if (!nullToAbsent || coverThumbnail != null) {
      map['cover_thumbnail'] = Variable<Uint8List>(coverThumbnail);
    }
    map['date_added'] = Variable<DateTime>(dateAdded);
    if (!nullToAbsent || lastPage != null) {
      map['last_page'] = Variable<int>(lastPage);
    }
    if (!nullToAbsent || lastLocation != null) {
      map['last_location'] = Variable<String>(lastLocation);
    }
    if (!nullToAbsent || lastPercent != null) {
      map['last_percent'] = Variable<double>(lastPercent);
    }
    if (!nullToAbsent || lastRead != null) {
      map['last_read'] = Variable<DateTime>(lastRead);
    }
    map['completed'] = Variable<bool>(completed);
    if (!nullToAbsent || originConnectionId != null) {
      map['origin_connection_id'] = Variable<String>(originConnectionId);
    }
    if (!nullToAbsent || originComicId != null) {
      map['origin_comic_id'] = Variable<String>(originComicId);
    }
    map['media_type'] = Variable<String>(mediaType);
    if (!nullToAbsent || seriesName != null) {
      map['series_name'] = Variable<String>(seriesName);
    }
    if (!nullToAbsent || volumeNumber != null) {
      map['volume_number'] = Variable<double>(volumeNumber);
    }
    if (!nullToAbsent || chapterNumber != null) {
      map['chapter_number'] = Variable<double>(chapterNumber);
    }
    if (!nullToAbsent || author != null) {
      map['author'] = Variable<String>(author);
    }
    if (!nullToAbsent || artist != null) {
      map['artist'] = Variable<String>(artist);
    }
    if (!nullToAbsent || genre != null) {
      map['genre'] = Variable<String>(genre);
    }
    if (!nullToAbsent || year != null) {
      map['year'] = Variable<int>(year);
    }
    if (!nullToAbsent || summary != null) {
      map['summary'] = Variable<String>(summary);
    }
    return map;
  }

  ComicsCompanion toCompanion(bool nullToAbsent) {
    return ComicsCompanion(
      id: Value(id),
      uri: Value(uri),
      title: Value(title),
      pageCount: Value(pageCount),
      fileSize: Value(fileSize),
      coverThumbnail: coverThumbnail == null && nullToAbsent
          ? const Value.absent()
          : Value(coverThumbnail),
      dateAdded: Value(dateAdded),
      lastPage: lastPage == null && nullToAbsent
          ? const Value.absent()
          : Value(lastPage),
      lastLocation: lastLocation == null && nullToAbsent
          ? const Value.absent()
          : Value(lastLocation),
      lastPercent: lastPercent == null && nullToAbsent
          ? const Value.absent()
          : Value(lastPercent),
      lastRead: lastRead == null && nullToAbsent
          ? const Value.absent()
          : Value(lastRead),
      completed: Value(completed),
      originConnectionId: originConnectionId == null && nullToAbsent
          ? const Value.absent()
          : Value(originConnectionId),
      originComicId: originComicId == null && nullToAbsent
          ? const Value.absent()
          : Value(originComicId),
      mediaType: Value(mediaType),
      seriesName: seriesName == null && nullToAbsent
          ? const Value.absent()
          : Value(seriesName),
      volumeNumber: volumeNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(volumeNumber),
      chapterNumber: chapterNumber == null && nullToAbsent
          ? const Value.absent()
          : Value(chapterNumber),
      author: author == null && nullToAbsent
          ? const Value.absent()
          : Value(author),
      artist: artist == null && nullToAbsent
          ? const Value.absent()
          : Value(artist),
      genre: genre == null && nullToAbsent
          ? const Value.absent()
          : Value(genre),
      year: year == null && nullToAbsent ? const Value.absent() : Value(year),
      summary: summary == null && nullToAbsent
          ? const Value.absent()
          : Value(summary),
    );
  }

  factory ComicRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ComicRow(
      id: serializer.fromJson<int>(json['id']),
      uri: serializer.fromJson<String>(json['uri']),
      title: serializer.fromJson<String>(json['title']),
      pageCount: serializer.fromJson<int>(json['pageCount']),
      fileSize: serializer.fromJson<int>(json['fileSize']),
      coverThumbnail: serializer.fromJson<Uint8List?>(json['coverThumbnail']),
      dateAdded: serializer.fromJson<DateTime>(json['dateAdded']),
      lastPage: serializer.fromJson<int?>(json['lastPage']),
      lastLocation: serializer.fromJson<String?>(json['lastLocation']),
      lastPercent: serializer.fromJson<double?>(json['lastPercent']),
      lastRead: serializer.fromJson<DateTime?>(json['lastRead']),
      completed: serializer.fromJson<bool>(json['completed']),
      originConnectionId: serializer.fromJson<String?>(
        json['originConnectionId'],
      ),
      originComicId: serializer.fromJson<String?>(json['originComicId']),
      mediaType: serializer.fromJson<String>(json['mediaType']),
      seriesName: serializer.fromJson<String?>(json['seriesName']),
      volumeNumber: serializer.fromJson<double?>(json['volumeNumber']),
      chapterNumber: serializer.fromJson<double?>(json['chapterNumber']),
      author: serializer.fromJson<String?>(json['author']),
      artist: serializer.fromJson<String?>(json['artist']),
      genre: serializer.fromJson<String?>(json['genre']),
      year: serializer.fromJson<int?>(json['year']),
      summary: serializer.fromJson<String?>(json['summary']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'uri': serializer.toJson<String>(uri),
      'title': serializer.toJson<String>(title),
      'pageCount': serializer.toJson<int>(pageCount),
      'fileSize': serializer.toJson<int>(fileSize),
      'coverThumbnail': serializer.toJson<Uint8List?>(coverThumbnail),
      'dateAdded': serializer.toJson<DateTime>(dateAdded),
      'lastPage': serializer.toJson<int?>(lastPage),
      'lastLocation': serializer.toJson<String?>(lastLocation),
      'lastPercent': serializer.toJson<double?>(lastPercent),
      'lastRead': serializer.toJson<DateTime?>(lastRead),
      'completed': serializer.toJson<bool>(completed),
      'originConnectionId': serializer.toJson<String?>(originConnectionId),
      'originComicId': serializer.toJson<String?>(originComicId),
      'mediaType': serializer.toJson<String>(mediaType),
      'seriesName': serializer.toJson<String?>(seriesName),
      'volumeNumber': serializer.toJson<double?>(volumeNumber),
      'chapterNumber': serializer.toJson<double?>(chapterNumber),
      'author': serializer.toJson<String?>(author),
      'artist': serializer.toJson<String?>(artist),
      'genre': serializer.toJson<String?>(genre),
      'year': serializer.toJson<int?>(year),
      'summary': serializer.toJson<String?>(summary),
    };
  }

  ComicRow copyWith({
    int? id,
    String? uri,
    String? title,
    int? pageCount,
    int? fileSize,
    Value<Uint8List?> coverThumbnail = const Value.absent(),
    DateTime? dateAdded,
    Value<int?> lastPage = const Value.absent(),
    Value<String?> lastLocation = const Value.absent(),
    Value<double?> lastPercent = const Value.absent(),
    Value<DateTime?> lastRead = const Value.absent(),
    bool? completed,
    Value<String?> originConnectionId = const Value.absent(),
    Value<String?> originComicId = const Value.absent(),
    String? mediaType,
    Value<String?> seriesName = const Value.absent(),
    Value<double?> volumeNumber = const Value.absent(),
    Value<double?> chapterNumber = const Value.absent(),
    Value<String?> author = const Value.absent(),
    Value<String?> artist = const Value.absent(),
    Value<String?> genre = const Value.absent(),
    Value<int?> year = const Value.absent(),
    Value<String?> summary = const Value.absent(),
  }) => ComicRow(
    id: id ?? this.id,
    uri: uri ?? this.uri,
    title: title ?? this.title,
    pageCount: pageCount ?? this.pageCount,
    fileSize: fileSize ?? this.fileSize,
    coverThumbnail: coverThumbnail.present
        ? coverThumbnail.value
        : this.coverThumbnail,
    dateAdded: dateAdded ?? this.dateAdded,
    lastPage: lastPage.present ? lastPage.value : this.lastPage,
    lastLocation: lastLocation.present ? lastLocation.value : this.lastLocation,
    lastPercent: lastPercent.present ? lastPercent.value : this.lastPercent,
    lastRead: lastRead.present ? lastRead.value : this.lastRead,
    completed: completed ?? this.completed,
    originConnectionId: originConnectionId.present
        ? originConnectionId.value
        : this.originConnectionId,
    originComicId: originComicId.present
        ? originComicId.value
        : this.originComicId,
    mediaType: mediaType ?? this.mediaType,
    seriesName: seriesName.present ? seriesName.value : this.seriesName,
    volumeNumber: volumeNumber.present ? volumeNumber.value : this.volumeNumber,
    chapterNumber: chapterNumber.present
        ? chapterNumber.value
        : this.chapterNumber,
    author: author.present ? author.value : this.author,
    artist: artist.present ? artist.value : this.artist,
    genre: genre.present ? genre.value : this.genre,
    year: year.present ? year.value : this.year,
    summary: summary.present ? summary.value : this.summary,
  );
  ComicRow copyWithCompanion(ComicsCompanion data) {
    return ComicRow(
      id: data.id.present ? data.id.value : this.id,
      uri: data.uri.present ? data.uri.value : this.uri,
      title: data.title.present ? data.title.value : this.title,
      pageCount: data.pageCount.present ? data.pageCount.value : this.pageCount,
      fileSize: data.fileSize.present ? data.fileSize.value : this.fileSize,
      coverThumbnail: data.coverThumbnail.present
          ? data.coverThumbnail.value
          : this.coverThumbnail,
      dateAdded: data.dateAdded.present ? data.dateAdded.value : this.dateAdded,
      lastPage: data.lastPage.present ? data.lastPage.value : this.lastPage,
      lastLocation: data.lastLocation.present
          ? data.lastLocation.value
          : this.lastLocation,
      lastPercent: data.lastPercent.present
          ? data.lastPercent.value
          : this.lastPercent,
      lastRead: data.lastRead.present ? data.lastRead.value : this.lastRead,
      completed: data.completed.present ? data.completed.value : this.completed,
      originConnectionId: data.originConnectionId.present
          ? data.originConnectionId.value
          : this.originConnectionId,
      originComicId: data.originComicId.present
          ? data.originComicId.value
          : this.originComicId,
      mediaType: data.mediaType.present ? data.mediaType.value : this.mediaType,
      seriesName: data.seriesName.present
          ? data.seriesName.value
          : this.seriesName,
      volumeNumber: data.volumeNumber.present
          ? data.volumeNumber.value
          : this.volumeNumber,
      chapterNumber: data.chapterNumber.present
          ? data.chapterNumber.value
          : this.chapterNumber,
      author: data.author.present ? data.author.value : this.author,
      artist: data.artist.present ? data.artist.value : this.artist,
      genre: data.genre.present ? data.genre.value : this.genre,
      year: data.year.present ? data.year.value : this.year,
      summary: data.summary.present ? data.summary.value : this.summary,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ComicRow(')
          ..write('id: $id, ')
          ..write('uri: $uri, ')
          ..write('title: $title, ')
          ..write('pageCount: $pageCount, ')
          ..write('fileSize: $fileSize, ')
          ..write('coverThumbnail: $coverThumbnail, ')
          ..write('dateAdded: $dateAdded, ')
          ..write('lastPage: $lastPage, ')
          ..write('lastLocation: $lastLocation, ')
          ..write('lastPercent: $lastPercent, ')
          ..write('lastRead: $lastRead, ')
          ..write('completed: $completed, ')
          ..write('originConnectionId: $originConnectionId, ')
          ..write('originComicId: $originComicId, ')
          ..write('mediaType: $mediaType, ')
          ..write('seriesName: $seriesName, ')
          ..write('volumeNumber: $volumeNumber, ')
          ..write('chapterNumber: $chapterNumber, ')
          ..write('author: $author, ')
          ..write('artist: $artist, ')
          ..write('genre: $genre, ')
          ..write('year: $year, ')
          ..write('summary: $summary')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    id,
    uri,
    title,
    pageCount,
    fileSize,
    $driftBlobEquality.hash(coverThumbnail),
    dateAdded,
    lastPage,
    lastLocation,
    lastPercent,
    lastRead,
    completed,
    originConnectionId,
    originComicId,
    mediaType,
    seriesName,
    volumeNumber,
    chapterNumber,
    author,
    artist,
    genre,
    year,
    summary,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ComicRow &&
          other.id == this.id &&
          other.uri == this.uri &&
          other.title == this.title &&
          other.pageCount == this.pageCount &&
          other.fileSize == this.fileSize &&
          $driftBlobEquality.equals(
            other.coverThumbnail,
            this.coverThumbnail,
          ) &&
          other.dateAdded == this.dateAdded &&
          other.lastPage == this.lastPage &&
          other.lastLocation == this.lastLocation &&
          other.lastPercent == this.lastPercent &&
          other.lastRead == this.lastRead &&
          other.completed == this.completed &&
          other.originConnectionId == this.originConnectionId &&
          other.originComicId == this.originComicId &&
          other.mediaType == this.mediaType &&
          other.seriesName == this.seriesName &&
          other.volumeNumber == this.volumeNumber &&
          other.chapterNumber == this.chapterNumber &&
          other.author == this.author &&
          other.artist == this.artist &&
          other.genre == this.genre &&
          other.year == this.year &&
          other.summary == this.summary);
}

class ComicsCompanion extends UpdateCompanion<ComicRow> {
  final Value<int> id;
  final Value<String> uri;
  final Value<String> title;
  final Value<int> pageCount;
  final Value<int> fileSize;
  final Value<Uint8List?> coverThumbnail;
  final Value<DateTime> dateAdded;
  final Value<int?> lastPage;
  final Value<String?> lastLocation;
  final Value<double?> lastPercent;
  final Value<DateTime?> lastRead;
  final Value<bool> completed;
  final Value<String?> originConnectionId;
  final Value<String?> originComicId;
  final Value<String> mediaType;
  final Value<String?> seriesName;
  final Value<double?> volumeNumber;
  final Value<double?> chapterNumber;
  final Value<String?> author;
  final Value<String?> artist;
  final Value<String?> genre;
  final Value<int?> year;
  final Value<String?> summary;
  const ComicsCompanion({
    this.id = const Value.absent(),
    this.uri = const Value.absent(),
    this.title = const Value.absent(),
    this.pageCount = const Value.absent(),
    this.fileSize = const Value.absent(),
    this.coverThumbnail = const Value.absent(),
    this.dateAdded = const Value.absent(),
    this.lastPage = const Value.absent(),
    this.lastLocation = const Value.absent(),
    this.lastPercent = const Value.absent(),
    this.lastRead = const Value.absent(),
    this.completed = const Value.absent(),
    this.originConnectionId = const Value.absent(),
    this.originComicId = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.seriesName = const Value.absent(),
    this.volumeNumber = const Value.absent(),
    this.chapterNumber = const Value.absent(),
    this.author = const Value.absent(),
    this.artist = const Value.absent(),
    this.genre = const Value.absent(),
    this.year = const Value.absent(),
    this.summary = const Value.absent(),
  });
  ComicsCompanion.insert({
    this.id = const Value.absent(),
    required String uri,
    required String title,
    this.pageCount = const Value.absent(),
    this.fileSize = const Value.absent(),
    this.coverThumbnail = const Value.absent(),
    this.dateAdded = const Value.absent(),
    this.lastPage = const Value.absent(),
    this.lastLocation = const Value.absent(),
    this.lastPercent = const Value.absent(),
    this.lastRead = const Value.absent(),
    this.completed = const Value.absent(),
    this.originConnectionId = const Value.absent(),
    this.originComicId = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.seriesName = const Value.absent(),
    this.volumeNumber = const Value.absent(),
    this.chapterNumber = const Value.absent(),
    this.author = const Value.absent(),
    this.artist = const Value.absent(),
    this.genre = const Value.absent(),
    this.year = const Value.absent(),
    this.summary = const Value.absent(),
  }) : uri = Value(uri),
       title = Value(title);
  static Insertable<ComicRow> custom({
    Expression<int>? id,
    Expression<String>? uri,
    Expression<String>? title,
    Expression<int>? pageCount,
    Expression<int>? fileSize,
    Expression<Uint8List>? coverThumbnail,
    Expression<DateTime>? dateAdded,
    Expression<int>? lastPage,
    Expression<String>? lastLocation,
    Expression<double>? lastPercent,
    Expression<DateTime>? lastRead,
    Expression<bool>? completed,
    Expression<String>? originConnectionId,
    Expression<String>? originComicId,
    Expression<String>? mediaType,
    Expression<String>? seriesName,
    Expression<double>? volumeNumber,
    Expression<double>? chapterNumber,
    Expression<String>? author,
    Expression<String>? artist,
    Expression<String>? genre,
    Expression<int>? year,
    Expression<String>? summary,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (uri != null) 'uri': uri,
      if (title != null) 'title': title,
      if (pageCount != null) 'page_count': pageCount,
      if (fileSize != null) 'file_size': fileSize,
      if (coverThumbnail != null) 'cover_thumbnail': coverThumbnail,
      if (dateAdded != null) 'date_added': dateAdded,
      if (lastPage != null) 'last_page': lastPage,
      if (lastLocation != null) 'last_location': lastLocation,
      if (lastPercent != null) 'last_percent': lastPercent,
      if (lastRead != null) 'last_read': lastRead,
      if (completed != null) 'completed': completed,
      if (originConnectionId != null)
        'origin_connection_id': originConnectionId,
      if (originComicId != null) 'origin_comic_id': originComicId,
      if (mediaType != null) 'media_type': mediaType,
      if (seriesName != null) 'series_name': seriesName,
      if (volumeNumber != null) 'volume_number': volumeNumber,
      if (chapterNumber != null) 'chapter_number': chapterNumber,
      if (author != null) 'author': author,
      if (artist != null) 'artist': artist,
      if (genre != null) 'genre': genre,
      if (year != null) 'year': year,
      if (summary != null) 'summary': summary,
    });
  }

  ComicsCompanion copyWith({
    Value<int>? id,
    Value<String>? uri,
    Value<String>? title,
    Value<int>? pageCount,
    Value<int>? fileSize,
    Value<Uint8List?>? coverThumbnail,
    Value<DateTime>? dateAdded,
    Value<int?>? lastPage,
    Value<String?>? lastLocation,
    Value<double?>? lastPercent,
    Value<DateTime?>? lastRead,
    Value<bool>? completed,
    Value<String?>? originConnectionId,
    Value<String?>? originComicId,
    Value<String>? mediaType,
    Value<String?>? seriesName,
    Value<double?>? volumeNumber,
    Value<double?>? chapterNumber,
    Value<String?>? author,
    Value<String?>? artist,
    Value<String?>? genre,
    Value<int?>? year,
    Value<String?>? summary,
  }) {
    return ComicsCompanion(
      id: id ?? this.id,
      uri: uri ?? this.uri,
      title: title ?? this.title,
      pageCount: pageCount ?? this.pageCount,
      fileSize: fileSize ?? this.fileSize,
      coverThumbnail: coverThumbnail ?? this.coverThumbnail,
      dateAdded: dateAdded ?? this.dateAdded,
      lastPage: lastPage ?? this.lastPage,
      lastLocation: lastLocation ?? this.lastLocation,
      lastPercent: lastPercent ?? this.lastPercent,
      lastRead: lastRead ?? this.lastRead,
      completed: completed ?? this.completed,
      originConnectionId: originConnectionId ?? this.originConnectionId,
      originComicId: originComicId ?? this.originComicId,
      mediaType: mediaType ?? this.mediaType,
      seriesName: seriesName ?? this.seriesName,
      volumeNumber: volumeNumber ?? this.volumeNumber,
      chapterNumber: chapterNumber ?? this.chapterNumber,
      author: author ?? this.author,
      artist: artist ?? this.artist,
      genre: genre ?? this.genre,
      year: year ?? this.year,
      summary: summary ?? this.summary,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (uri.present) {
      map['uri'] = Variable<String>(uri.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (pageCount.present) {
      map['page_count'] = Variable<int>(pageCount.value);
    }
    if (fileSize.present) {
      map['file_size'] = Variable<int>(fileSize.value);
    }
    if (coverThumbnail.present) {
      map['cover_thumbnail'] = Variable<Uint8List>(coverThumbnail.value);
    }
    if (dateAdded.present) {
      map['date_added'] = Variable<DateTime>(dateAdded.value);
    }
    if (lastPage.present) {
      map['last_page'] = Variable<int>(lastPage.value);
    }
    if (lastLocation.present) {
      map['last_location'] = Variable<String>(lastLocation.value);
    }
    if (lastPercent.present) {
      map['last_percent'] = Variable<double>(lastPercent.value);
    }
    if (lastRead.present) {
      map['last_read'] = Variable<DateTime>(lastRead.value);
    }
    if (completed.present) {
      map['completed'] = Variable<bool>(completed.value);
    }
    if (originConnectionId.present) {
      map['origin_connection_id'] = Variable<String>(originConnectionId.value);
    }
    if (originComicId.present) {
      map['origin_comic_id'] = Variable<String>(originComicId.value);
    }
    if (mediaType.present) {
      map['media_type'] = Variable<String>(mediaType.value);
    }
    if (seriesName.present) {
      map['series_name'] = Variable<String>(seriesName.value);
    }
    if (volumeNumber.present) {
      map['volume_number'] = Variable<double>(volumeNumber.value);
    }
    if (chapterNumber.present) {
      map['chapter_number'] = Variable<double>(chapterNumber.value);
    }
    if (author.present) {
      map['author'] = Variable<String>(author.value);
    }
    if (artist.present) {
      map['artist'] = Variable<String>(artist.value);
    }
    if (genre.present) {
      map['genre'] = Variable<String>(genre.value);
    }
    if (year.present) {
      map['year'] = Variable<int>(year.value);
    }
    if (summary.present) {
      map['summary'] = Variable<String>(summary.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ComicsCompanion(')
          ..write('id: $id, ')
          ..write('uri: $uri, ')
          ..write('title: $title, ')
          ..write('pageCount: $pageCount, ')
          ..write('fileSize: $fileSize, ')
          ..write('coverThumbnail: $coverThumbnail, ')
          ..write('dateAdded: $dateAdded, ')
          ..write('lastPage: $lastPage, ')
          ..write('lastLocation: $lastLocation, ')
          ..write('lastPercent: $lastPercent, ')
          ..write('lastRead: $lastRead, ')
          ..write('completed: $completed, ')
          ..write('originConnectionId: $originConnectionId, ')
          ..write('originComicId: $originComicId, ')
          ..write('mediaType: $mediaType, ')
          ..write('seriesName: $seriesName, ')
          ..write('volumeNumber: $volumeNumber, ')
          ..write('chapterNumber: $chapterNumber, ')
          ..write('author: $author, ')
          ..write('artist: $artist, ')
          ..write('genre: $genre, ')
          ..write('year: $year, ')
          ..write('summary: $summary')
          ..write(')'))
        .toString();
  }
}

class $BookmarksTable extends Bookmarks
    with TableInfo<$BookmarksTable, Bookmark> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $BookmarksTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _pageMeta = const VerificationMeta('page');
  @override
  late final GeneratedColumn<int> page = GeneratedColumn<int>(
    'page',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationMeta = const VerificationMeta(
    'location',
  );
  @override
  late final GeneratedColumn<String> location = GeneratedColumn<String>(
    'location',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
    'note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    comicId,
    page,
    location,
    note,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'bookmarks';
  @override
  VerificationContext validateIntegrity(
    Insertable<Bookmark> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    } else if (isInserting) {
      context.missing(_comicIdMeta);
    }
    if (data.containsKey('page')) {
      context.handle(
        _pageMeta,
        page.isAcceptableOrUnknown(data['page']!, _pageMeta),
      );
    }
    if (data.containsKey('location')) {
      context.handle(
        _locationMeta,
        location.isAcceptableOrUnknown(data['location']!, _locationMeta),
      );
    }
    if (data.containsKey('note')) {
      context.handle(
        _noteMeta,
        note.isAcceptableOrUnknown(data['note']!, _noteMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Bookmark map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Bookmark(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
      page: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}page'],
      ),
      location: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}location'],
      ),
      note: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}note'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $BookmarksTable createAlias(String alias) {
    return $BookmarksTable(attachedDatabase, alias);
  }
}

class Bookmark extends DataClass implements Insertable<Bookmark> {
  /// Auto-incrementing primary key.
  final int id;

  /// Owning comic; bookmarks are deleted with their comic.
  final int comicId;

  /// Page index for comics/PDF, or the EPUB CFI string stuffed into [location].
  final int? page;

  /// EPUB CFI (or other locator) when the format isn't page-indexed.
  final String? location;

  /// Optional user note attached to the bookmark.
  final String? note;

  /// Creation timestamp; defaults to now.
  final DateTime createdAt;
  const Bookmark({
    required this.id,
    required this.comicId,
    this.page,
    this.location,
    this.note,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['comic_id'] = Variable<int>(comicId);
    if (!nullToAbsent || page != null) {
      map['page'] = Variable<int>(page);
    }
    if (!nullToAbsent || location != null) {
      map['location'] = Variable<String>(location);
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  BookmarksCompanion toCompanion(bool nullToAbsent) {
    return BookmarksCompanion(
      id: Value(id),
      comicId: Value(comicId),
      page: page == null && nullToAbsent ? const Value.absent() : Value(page),
      location: location == null && nullToAbsent
          ? const Value.absent()
          : Value(location),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      createdAt: Value(createdAt),
    );
  }

  factory Bookmark.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Bookmark(
      id: serializer.fromJson<int>(json['id']),
      comicId: serializer.fromJson<int>(json['comicId']),
      page: serializer.fromJson<int?>(json['page']),
      location: serializer.fromJson<String?>(json['location']),
      note: serializer.fromJson<String?>(json['note']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'comicId': serializer.toJson<int>(comicId),
      'page': serializer.toJson<int?>(page),
      'location': serializer.toJson<String?>(location),
      'note': serializer.toJson<String?>(note),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Bookmark copyWith({
    int? id,
    int? comicId,
    Value<int?> page = const Value.absent(),
    Value<String?> location = const Value.absent(),
    Value<String?> note = const Value.absent(),
    DateTime? createdAt,
  }) => Bookmark(
    id: id ?? this.id,
    comicId: comicId ?? this.comicId,
    page: page.present ? page.value : this.page,
    location: location.present ? location.value : this.location,
    note: note.present ? note.value : this.note,
    createdAt: createdAt ?? this.createdAt,
  );
  Bookmark copyWithCompanion(BookmarksCompanion data) {
    return Bookmark(
      id: data.id.present ? data.id.value : this.id,
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
      page: data.page.present ? data.page.value : this.page,
      location: data.location.present ? data.location.value : this.location,
      note: data.note.present ? data.note.value : this.note,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Bookmark(')
          ..write('id: $id, ')
          ..write('comicId: $comicId, ')
          ..write('page: $page, ')
          ..write('location: $location, ')
          ..write('note: $note, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, comicId, page, location, note, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Bookmark &&
          other.id == this.id &&
          other.comicId == this.comicId &&
          other.page == this.page &&
          other.location == this.location &&
          other.note == this.note &&
          other.createdAt == this.createdAt);
}

class BookmarksCompanion extends UpdateCompanion<Bookmark> {
  final Value<int> id;
  final Value<int> comicId;
  final Value<int?> page;
  final Value<String?> location;
  final Value<String?> note;
  final Value<DateTime> createdAt;
  const BookmarksCompanion({
    this.id = const Value.absent(),
    this.comicId = const Value.absent(),
    this.page = const Value.absent(),
    this.location = const Value.absent(),
    this.note = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  BookmarksCompanion.insert({
    this.id = const Value.absent(),
    required int comicId,
    this.page = const Value.absent(),
    this.location = const Value.absent(),
    this.note = const Value.absent(),
    this.createdAt = const Value.absent(),
  }) : comicId = Value(comicId);
  static Insertable<Bookmark> custom({
    Expression<int>? id,
    Expression<int>? comicId,
    Expression<int>? page,
    Expression<String>? location,
    Expression<String>? note,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (comicId != null) 'comic_id': comicId,
      if (page != null) 'page': page,
      if (location != null) 'location': location,
      if (note != null) 'note': note,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  BookmarksCompanion copyWith({
    Value<int>? id,
    Value<int>? comicId,
    Value<int?>? page,
    Value<String?>? location,
    Value<String?>? note,
    Value<DateTime>? createdAt,
  }) {
    return BookmarksCompanion(
      id: id ?? this.id,
      comicId: comicId ?? this.comicId,
      page: page ?? this.page,
      location: location ?? this.location,
      note: note ?? this.note,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (page.present) {
      map['page'] = Variable<int>(page.value);
    }
    if (location.present) {
      map['location'] = Variable<String>(location.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('BookmarksCompanion(')
          ..write('id: $id, ')
          ..write('comicId: $comicId, ')
          ..write('page: $page, ')
          ..write('location: $location, ')
          ..write('note: $note, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $ReadingHistoryTable extends ReadingHistory
    with TableInfo<$ReadingHistoryTable, ReadingHistoryData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ReadingHistoryTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _actionMeta = const VerificationMeta('action');
  @override
  late final GeneratedColumn<String> action = GeneratedColumn<String>(
    'action',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pageMeta = const VerificationMeta('page');
  @override
  late final GeneratedColumn<int> page = GeneratedColumn<int>(
    'page',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _timestampMeta = const VerificationMeta(
    'timestamp',
  );
  @override
  late final GeneratedColumn<DateTime> timestamp = GeneratedColumn<DateTime>(
    'timestamp',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [id, comicId, action, page, timestamp];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'reading_history';
  @override
  VerificationContext validateIntegrity(
    Insertable<ReadingHistoryData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    } else if (isInserting) {
      context.missing(_comicIdMeta);
    }
    if (data.containsKey('action')) {
      context.handle(
        _actionMeta,
        action.isAcceptableOrUnknown(data['action']!, _actionMeta),
      );
    } else if (isInserting) {
      context.missing(_actionMeta);
    }
    if (data.containsKey('page')) {
      context.handle(
        _pageMeta,
        page.isAcceptableOrUnknown(data['page']!, _pageMeta),
      );
    }
    if (data.containsKey('timestamp')) {
      context.handle(
        _timestampMeta,
        timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ReadingHistoryData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ReadingHistoryData(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
      action: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}action'],
      )!,
      page: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}page'],
      ),
      timestamp: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}timestamp'],
      )!,
    );
  }

  @override
  $ReadingHistoryTable createAlias(String alias) {
    return $ReadingHistoryTable(attachedDatabase, alias);
  }
}

class ReadingHistoryData extends DataClass
    implements Insertable<ReadingHistoryData> {
  /// Auto-incrementing primary key.
  final int id;

  /// Owning comic; history is deleted with its comic.
  final int comicId;

  /// Action name, e.g. `open`, `page`, `complete`.
  final String action;

  /// Page index the action occurred on, if applicable.
  final int? page;

  /// When the action happened; defaults to now.
  final DateTime timestamp;
  const ReadingHistoryData({
    required this.id,
    required this.comicId,
    required this.action,
    this.page,
    required this.timestamp,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['comic_id'] = Variable<int>(comicId);
    map['action'] = Variable<String>(action);
    if (!nullToAbsent || page != null) {
      map['page'] = Variable<int>(page);
    }
    map['timestamp'] = Variable<DateTime>(timestamp);
    return map;
  }

  ReadingHistoryCompanion toCompanion(bool nullToAbsent) {
    return ReadingHistoryCompanion(
      id: Value(id),
      comicId: Value(comicId),
      action: Value(action),
      page: page == null && nullToAbsent ? const Value.absent() : Value(page),
      timestamp: Value(timestamp),
    );
  }

  factory ReadingHistoryData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ReadingHistoryData(
      id: serializer.fromJson<int>(json['id']),
      comicId: serializer.fromJson<int>(json['comicId']),
      action: serializer.fromJson<String>(json['action']),
      page: serializer.fromJson<int?>(json['page']),
      timestamp: serializer.fromJson<DateTime>(json['timestamp']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'comicId': serializer.toJson<int>(comicId),
      'action': serializer.toJson<String>(action),
      'page': serializer.toJson<int?>(page),
      'timestamp': serializer.toJson<DateTime>(timestamp),
    };
  }

  ReadingHistoryData copyWith({
    int? id,
    int? comicId,
    String? action,
    Value<int?> page = const Value.absent(),
    DateTime? timestamp,
  }) => ReadingHistoryData(
    id: id ?? this.id,
    comicId: comicId ?? this.comicId,
    action: action ?? this.action,
    page: page.present ? page.value : this.page,
    timestamp: timestamp ?? this.timestamp,
  );
  ReadingHistoryData copyWithCompanion(ReadingHistoryCompanion data) {
    return ReadingHistoryData(
      id: data.id.present ? data.id.value : this.id,
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
      action: data.action.present ? data.action.value : this.action,
      page: data.page.present ? data.page.value : this.page,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ReadingHistoryData(')
          ..write('id: $id, ')
          ..write('comicId: $comicId, ')
          ..write('action: $action, ')
          ..write('page: $page, ')
          ..write('timestamp: $timestamp')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, comicId, action, page, timestamp);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ReadingHistoryData &&
          other.id == this.id &&
          other.comicId == this.comicId &&
          other.action == this.action &&
          other.page == this.page &&
          other.timestamp == this.timestamp);
}

class ReadingHistoryCompanion extends UpdateCompanion<ReadingHistoryData> {
  final Value<int> id;
  final Value<int> comicId;
  final Value<String> action;
  final Value<int?> page;
  final Value<DateTime> timestamp;
  const ReadingHistoryCompanion({
    this.id = const Value.absent(),
    this.comicId = const Value.absent(),
    this.action = const Value.absent(),
    this.page = const Value.absent(),
    this.timestamp = const Value.absent(),
  });
  ReadingHistoryCompanion.insert({
    this.id = const Value.absent(),
    required int comicId,
    required String action,
    this.page = const Value.absent(),
    this.timestamp = const Value.absent(),
  }) : comicId = Value(comicId),
       action = Value(action);
  static Insertable<ReadingHistoryData> custom({
    Expression<int>? id,
    Expression<int>? comicId,
    Expression<String>? action,
    Expression<int>? page,
    Expression<DateTime>? timestamp,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (comicId != null) 'comic_id': comicId,
      if (action != null) 'action': action,
      if (page != null) 'page': page,
      if (timestamp != null) 'timestamp': timestamp,
    });
  }

  ReadingHistoryCompanion copyWith({
    Value<int>? id,
    Value<int>? comicId,
    Value<String>? action,
    Value<int?>? page,
    Value<DateTime>? timestamp,
  }) {
    return ReadingHistoryCompanion(
      id: id ?? this.id,
      comicId: comicId ?? this.comicId,
      action: action ?? this.action,
      page: page ?? this.page,
      timestamp: timestamp ?? this.timestamp,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (action.present) {
      map['action'] = Variable<String>(action.value);
    }
    if (page.present) {
      map['page'] = Variable<int>(page.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<DateTime>(timestamp.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ReadingHistoryCompanion(')
          ..write('id: $id, ')
          ..write('comicId: $comicId, ')
          ..write('action: $action, ')
          ..write('page: $page, ')
          ..write('timestamp: $timestamp')
          ..write(')'))
        .toString();
  }
}

class $FavoritesTable extends Favorites
    with TableInfo<$FavoritesTable, Favorite> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FavoritesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [comicId, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'favorites';
  @override
  VerificationContext validateIntegrity(
    Insertable<Favorite> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {comicId};
  @override
  Favorite map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Favorite(
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $FavoritesTable createAlias(String alias) {
    return $FavoritesTable(attachedDatabase, alias);
  }
}

class Favorite extends DataClass implements Insertable<Favorite> {
  /// Favorited comic; the row is the (single-column) primary key.
  final int comicId;

  /// When the comic was favorited; defaults to now.
  final DateTime createdAt;
  const Favorite({required this.comicId, required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['comic_id'] = Variable<int>(comicId);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  FavoritesCompanion toCompanion(bool nullToAbsent) {
    return FavoritesCompanion(
      comicId: Value(comicId),
      createdAt: Value(createdAt),
    );
  }

  factory Favorite.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Favorite(
      comicId: serializer.fromJson<int>(json['comicId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'comicId': serializer.toJson<int>(comicId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Favorite copyWith({int? comicId, DateTime? createdAt}) => Favorite(
    comicId: comicId ?? this.comicId,
    createdAt: createdAt ?? this.createdAt,
  );
  Favorite copyWithCompanion(FavoritesCompanion data) {
    return Favorite(
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Favorite(')
          ..write('comicId: $comicId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(comicId, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Favorite &&
          other.comicId == this.comicId &&
          other.createdAt == this.createdAt);
}

class FavoritesCompanion extends UpdateCompanion<Favorite> {
  final Value<int> comicId;
  final Value<DateTime> createdAt;
  const FavoritesCompanion({
    this.comicId = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  FavoritesCompanion.insert({
    this.comicId = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  static Insertable<Favorite> custom({
    Expression<int>? comicId,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (comicId != null) 'comic_id': comicId,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  FavoritesCompanion copyWith({
    Value<int>? comicId,
    Value<DateTime>? createdAt,
  }) {
    return FavoritesCompanion(
      comicId: comicId ?? this.comicId,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FavoritesCompanion(')
          ..write('comicId: $comicId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $WantToReadTable extends WantToRead
    with TableInfo<$WantToReadTable, WantToReadData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WantToReadTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [comicId, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'want_to_read';
  @override
  VerificationContext validateIntegrity(
    Insertable<WantToReadData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {comicId};
  @override
  WantToReadData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WantToReadData(
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $WantToReadTable createAlias(String alias) {
    return $WantToReadTable(attachedDatabase, alias);
  }
}

class WantToReadData extends DataClass implements Insertable<WantToReadData> {
  /// Queued comic; the row is the (single-column) primary key.
  final int comicId;

  /// When the comic was added to the shelf; drives the shelf ordering.
  final DateTime createdAt;
  const WantToReadData({required this.comicId, required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['comic_id'] = Variable<int>(comicId);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  WantToReadCompanion toCompanion(bool nullToAbsent) {
    return WantToReadCompanion(
      comicId: Value(comicId),
      createdAt: Value(createdAt),
    );
  }

  factory WantToReadData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WantToReadData(
      comicId: serializer.fromJson<int>(json['comicId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'comicId': serializer.toJson<int>(comicId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  WantToReadData copyWith({int? comicId, DateTime? createdAt}) =>
      WantToReadData(
        comicId: comicId ?? this.comicId,
        createdAt: createdAt ?? this.createdAt,
      );
  WantToReadData copyWithCompanion(WantToReadCompanion data) {
    return WantToReadData(
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WantToReadData(')
          ..write('comicId: $comicId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(comicId, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WantToReadData &&
          other.comicId == this.comicId &&
          other.createdAt == this.createdAt);
}

class WantToReadCompanion extends UpdateCompanion<WantToReadData> {
  final Value<int> comicId;
  final Value<DateTime> createdAt;
  const WantToReadCompanion({
    this.comicId = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  WantToReadCompanion.insert({
    this.comicId = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  static Insertable<WantToReadData> custom({
    Expression<int>? comicId,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (comicId != null) 'comic_id': comicId,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  WantToReadCompanion copyWith({
    Value<int>? comicId,
    Value<DateTime>? createdAt,
  }) {
    return WantToReadCompanion(
      comicId: comicId ?? this.comicId,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WantToReadCompanion(')
          ..write('comicId: $comicId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $WatchedFoldersTable extends WatchedFolders
    with TableInfo<$WatchedFoldersTable, WatchedFolder> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WatchedFoldersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _pathMeta = const VerificationMeta('path');
  @override
  late final GeneratedColumn<String> path = GeneratedColumn<String>(
    'path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _lastScannedMeta = const VerificationMeta(
    'lastScanned',
  );
  @override
  late final GeneratedColumn<DateTime> lastScanned = GeneratedColumn<DateTime>(
    'last_scanned',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _autoScanMeta = const VerificationMeta(
    'autoScan',
  );
  @override
  late final GeneratedColumn<bool> autoScan = GeneratedColumn<bool>(
    'auto_scan',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("auto_scan" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _dateAddedMeta = const VerificationMeta(
    'dateAdded',
  );
  @override
  late final GeneratedColumn<DateTime> dateAdded = GeneratedColumn<DateTime>(
    'date_added',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    path,
    lastScanned,
    autoScan,
    dateAdded,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'watched_folders';
  @override
  VerificationContext validateIntegrity(
    Insertable<WatchedFolder> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('path')) {
      context.handle(
        _pathMeta,
        path.isAcceptableOrUnknown(data['path']!, _pathMeta),
      );
    } else if (isInserting) {
      context.missing(_pathMeta);
    }
    if (data.containsKey('last_scanned')) {
      context.handle(
        _lastScannedMeta,
        lastScanned.isAcceptableOrUnknown(
          data['last_scanned']!,
          _lastScannedMeta,
        ),
      );
    }
    if (data.containsKey('auto_scan')) {
      context.handle(
        _autoScanMeta,
        autoScan.isAcceptableOrUnknown(data['auto_scan']!, _autoScanMeta),
      );
    }
    if (data.containsKey('date_added')) {
      context.handle(
        _dateAddedMeta,
        dateAdded.isAcceptableOrUnknown(data['date_added']!, _dateAddedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  WatchedFolder map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WatchedFolder(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      path: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}path'],
      )!,
      lastScanned: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_scanned'],
      ),
      autoScan: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}auto_scan'],
      )!,
      dateAdded: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}date_added'],
      )!,
    );
  }

  @override
  $WatchedFoldersTable createAlias(String alias) {
    return $WatchedFoldersTable(attachedDatabase, alias);
  }
}

class WatchedFolder extends DataClass implements Insertable<WatchedFolder> {
  /// Auto-incrementing primary key.
  final int id;

  /// Absolute filesystem path of the watched directory. Unlike imported library
  /// files (stored relative to the app-support dir), a watched folder is an
  /// external location the user owns, so its absolute path is stored verbatim.
  final String path;

  /// When the folder was last scanned, for display; null until first scan.
  final DateTime? lastScanned;

  /// Whether the folder is rescanned automatically on app launch.
  final bool autoScan;

  /// When the folder was added; defaults to now.
  final DateTime dateAdded;
  const WatchedFolder({
    required this.id,
    required this.path,
    this.lastScanned,
    required this.autoScan,
    required this.dateAdded,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['path'] = Variable<String>(path);
    if (!nullToAbsent || lastScanned != null) {
      map['last_scanned'] = Variable<DateTime>(lastScanned);
    }
    map['auto_scan'] = Variable<bool>(autoScan);
    map['date_added'] = Variable<DateTime>(dateAdded);
    return map;
  }

  WatchedFoldersCompanion toCompanion(bool nullToAbsent) {
    return WatchedFoldersCompanion(
      id: Value(id),
      path: Value(path),
      lastScanned: lastScanned == null && nullToAbsent
          ? const Value.absent()
          : Value(lastScanned),
      autoScan: Value(autoScan),
      dateAdded: Value(dateAdded),
    );
  }

  factory WatchedFolder.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WatchedFolder(
      id: serializer.fromJson<int>(json['id']),
      path: serializer.fromJson<String>(json['path']),
      lastScanned: serializer.fromJson<DateTime?>(json['lastScanned']),
      autoScan: serializer.fromJson<bool>(json['autoScan']),
      dateAdded: serializer.fromJson<DateTime>(json['dateAdded']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'path': serializer.toJson<String>(path),
      'lastScanned': serializer.toJson<DateTime?>(lastScanned),
      'autoScan': serializer.toJson<bool>(autoScan),
      'dateAdded': serializer.toJson<DateTime>(dateAdded),
    };
  }

  WatchedFolder copyWith({
    int? id,
    String? path,
    Value<DateTime?> lastScanned = const Value.absent(),
    bool? autoScan,
    DateTime? dateAdded,
  }) => WatchedFolder(
    id: id ?? this.id,
    path: path ?? this.path,
    lastScanned: lastScanned.present ? lastScanned.value : this.lastScanned,
    autoScan: autoScan ?? this.autoScan,
    dateAdded: dateAdded ?? this.dateAdded,
  );
  WatchedFolder copyWithCompanion(WatchedFoldersCompanion data) {
    return WatchedFolder(
      id: data.id.present ? data.id.value : this.id,
      path: data.path.present ? data.path.value : this.path,
      lastScanned: data.lastScanned.present
          ? data.lastScanned.value
          : this.lastScanned,
      autoScan: data.autoScan.present ? data.autoScan.value : this.autoScan,
      dateAdded: data.dateAdded.present ? data.dateAdded.value : this.dateAdded,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WatchedFolder(')
          ..write('id: $id, ')
          ..write('path: $path, ')
          ..write('lastScanned: $lastScanned, ')
          ..write('autoScan: $autoScan, ')
          ..write('dateAdded: $dateAdded')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, path, lastScanned, autoScan, dateAdded);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WatchedFolder &&
          other.id == this.id &&
          other.path == this.path &&
          other.lastScanned == this.lastScanned &&
          other.autoScan == this.autoScan &&
          other.dateAdded == this.dateAdded);
}

class WatchedFoldersCompanion extends UpdateCompanion<WatchedFolder> {
  final Value<int> id;
  final Value<String> path;
  final Value<DateTime?> lastScanned;
  final Value<bool> autoScan;
  final Value<DateTime> dateAdded;
  const WatchedFoldersCompanion({
    this.id = const Value.absent(),
    this.path = const Value.absent(),
    this.lastScanned = const Value.absent(),
    this.autoScan = const Value.absent(),
    this.dateAdded = const Value.absent(),
  });
  WatchedFoldersCompanion.insert({
    this.id = const Value.absent(),
    required String path,
    this.lastScanned = const Value.absent(),
    this.autoScan = const Value.absent(),
    this.dateAdded = const Value.absent(),
  }) : path = Value(path);
  static Insertable<WatchedFolder> custom({
    Expression<int>? id,
    Expression<String>? path,
    Expression<DateTime>? lastScanned,
    Expression<bool>? autoScan,
    Expression<DateTime>? dateAdded,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (path != null) 'path': path,
      if (lastScanned != null) 'last_scanned': lastScanned,
      if (autoScan != null) 'auto_scan': autoScan,
      if (dateAdded != null) 'date_added': dateAdded,
    });
  }

  WatchedFoldersCompanion copyWith({
    Value<int>? id,
    Value<String>? path,
    Value<DateTime?>? lastScanned,
    Value<bool>? autoScan,
    Value<DateTime>? dateAdded,
  }) {
    return WatchedFoldersCompanion(
      id: id ?? this.id,
      path: path ?? this.path,
      lastScanned: lastScanned ?? this.lastScanned,
      autoScan: autoScan ?? this.autoScan,
      dateAdded: dateAdded ?? this.dateAdded,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (path.present) {
      map['path'] = Variable<String>(path.value);
    }
    if (lastScanned.present) {
      map['last_scanned'] = Variable<DateTime>(lastScanned.value);
    }
    if (autoScan.present) {
      map['auto_scan'] = Variable<bool>(autoScan.value);
    }
    if (dateAdded.present) {
      map['date_added'] = Variable<DateTime>(dateAdded.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WatchedFoldersCompanion(')
          ..write('id: $id, ')
          ..write('path: $path, ')
          ..write('lastScanned: $lastScanned, ')
          ..write('autoScan: $autoScan, ')
          ..write('dateAdded: $dateAdded')
          ..write(')'))
        .toString();
  }
}

class $LibrariesTable extends Libraries
    with TableInfo<$LibrariesTable, Library> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LibrariesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _mediaTypeMeta = const VerificationMeta(
    'mediaType',
  );
  @override
  late final GeneratedColumn<String> mediaType = GeneratedColumn<String>(
    'media_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(MediaTypes.comic),
  );
  static const VerificationMeta _dateCreatedMeta = const VerificationMeta(
    'dateCreated',
  );
  @override
  late final GeneratedColumn<DateTime> dateCreated = GeneratedColumn<DateTime>(
    'date_created',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [id, name, mediaType, dateCreated];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'libraries';
  @override
  VerificationContext validateIntegrity(
    Insertable<Library> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('media_type')) {
      context.handle(
        _mediaTypeMeta,
        mediaType.isAcceptableOrUnknown(data['media_type']!, _mediaTypeMeta),
      );
    }
    if (data.containsKey('date_created')) {
      context.handle(
        _dateCreatedMeta,
        dateCreated.isAcceptableOrUnknown(
          data['date_created']!,
          _dateCreatedMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Library map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Library(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      mediaType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}media_type'],
      )!,
      dateCreated: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}date_created'],
      )!,
    );
  }

  @override
  $LibrariesTable createAlias(String alias) {
    return $LibrariesTable(attachedDatabase, alias);
  }
}

class Library extends DataClass implements Insertable<Library> {
  /// Auto-incrementing primary key.
  final int id;

  /// Unique library name shown in the Collections tab.
  final String name;

  /// Media kind this library holds — see [MediaTypes].
  final String mediaType;

  /// Creation timestamp; defaults to now.
  final DateTime dateCreated;
  const Library({
    required this.id,
    required this.name,
    required this.mediaType,
    required this.dateCreated,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    map['media_type'] = Variable<String>(mediaType);
    map['date_created'] = Variable<DateTime>(dateCreated);
    return map;
  }

  LibrariesCompanion toCompanion(bool nullToAbsent) {
    return LibrariesCompanion(
      id: Value(id),
      name: Value(name),
      mediaType: Value(mediaType),
      dateCreated: Value(dateCreated),
    );
  }

  factory Library.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Library(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      mediaType: serializer.fromJson<String>(json['mediaType']),
      dateCreated: serializer.fromJson<DateTime>(json['dateCreated']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'mediaType': serializer.toJson<String>(mediaType),
      'dateCreated': serializer.toJson<DateTime>(dateCreated),
    };
  }

  Library copyWith({
    int? id,
    String? name,
    String? mediaType,
    DateTime? dateCreated,
  }) => Library(
    id: id ?? this.id,
    name: name ?? this.name,
    mediaType: mediaType ?? this.mediaType,
    dateCreated: dateCreated ?? this.dateCreated,
  );
  Library copyWithCompanion(LibrariesCompanion data) {
    return Library(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      mediaType: data.mediaType.present ? data.mediaType.value : this.mediaType,
      dateCreated: data.dateCreated.present
          ? data.dateCreated.value
          : this.dateCreated,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Library(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('mediaType: $mediaType, ')
          ..write('dateCreated: $dateCreated')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, mediaType, dateCreated);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Library &&
          other.id == this.id &&
          other.name == this.name &&
          other.mediaType == this.mediaType &&
          other.dateCreated == this.dateCreated);
}

class LibrariesCompanion extends UpdateCompanion<Library> {
  final Value<int> id;
  final Value<String> name;
  final Value<String> mediaType;
  final Value<DateTime> dateCreated;
  const LibrariesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.mediaType = const Value.absent(),
    this.dateCreated = const Value.absent(),
  });
  LibrariesCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    this.mediaType = const Value.absent(),
    this.dateCreated = const Value.absent(),
  }) : name = Value(name);
  static Insertable<Library> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<String>? mediaType,
    Expression<DateTime>? dateCreated,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (mediaType != null) 'media_type': mediaType,
      if (dateCreated != null) 'date_created': dateCreated,
    });
  }

  LibrariesCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<String>? mediaType,
    Value<DateTime>? dateCreated,
  }) {
    return LibrariesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      mediaType: mediaType ?? this.mediaType,
      dateCreated: dateCreated ?? this.dateCreated,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (mediaType.present) {
      map['media_type'] = Variable<String>(mediaType.value);
    }
    if (dateCreated.present) {
      map['date_created'] = Variable<DateTime>(dateCreated.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LibrariesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('mediaType: $mediaType, ')
          ..write('dateCreated: $dateCreated')
          ..write(')'))
        .toString();
  }
}

class $LibraryComicsTable extends LibraryComics
    with TableInfo<$LibraryComicsTable, LibraryComic> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LibraryComicsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _libraryIdMeta = const VerificationMeta(
    'libraryId',
  );
  @override
  late final GeneratedColumn<int> libraryId = GeneratedColumn<int>(
    'library_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES libraries (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  @override
  List<GeneratedColumn> get $columns => [libraryId, comicId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'library_comics';
  @override
  VerificationContext validateIntegrity(
    Insertable<LibraryComic> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('library_id')) {
      context.handle(
        _libraryIdMeta,
        libraryId.isAcceptableOrUnknown(data['library_id']!, _libraryIdMeta),
      );
    } else if (isInserting) {
      context.missing(_libraryIdMeta);
    }
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    } else if (isInserting) {
      context.missing(_comicIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {libraryId, comicId};
  @override
  LibraryComic map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LibraryComic(
      libraryId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}library_id'],
      )!,
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
    );
  }

  @override
  $LibraryComicsTable createAlias(String alias) {
    return $LibraryComicsTable(attachedDatabase, alias);
  }
}

class LibraryComic extends DataClass implements Insertable<LibraryComic> {
  /// Owning library; membership rows are deleted with the library.
  final int libraryId;

  /// Member comic; membership rows are deleted with the comic.
  final int comicId;
  const LibraryComic({required this.libraryId, required this.comicId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['library_id'] = Variable<int>(libraryId);
    map['comic_id'] = Variable<int>(comicId);
    return map;
  }

  LibraryComicsCompanion toCompanion(bool nullToAbsent) {
    return LibraryComicsCompanion(
      libraryId: Value(libraryId),
      comicId: Value(comicId),
    );
  }

  factory LibraryComic.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LibraryComic(
      libraryId: serializer.fromJson<int>(json['libraryId']),
      comicId: serializer.fromJson<int>(json['comicId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'libraryId': serializer.toJson<int>(libraryId),
      'comicId': serializer.toJson<int>(comicId),
    };
  }

  LibraryComic copyWith({int? libraryId, int? comicId}) => LibraryComic(
    libraryId: libraryId ?? this.libraryId,
    comicId: comicId ?? this.comicId,
  );
  LibraryComic copyWithCompanion(LibraryComicsCompanion data) {
    return LibraryComic(
      libraryId: data.libraryId.present ? data.libraryId.value : this.libraryId,
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LibraryComic(')
          ..write('libraryId: $libraryId, ')
          ..write('comicId: $comicId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(libraryId, comicId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LibraryComic &&
          other.libraryId == this.libraryId &&
          other.comicId == this.comicId);
}

class LibraryComicsCompanion extends UpdateCompanion<LibraryComic> {
  final Value<int> libraryId;
  final Value<int> comicId;
  final Value<int> rowid;
  const LibraryComicsCompanion({
    this.libraryId = const Value.absent(),
    this.comicId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LibraryComicsCompanion.insert({
    required int libraryId,
    required int comicId,
    this.rowid = const Value.absent(),
  }) : libraryId = Value(libraryId),
       comicId = Value(comicId);
  static Insertable<LibraryComic> custom({
    Expression<int>? libraryId,
    Expression<int>? comicId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (libraryId != null) 'library_id': libraryId,
      if (comicId != null) 'comic_id': comicId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LibraryComicsCompanion copyWith({
    Value<int>? libraryId,
    Value<int>? comicId,
    Value<int>? rowid,
  }) {
    return LibraryComicsCompanion(
      libraryId: libraryId ?? this.libraryId,
      comicId: comicId ?? this.comicId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (libraryId.present) {
      map['library_id'] = Variable<int>(libraryId.value);
    }
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LibraryComicsCompanion(')
          ..write('libraryId: $libraryId, ')
          ..write('comicId: $comicId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FoldersTable extends Folders with TableInfo<$FoldersTable, Folder> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FoldersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _coverComicIdMeta = const VerificationMeta(
    'coverComicId',
  );
  @override
  late final GeneratedColumn<int> coverComicId = GeneratedColumn<int>(
    'cover_comic_id',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE SET NULL',
    ),
  );
  static const VerificationMeta _dateCreatedMeta = const VerificationMeta(
    'dateCreated',
  );
  @override
  late final GeneratedColumn<DateTime> dateCreated = GeneratedColumn<DateTime>(
    'date_created',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [id, name, coverComicId, dateCreated];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'folders';
  @override
  VerificationContext validateIntegrity(
    Insertable<Folder> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('cover_comic_id')) {
      context.handle(
        _coverComicIdMeta,
        coverComicId.isAcceptableOrUnknown(
          data['cover_comic_id']!,
          _coverComicIdMeta,
        ),
      );
    }
    if (data.containsKey('date_created')) {
      context.handle(
        _dateCreatedMeta,
        dateCreated.isAcceptableOrUnknown(
          data['date_created']!,
          _dateCreatedMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Folder map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Folder(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      coverComicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}cover_comic_id'],
      ),
      dateCreated: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}date_created'],
      )!,
    );
  }

  @override
  $FoldersTable createAlias(String alias) {
    return $FoldersTable(attachedDatabase, alias);
  }
}

class Folder extends DataClass implements Insertable<Folder> {
  /// Auto-incrementing primary key.
  final int id;

  /// Folder display name.
  final String name;

  /// Comic whose cover represents the folder; cleared if that comic is removed.
  final int? coverComicId;

  /// Creation timestamp; defaults to now.
  final DateTime dateCreated;
  const Folder({
    required this.id,
    required this.name,
    this.coverComicId,
    required this.dateCreated,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || coverComicId != null) {
      map['cover_comic_id'] = Variable<int>(coverComicId);
    }
    map['date_created'] = Variable<DateTime>(dateCreated);
    return map;
  }

  FoldersCompanion toCompanion(bool nullToAbsent) {
    return FoldersCompanion(
      id: Value(id),
      name: Value(name),
      coverComicId: coverComicId == null && nullToAbsent
          ? const Value.absent()
          : Value(coverComicId),
      dateCreated: Value(dateCreated),
    );
  }

  factory Folder.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Folder(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      coverComicId: serializer.fromJson<int?>(json['coverComicId']),
      dateCreated: serializer.fromJson<DateTime>(json['dateCreated']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'coverComicId': serializer.toJson<int?>(coverComicId),
      'dateCreated': serializer.toJson<DateTime>(dateCreated),
    };
  }

  Folder copyWith({
    int? id,
    String? name,
    Value<int?> coverComicId = const Value.absent(),
    DateTime? dateCreated,
  }) => Folder(
    id: id ?? this.id,
    name: name ?? this.name,
    coverComicId: coverComicId.present ? coverComicId.value : this.coverComicId,
    dateCreated: dateCreated ?? this.dateCreated,
  );
  Folder copyWithCompanion(FoldersCompanion data) {
    return Folder(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      coverComicId: data.coverComicId.present
          ? data.coverComicId.value
          : this.coverComicId,
      dateCreated: data.dateCreated.present
          ? data.dateCreated.value
          : this.dateCreated,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Folder(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('coverComicId: $coverComicId, ')
          ..write('dateCreated: $dateCreated')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, coverComicId, dateCreated);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Folder &&
          other.id == this.id &&
          other.name == this.name &&
          other.coverComicId == this.coverComicId &&
          other.dateCreated == this.dateCreated);
}

class FoldersCompanion extends UpdateCompanion<Folder> {
  final Value<int> id;
  final Value<String> name;
  final Value<int?> coverComicId;
  final Value<DateTime> dateCreated;
  const FoldersCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.coverComicId = const Value.absent(),
    this.dateCreated = const Value.absent(),
  });
  FoldersCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    this.coverComicId = const Value.absent(),
    this.dateCreated = const Value.absent(),
  }) : name = Value(name);
  static Insertable<Folder> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<int>? coverComicId,
    Expression<DateTime>? dateCreated,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (coverComicId != null) 'cover_comic_id': coverComicId,
      if (dateCreated != null) 'date_created': dateCreated,
    });
  }

  FoldersCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<int?>? coverComicId,
    Value<DateTime>? dateCreated,
  }) {
    return FoldersCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      coverComicId: coverComicId ?? this.coverComicId,
      dateCreated: dateCreated ?? this.dateCreated,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (coverComicId.present) {
      map['cover_comic_id'] = Variable<int>(coverComicId.value);
    }
    if (dateCreated.present) {
      map['date_created'] = Variable<DateTime>(dateCreated.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FoldersCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('coverComicId: $coverComicId, ')
          ..write('dateCreated: $dateCreated')
          ..write(')'))
        .toString();
  }
}

class $FolderComicsTable extends FolderComics
    with TableInfo<$FolderComicsTable, FolderComic> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FolderComicsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _folderIdMeta = const VerificationMeta(
    'folderId',
  );
  @override
  late final GeneratedColumn<int> folderId = GeneratedColumn<int>(
    'folder_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES folders (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  @override
  List<GeneratedColumn> get $columns => [folderId, comicId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'folder_comics';
  @override
  VerificationContext validateIntegrity(
    Insertable<FolderComic> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('folder_id')) {
      context.handle(
        _folderIdMeta,
        folderId.isAcceptableOrUnknown(data['folder_id']!, _folderIdMeta),
      );
    } else if (isInserting) {
      context.missing(_folderIdMeta);
    }
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    } else if (isInserting) {
      context.missing(_comicIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {folderId, comicId};
  @override
  FolderComic map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FolderComic(
      folderId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}folder_id'],
      )!,
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
    );
  }

  @override
  $FolderComicsTable createAlias(String alias) {
    return $FolderComicsTable(attachedDatabase, alias);
  }
}

class FolderComic extends DataClass implements Insertable<FolderComic> {
  /// Owning folder; membership rows are deleted with the folder.
  final int folderId;

  /// Member comic; membership rows are deleted with the comic.
  final int comicId;
  const FolderComic({required this.folderId, required this.comicId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['folder_id'] = Variable<int>(folderId);
    map['comic_id'] = Variable<int>(comicId);
    return map;
  }

  FolderComicsCompanion toCompanion(bool nullToAbsent) {
    return FolderComicsCompanion(
      folderId: Value(folderId),
      comicId: Value(comicId),
    );
  }

  factory FolderComic.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FolderComic(
      folderId: serializer.fromJson<int>(json['folderId']),
      comicId: serializer.fromJson<int>(json['comicId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'folderId': serializer.toJson<int>(folderId),
      'comicId': serializer.toJson<int>(comicId),
    };
  }

  FolderComic copyWith({int? folderId, int? comicId}) => FolderComic(
    folderId: folderId ?? this.folderId,
    comicId: comicId ?? this.comicId,
  );
  FolderComic copyWithCompanion(FolderComicsCompanion data) {
    return FolderComic(
      folderId: data.folderId.present ? data.folderId.value : this.folderId,
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FolderComic(')
          ..write('folderId: $folderId, ')
          ..write('comicId: $comicId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(folderId, comicId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FolderComic &&
          other.folderId == this.folderId &&
          other.comicId == this.comicId);
}

class FolderComicsCompanion extends UpdateCompanion<FolderComic> {
  final Value<int> folderId;
  final Value<int> comicId;
  final Value<int> rowid;
  const FolderComicsCompanion({
    this.folderId = const Value.absent(),
    this.comicId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FolderComicsCompanion.insert({
    required int folderId,
    required int comicId,
    this.rowid = const Value.absent(),
  }) : folderId = Value(folderId),
       comicId = Value(comicId);
  static Insertable<FolderComic> custom({
    Expression<int>? folderId,
    Expression<int>? comicId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (folderId != null) 'folder_id': folderId,
      if (comicId != null) 'comic_id': comicId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FolderComicsCompanion copyWith({
    Value<int>? folderId,
    Value<int>? comicId,
    Value<int>? rowid,
  }) {
    return FolderComicsCompanion(
      folderId: folderId ?? this.folderId,
      comicId: comicId ?? this.comicId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (folderId.present) {
      map['folder_id'] = Variable<int>(folderId.value);
    }
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FolderComicsCompanion(')
          ..write('folderId: $folderId, ')
          ..write('comicId: $comicId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TagsTable extends Tags with TableInfo<$TagsTable, Tag> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TagsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  @override
  List<GeneratedColumn> get $columns => [id, name];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'tags';
  @override
  VerificationContext validateIntegrity(
    Insertable<Tag> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Tag map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Tag(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
    );
  }

  @override
  $TagsTable createAlias(String alias) {
    return $TagsTable(attachedDatabase, alias);
  }
}

class Tag extends DataClass implements Insertable<Tag> {
  /// Auto-incrementing primary key.
  final int id;

  /// Unique tag label.
  final String name;
  const Tag({required this.id, required this.name});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    return map;
  }

  TagsCompanion toCompanion(bool nullToAbsent) {
    return TagsCompanion(id: Value(id), name: Value(name));
  }

  factory Tag.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Tag(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
    };
  }

  Tag copyWith({int? id, String? name}) =>
      Tag(id: id ?? this.id, name: name ?? this.name);
  Tag copyWithCompanion(TagsCompanion data) {
    return Tag(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Tag(')
          ..write('id: $id, ')
          ..write('name: $name')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Tag && other.id == this.id && other.name == this.name);
}

class TagsCompanion extends UpdateCompanion<Tag> {
  final Value<int> id;
  final Value<String> name;
  const TagsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
  });
  TagsCompanion.insert({this.id = const Value.absent(), required String name})
    : name = Value(name);
  static Insertable<Tag> custom({
    Expression<int>? id,
    Expression<String>? name,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
    });
  }

  TagsCompanion copyWith({Value<int>? id, Value<String>? name}) {
    return TagsCompanion(id: id ?? this.id, name: name ?? this.name);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TagsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name')
          ..write(')'))
        .toString();
  }
}

class $ComicTagsTable extends ComicTags
    with TableInfo<$ComicTagsTable, ComicTag> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ComicTagsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _comicIdMeta = const VerificationMeta(
    'comicId',
  );
  @override
  late final GeneratedColumn<int> comicId = GeneratedColumn<int>(
    'comic_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES comics (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _tagIdMeta = const VerificationMeta('tagId');
  @override
  late final GeneratedColumn<int> tagId = GeneratedColumn<int>(
    'tag_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES tags (id) ON DELETE CASCADE',
    ),
  );
  @override
  List<GeneratedColumn> get $columns => [comicId, tagId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'comic_tags';
  @override
  VerificationContext validateIntegrity(
    Insertable<ComicTag> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('comic_id')) {
      context.handle(
        _comicIdMeta,
        comicId.isAcceptableOrUnknown(data['comic_id']!, _comicIdMeta),
      );
    } else if (isInserting) {
      context.missing(_comicIdMeta);
    }
    if (data.containsKey('tag_id')) {
      context.handle(
        _tagIdMeta,
        tagId.isAcceptableOrUnknown(data['tag_id']!, _tagIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tagIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {comicId, tagId};
  @override
  ComicTag map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ComicTag(
      comicId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}comic_id'],
      )!,
      tagId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}tag_id'],
      )!,
    );
  }

  @override
  $ComicTagsTable createAlias(String alias) {
    return $ComicTagsTable(attachedDatabase, alias);
  }
}

class ComicTag extends DataClass implements Insertable<ComicTag> {
  /// Tagged comic; tag links are deleted with the comic.
  final int comicId;

  /// Applied tag; links are deleted with the tag.
  final int tagId;
  const ComicTag({required this.comicId, required this.tagId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['comic_id'] = Variable<int>(comicId);
    map['tag_id'] = Variable<int>(tagId);
    return map;
  }

  ComicTagsCompanion toCompanion(bool nullToAbsent) {
    return ComicTagsCompanion(comicId: Value(comicId), tagId: Value(tagId));
  }

  factory ComicTag.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ComicTag(
      comicId: serializer.fromJson<int>(json['comicId']),
      tagId: serializer.fromJson<int>(json['tagId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'comicId': serializer.toJson<int>(comicId),
      'tagId': serializer.toJson<int>(tagId),
    };
  }

  ComicTag copyWith({int? comicId, int? tagId}) =>
      ComicTag(comicId: comicId ?? this.comicId, tagId: tagId ?? this.tagId);
  ComicTag copyWithCompanion(ComicTagsCompanion data) {
    return ComicTag(
      comicId: data.comicId.present ? data.comicId.value : this.comicId,
      tagId: data.tagId.present ? data.tagId.value : this.tagId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ComicTag(')
          ..write('comicId: $comicId, ')
          ..write('tagId: $tagId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(comicId, tagId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ComicTag &&
          other.comicId == this.comicId &&
          other.tagId == this.tagId);
}

class ComicTagsCompanion extends UpdateCompanion<ComicTag> {
  final Value<int> comicId;
  final Value<int> tagId;
  final Value<int> rowid;
  const ComicTagsCompanion({
    this.comicId = const Value.absent(),
    this.tagId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ComicTagsCompanion.insert({
    required int comicId,
    required int tagId,
    this.rowid = const Value.absent(),
  }) : comicId = Value(comicId),
       tagId = Value(tagId);
  static Insertable<ComicTag> custom({
    Expression<int>? comicId,
    Expression<int>? tagId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (comicId != null) 'comic_id': comicId,
      if (tagId != null) 'tag_id': tagId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ComicTagsCompanion copyWith({
    Value<int>? comicId,
    Value<int>? tagId,
    Value<int>? rowid,
  }) {
    return ComicTagsCompanion(
      comicId: comicId ?? this.comicId,
      tagId: tagId ?? this.tagId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (comicId.present) {
      map['comic_id'] = Variable<int>(comicId.value);
    }
    if (tagId.present) {
      map['tag_id'] = Variable<int>(tagId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ComicTagsCompanion(')
          ..write('comicId: $comicId, ')
          ..write('tagId: $tagId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ConnectionsTable extends Connections
    with TableInfo<$ConnectionsTable, ConnectionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ConnectionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _baseUrlMeta = const VerificationMeta(
    'baseUrl',
  );
  @override
  late final GeneratedColumn<String> baseUrl = GeneratedColumn<String>(
    'base_url',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _lastUsernameMeta = const VerificationMeta(
    'lastUsername',
  );
  @override
  late final GeneratedColumn<String> lastUsername = GeneratedColumn<String>(
    'last_username',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    baseUrl,
    lastUsername,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'connections';
  @override
  VerificationContext validateIntegrity(
    Insertable<ConnectionRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('base_url')) {
      context.handle(
        _baseUrlMeta,
        baseUrl.isAcceptableOrUnknown(data['base_url']!, _baseUrlMeta),
      );
    } else if (isInserting) {
      context.missing(_baseUrlMeta);
    }
    if (data.containsKey('last_username')) {
      context.handle(
        _lastUsernameMeta,
        lastUsername.isAcceptableOrUnknown(
          data['last_username']!,
          _lastUsernameMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ConnectionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ConnectionRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      baseUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}base_url'],
      )!,
      lastUsername: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_username'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $ConnectionsTable createAlias(String alias) {
    return $ConnectionsTable(attachedDatabase, alias);
  }
}

class ConnectionRow extends DataClass implements Insertable<ConnectionRow> {
  /// Auto-incrementing primary key.
  final int id;

  /// User-facing server name.
  final String name;

  /// Unique base URL of the CB8-compatible backend.
  final String baseUrl;

  /// Last username used to sign in, pre-filled on the next login.
  final String? lastUsername;

  /// When the connection was saved; defaults to now.
  final DateTime createdAt;
  const ConnectionRow({
    required this.id,
    required this.name,
    required this.baseUrl,
    this.lastUsername,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    map['base_url'] = Variable<String>(baseUrl);
    if (!nullToAbsent || lastUsername != null) {
      map['last_username'] = Variable<String>(lastUsername);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  ConnectionsCompanion toCompanion(bool nullToAbsent) {
    return ConnectionsCompanion(
      id: Value(id),
      name: Value(name),
      baseUrl: Value(baseUrl),
      lastUsername: lastUsername == null && nullToAbsent
          ? const Value.absent()
          : Value(lastUsername),
      createdAt: Value(createdAt),
    );
  }

  factory ConnectionRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ConnectionRow(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      baseUrl: serializer.fromJson<String>(json['baseUrl']),
      lastUsername: serializer.fromJson<String?>(json['lastUsername']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'baseUrl': serializer.toJson<String>(baseUrl),
      'lastUsername': serializer.toJson<String?>(lastUsername),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  ConnectionRow copyWith({
    int? id,
    String? name,
    String? baseUrl,
    Value<String?> lastUsername = const Value.absent(),
    DateTime? createdAt,
  }) => ConnectionRow(
    id: id ?? this.id,
    name: name ?? this.name,
    baseUrl: baseUrl ?? this.baseUrl,
    lastUsername: lastUsername.present ? lastUsername.value : this.lastUsername,
    createdAt: createdAt ?? this.createdAt,
  );
  ConnectionRow copyWithCompanion(ConnectionsCompanion data) {
    return ConnectionRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      baseUrl: data.baseUrl.present ? data.baseUrl.value : this.baseUrl,
      lastUsername: data.lastUsername.present
          ? data.lastUsername.value
          : this.lastUsername,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ConnectionRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('baseUrl: $baseUrl, ')
          ..write('lastUsername: $lastUsername, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, baseUrl, lastUsername, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ConnectionRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.baseUrl == this.baseUrl &&
          other.lastUsername == this.lastUsername &&
          other.createdAt == this.createdAt);
}

class ConnectionsCompanion extends UpdateCompanion<ConnectionRow> {
  final Value<int> id;
  final Value<String> name;
  final Value<String> baseUrl;
  final Value<String?> lastUsername;
  final Value<DateTime> createdAt;
  const ConnectionsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.baseUrl = const Value.absent(),
    this.lastUsername = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  ConnectionsCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    required String baseUrl,
    this.lastUsername = const Value.absent(),
    this.createdAt = const Value.absent(),
  }) : name = Value(name),
       baseUrl = Value(baseUrl);
  static Insertable<ConnectionRow> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<String>? baseUrl,
    Expression<String>? lastUsername,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (baseUrl != null) 'base_url': baseUrl,
      if (lastUsername != null) 'last_username': lastUsername,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  ConnectionsCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<String>? baseUrl,
    Value<String?>? lastUsername,
    Value<DateTime>? createdAt,
  }) {
    return ConnectionsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      baseUrl: baseUrl ?? this.baseUrl,
      lastUsername: lastUsername ?? this.lastUsername,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (baseUrl.present) {
      map['base_url'] = Variable<String>(baseUrl.value);
    }
    if (lastUsername.present) {
      map['last_username'] = Variable<String>(lastUsername.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ConnectionsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('baseUrl: $baseUrl, ')
          ..write('lastUsername: $lastUsername, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $ComicsTable comics = $ComicsTable(this);
  late final $BookmarksTable bookmarks = $BookmarksTable(this);
  late final $ReadingHistoryTable readingHistory = $ReadingHistoryTable(this);
  late final $FavoritesTable favorites = $FavoritesTable(this);
  late final $WantToReadTable wantToRead = $WantToReadTable(this);
  late final $WatchedFoldersTable watchedFolders = $WatchedFoldersTable(this);
  late final $LibrariesTable libraries = $LibrariesTable(this);
  late final $LibraryComicsTable libraryComics = $LibraryComicsTable(this);
  late final $FoldersTable folders = $FoldersTable(this);
  late final $FolderComicsTable folderComics = $FolderComicsTable(this);
  late final $TagsTable tags = $TagsTable(this);
  late final $ComicTagsTable comicTags = $ComicTagsTable(this);
  late final $ConnectionsTable connections = $ConnectionsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    comics,
    bookmarks,
    readingHistory,
    favorites,
    wantToRead,
    watchedFolders,
    libraries,
    libraryComics,
    folders,
    folderComics,
    tags,
    comicTags,
    connections,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('bookmarks', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('reading_history', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('favorites', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('want_to_read', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'libraries',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('library_comics', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('library_comics', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('folders', kind: UpdateKind.update)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'folders',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('folder_comics', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('folder_comics', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'comics',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('comic_tags', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'tags',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('comic_tags', kind: UpdateKind.delete)],
    ),
  ]);
}

typedef $$ComicsTableCreateCompanionBuilder =
    ComicsCompanion Function({
      Value<int> id,
      required String uri,
      required String title,
      Value<int> pageCount,
      Value<int> fileSize,
      Value<Uint8List?> coverThumbnail,
      Value<DateTime> dateAdded,
      Value<int?> lastPage,
      Value<String?> lastLocation,
      Value<double?> lastPercent,
      Value<DateTime?> lastRead,
      Value<bool> completed,
      Value<String?> originConnectionId,
      Value<String?> originComicId,
      Value<String> mediaType,
      Value<String?> seriesName,
      Value<double?> volumeNumber,
      Value<double?> chapterNumber,
      Value<String?> author,
      Value<String?> artist,
      Value<String?> genre,
      Value<int?> year,
      Value<String?> summary,
    });
typedef $$ComicsTableUpdateCompanionBuilder =
    ComicsCompanion Function({
      Value<int> id,
      Value<String> uri,
      Value<String> title,
      Value<int> pageCount,
      Value<int> fileSize,
      Value<Uint8List?> coverThumbnail,
      Value<DateTime> dateAdded,
      Value<int?> lastPage,
      Value<String?> lastLocation,
      Value<double?> lastPercent,
      Value<DateTime?> lastRead,
      Value<bool> completed,
      Value<String?> originConnectionId,
      Value<String?> originComicId,
      Value<String> mediaType,
      Value<String?> seriesName,
      Value<double?> volumeNumber,
      Value<double?> chapterNumber,
      Value<String?> author,
      Value<String?> artist,
      Value<String?> genre,
      Value<int?> year,
      Value<String?> summary,
    });

final class $$ComicsTableReferences
    extends BaseReferences<_$AppDatabase, $ComicsTable, ComicRow> {
  $$ComicsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$BookmarksTable, List<Bookmark>>
  _bookmarksRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.bookmarks,
    aliasName: 'comics__id__bookmarks__comic_id',
  );

  $$BookmarksTableProcessedTableManager get bookmarksRefs {
    final manager = $$BookmarksTableTableManager(
      $_db,
      $_db.bookmarks,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_bookmarksRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ReadingHistoryTable, List<ReadingHistoryData>>
  _readingHistoryRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.readingHistory,
    aliasName: 'comics__id__reading_history__comic_id',
  );

  $$ReadingHistoryTableProcessedTableManager get readingHistoryRefs {
    final manager = $$ReadingHistoryTableTableManager(
      $_db,
      $_db.readingHistory,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_readingHistoryRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$FavoritesTable, List<Favorite>>
  _favoritesRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.favorites,
    aliasName: 'comics__id__favorites__comic_id',
  );

  $$FavoritesTableProcessedTableManager get favoritesRefs {
    final manager = $$FavoritesTableTableManager(
      $_db,
      $_db.favorites,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_favoritesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$WantToReadTable, List<WantToReadData>>
  _wantToReadRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.wantToRead,
    aliasName: 'comics__id__want_to_read__comic_id',
  );

  $$WantToReadTableProcessedTableManager get wantToReadRefs {
    final manager = $$WantToReadTableTableManager(
      $_db,
      $_db.wantToRead,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_wantToReadRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$LibraryComicsTable, List<LibraryComic>>
  _libraryComicsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.libraryComics,
    aliasName: 'comics__id__library_comics__comic_id',
  );

  $$LibraryComicsTableProcessedTableManager get libraryComicsRefs {
    final manager = $$LibraryComicsTableTableManager(
      $_db,
      $_db.libraryComics,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_libraryComicsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$FoldersTable, List<Folder>> _foldersRefsTable(
    _$AppDatabase db,
  ) => MultiTypedResultKey.fromTable(
    db.folders,
    aliasName: 'comics__id__folders__cover_comic_id',
  );

  $$FoldersTableProcessedTableManager get foldersRefs {
    final manager = $$FoldersTableTableManager(
      $_db,
      $_db.folders,
    ).filter((f) => f.coverComicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_foldersRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$FolderComicsTable, List<FolderComic>>
  _folderComicsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.folderComics,
    aliasName: 'comics__id__folder_comics__comic_id',
  );

  $$FolderComicsTableProcessedTableManager get folderComicsRefs {
    final manager = $$FolderComicsTableTableManager(
      $_db,
      $_db.folderComics,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_folderComicsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ComicTagsTable, List<ComicTag>>
  _comicTagsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.comicTags,
    aliasName: 'comics__id__comic_tags__comic_id',
  );

  $$ComicTagsTableProcessedTableManager get comicTagsRefs {
    final manager = $$ComicTagsTableTableManager(
      $_db,
      $_db.comicTags,
    ).filter((f) => f.comicId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_comicTagsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ComicsTableFilterComposer
    extends Composer<_$AppDatabase, $ComicsTable> {
  $$ComicsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get uri => $composableBuilder(
    column: $table.uri,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get pageCount => $composableBuilder(
    column: $table.pageCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get fileSize => $composableBuilder(
    column: $table.fileSize,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get coverThumbnail => $composableBuilder(
    column: $table.coverThumbnail,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get dateAdded => $composableBuilder(
    column: $table.dateAdded,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get lastPage => $composableBuilder(
    column: $table.lastPage,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastLocation => $composableBuilder(
    column: $table.lastLocation,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get lastPercent => $composableBuilder(
    column: $table.lastPercent,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastRead => $composableBuilder(
    column: $table.lastRead,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get completed => $composableBuilder(
    column: $table.completed,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get originConnectionId => $composableBuilder(
    column: $table.originConnectionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get originComicId => $composableBuilder(
    column: $table.originComicId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get seriesName => $composableBuilder(
    column: $table.seriesName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get volumeNumber => $composableBuilder(
    column: $table.volumeNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get chapterNumber => $composableBuilder(
    column: $table.chapterNumber,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get author => $composableBuilder(
    column: $table.author,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get artist => $composableBuilder(
    column: $table.artist,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get genre => $composableBuilder(
    column: $table.genre,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get year => $composableBuilder(
    column: $table.year,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get summary => $composableBuilder(
    column: $table.summary,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> bookmarksRefs(
    Expression<bool> Function($$BookmarksTableFilterComposer f) f,
  ) {
    final $$BookmarksTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.bookmarks,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$BookmarksTableFilterComposer(
            $db: $db,
            $table: $db.bookmarks,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> readingHistoryRefs(
    Expression<bool> Function($$ReadingHistoryTableFilterComposer f) f,
  ) {
    final $$ReadingHistoryTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.readingHistory,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ReadingHistoryTableFilterComposer(
            $db: $db,
            $table: $db.readingHistory,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> favoritesRefs(
    Expression<bool> Function($$FavoritesTableFilterComposer f) f,
  ) {
    final $$FavoritesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.favorites,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FavoritesTableFilterComposer(
            $db: $db,
            $table: $db.favorites,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> wantToReadRefs(
    Expression<bool> Function($$WantToReadTableFilterComposer f) f,
  ) {
    final $$WantToReadTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.wantToRead,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WantToReadTableFilterComposer(
            $db: $db,
            $table: $db.wantToRead,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> libraryComicsRefs(
    Expression<bool> Function($$LibraryComicsTableFilterComposer f) f,
  ) {
    final $$LibraryComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.libraryComics,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibraryComicsTableFilterComposer(
            $db: $db,
            $table: $db.libraryComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> foldersRefs(
    Expression<bool> Function($$FoldersTableFilterComposer f) f,
  ) {
    final $$FoldersTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folders,
      getReferencedColumn: (t) => t.coverComicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FoldersTableFilterComposer(
            $db: $db,
            $table: $db.folders,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> folderComicsRefs(
    Expression<bool> Function($$FolderComicsTableFilterComposer f) f,
  ) {
    final $$FolderComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folderComics,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FolderComicsTableFilterComposer(
            $db: $db,
            $table: $db.folderComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> comicTagsRefs(
    Expression<bool> Function($$ComicTagsTableFilterComposer f) f,
  ) {
    final $$ComicTagsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.comicTags,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicTagsTableFilterComposer(
            $db: $db,
            $table: $db.comicTags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ComicsTableOrderingComposer
    extends Composer<_$AppDatabase, $ComicsTable> {
  $$ComicsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get uri => $composableBuilder(
    column: $table.uri,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get pageCount => $composableBuilder(
    column: $table.pageCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get fileSize => $composableBuilder(
    column: $table.fileSize,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get coverThumbnail => $composableBuilder(
    column: $table.coverThumbnail,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get dateAdded => $composableBuilder(
    column: $table.dateAdded,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get lastPage => $composableBuilder(
    column: $table.lastPage,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastLocation => $composableBuilder(
    column: $table.lastLocation,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get lastPercent => $composableBuilder(
    column: $table.lastPercent,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastRead => $composableBuilder(
    column: $table.lastRead,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get completed => $composableBuilder(
    column: $table.completed,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get originConnectionId => $composableBuilder(
    column: $table.originConnectionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get originComicId => $composableBuilder(
    column: $table.originComicId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get seriesName => $composableBuilder(
    column: $table.seriesName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get volumeNumber => $composableBuilder(
    column: $table.volumeNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get chapterNumber => $composableBuilder(
    column: $table.chapterNumber,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get author => $composableBuilder(
    column: $table.author,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get artist => $composableBuilder(
    column: $table.artist,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get genre => $composableBuilder(
    column: $table.genre,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get year => $composableBuilder(
    column: $table.year,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get summary => $composableBuilder(
    column: $table.summary,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ComicsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ComicsTable> {
  $$ComicsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get uri =>
      $composableBuilder(column: $table.uri, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<int> get pageCount =>
      $composableBuilder(column: $table.pageCount, builder: (column) => column);

  GeneratedColumn<int> get fileSize =>
      $composableBuilder(column: $table.fileSize, builder: (column) => column);

  GeneratedColumn<Uint8List> get coverThumbnail => $composableBuilder(
    column: $table.coverThumbnail,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get dateAdded =>
      $composableBuilder(column: $table.dateAdded, builder: (column) => column);

  GeneratedColumn<int> get lastPage =>
      $composableBuilder(column: $table.lastPage, builder: (column) => column);

  GeneratedColumn<String> get lastLocation => $composableBuilder(
    column: $table.lastLocation,
    builder: (column) => column,
  );

  GeneratedColumn<double> get lastPercent => $composableBuilder(
    column: $table.lastPercent,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get lastRead =>
      $composableBuilder(column: $table.lastRead, builder: (column) => column);

  GeneratedColumn<bool> get completed =>
      $composableBuilder(column: $table.completed, builder: (column) => column);

  GeneratedColumn<String> get originConnectionId => $composableBuilder(
    column: $table.originConnectionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get originComicId => $composableBuilder(
    column: $table.originComicId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get mediaType =>
      $composableBuilder(column: $table.mediaType, builder: (column) => column);

  GeneratedColumn<String> get seriesName => $composableBuilder(
    column: $table.seriesName,
    builder: (column) => column,
  );

  GeneratedColumn<double> get volumeNumber => $composableBuilder(
    column: $table.volumeNumber,
    builder: (column) => column,
  );

  GeneratedColumn<double> get chapterNumber => $composableBuilder(
    column: $table.chapterNumber,
    builder: (column) => column,
  );

  GeneratedColumn<String> get author =>
      $composableBuilder(column: $table.author, builder: (column) => column);

  GeneratedColumn<String> get artist =>
      $composableBuilder(column: $table.artist, builder: (column) => column);

  GeneratedColumn<String> get genre =>
      $composableBuilder(column: $table.genre, builder: (column) => column);

  GeneratedColumn<int> get year =>
      $composableBuilder(column: $table.year, builder: (column) => column);

  GeneratedColumn<String> get summary =>
      $composableBuilder(column: $table.summary, builder: (column) => column);

  Expression<T> bookmarksRefs<T extends Object>(
    Expression<T> Function($$BookmarksTableAnnotationComposer a) f,
  ) {
    final $$BookmarksTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.bookmarks,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$BookmarksTableAnnotationComposer(
            $db: $db,
            $table: $db.bookmarks,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> readingHistoryRefs<T extends Object>(
    Expression<T> Function($$ReadingHistoryTableAnnotationComposer a) f,
  ) {
    final $$ReadingHistoryTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.readingHistory,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ReadingHistoryTableAnnotationComposer(
            $db: $db,
            $table: $db.readingHistory,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> favoritesRefs<T extends Object>(
    Expression<T> Function($$FavoritesTableAnnotationComposer a) f,
  ) {
    final $$FavoritesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.favorites,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FavoritesTableAnnotationComposer(
            $db: $db,
            $table: $db.favorites,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> wantToReadRefs<T extends Object>(
    Expression<T> Function($$WantToReadTableAnnotationComposer a) f,
  ) {
    final $$WantToReadTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.wantToRead,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WantToReadTableAnnotationComposer(
            $db: $db,
            $table: $db.wantToRead,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> libraryComicsRefs<T extends Object>(
    Expression<T> Function($$LibraryComicsTableAnnotationComposer a) f,
  ) {
    final $$LibraryComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.libraryComics,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibraryComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.libraryComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> foldersRefs<T extends Object>(
    Expression<T> Function($$FoldersTableAnnotationComposer a) f,
  ) {
    final $$FoldersTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folders,
      getReferencedColumn: (t) => t.coverComicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FoldersTableAnnotationComposer(
            $db: $db,
            $table: $db.folders,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> folderComicsRefs<T extends Object>(
    Expression<T> Function($$FolderComicsTableAnnotationComposer a) f,
  ) {
    final $$FolderComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folderComics,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FolderComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.folderComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> comicTagsRefs<T extends Object>(
    Expression<T> Function($$ComicTagsTableAnnotationComposer a) f,
  ) {
    final $$ComicTagsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.comicTags,
      getReferencedColumn: (t) => t.comicId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicTagsTableAnnotationComposer(
            $db: $db,
            $table: $db.comicTags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ComicsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ComicsTable,
          ComicRow,
          $$ComicsTableFilterComposer,
          $$ComicsTableOrderingComposer,
          $$ComicsTableAnnotationComposer,
          $$ComicsTableCreateCompanionBuilder,
          $$ComicsTableUpdateCompanionBuilder,
          (ComicRow, $$ComicsTableReferences),
          ComicRow,
          PrefetchHooks Function({
            bool bookmarksRefs,
            bool readingHistoryRefs,
            bool favoritesRefs,
            bool wantToReadRefs,
            bool libraryComicsRefs,
            bool foldersRefs,
            bool folderComicsRefs,
            bool comicTagsRefs,
          })
        > {
  $$ComicsTableTableManager(_$AppDatabase db, $ComicsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ComicsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ComicsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ComicsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> uri = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<int> pageCount = const Value.absent(),
                Value<int> fileSize = const Value.absent(),
                Value<Uint8List?> coverThumbnail = const Value.absent(),
                Value<DateTime> dateAdded = const Value.absent(),
                Value<int?> lastPage = const Value.absent(),
                Value<String?> lastLocation = const Value.absent(),
                Value<double?> lastPercent = const Value.absent(),
                Value<DateTime?> lastRead = const Value.absent(),
                Value<bool> completed = const Value.absent(),
                Value<String?> originConnectionId = const Value.absent(),
                Value<String?> originComicId = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<String?> seriesName = const Value.absent(),
                Value<double?> volumeNumber = const Value.absent(),
                Value<double?> chapterNumber = const Value.absent(),
                Value<String?> author = const Value.absent(),
                Value<String?> artist = const Value.absent(),
                Value<String?> genre = const Value.absent(),
                Value<int?> year = const Value.absent(),
                Value<String?> summary = const Value.absent(),
              }) => ComicsCompanion(
                id: id,
                uri: uri,
                title: title,
                pageCount: pageCount,
                fileSize: fileSize,
                coverThumbnail: coverThumbnail,
                dateAdded: dateAdded,
                lastPage: lastPage,
                lastLocation: lastLocation,
                lastPercent: lastPercent,
                lastRead: lastRead,
                completed: completed,
                originConnectionId: originConnectionId,
                originComicId: originComicId,
                mediaType: mediaType,
                seriesName: seriesName,
                volumeNumber: volumeNumber,
                chapterNumber: chapterNumber,
                author: author,
                artist: artist,
                genre: genre,
                year: year,
                summary: summary,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String uri,
                required String title,
                Value<int> pageCount = const Value.absent(),
                Value<int> fileSize = const Value.absent(),
                Value<Uint8List?> coverThumbnail = const Value.absent(),
                Value<DateTime> dateAdded = const Value.absent(),
                Value<int?> lastPage = const Value.absent(),
                Value<String?> lastLocation = const Value.absent(),
                Value<double?> lastPercent = const Value.absent(),
                Value<DateTime?> lastRead = const Value.absent(),
                Value<bool> completed = const Value.absent(),
                Value<String?> originConnectionId = const Value.absent(),
                Value<String?> originComicId = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<String?> seriesName = const Value.absent(),
                Value<double?> volumeNumber = const Value.absent(),
                Value<double?> chapterNumber = const Value.absent(),
                Value<String?> author = const Value.absent(),
                Value<String?> artist = const Value.absent(),
                Value<String?> genre = const Value.absent(),
                Value<int?> year = const Value.absent(),
                Value<String?> summary = const Value.absent(),
              }) => ComicsCompanion.insert(
                id: id,
                uri: uri,
                title: title,
                pageCount: pageCount,
                fileSize: fileSize,
                coverThumbnail: coverThumbnail,
                dateAdded: dateAdded,
                lastPage: lastPage,
                lastLocation: lastLocation,
                lastPercent: lastPercent,
                lastRead: lastRead,
                completed: completed,
                originConnectionId: originConnectionId,
                originComicId: originComicId,
                mediaType: mediaType,
                seriesName: seriesName,
                volumeNumber: volumeNumber,
                chapterNumber: chapterNumber,
                author: author,
                artist: artist,
                genre: genre,
                year: year,
                summary: summary,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) =>
                    (e.readTable(table), $$ComicsTableReferences(db, table, e)),
              )
              .toList(),
          prefetchHooksCallback:
              ({
                bookmarksRefs = false,
                readingHistoryRefs = false,
                favoritesRefs = false,
                wantToReadRefs = false,
                libraryComicsRefs = false,
                foldersRefs = false,
                folderComicsRefs = false,
                comicTagsRefs = false,
              }) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (bookmarksRefs) db.bookmarks,
                    if (readingHistoryRefs) db.readingHistory,
                    if (favoritesRefs) db.favorites,
                    if (wantToReadRefs) db.wantToRead,
                    if (libraryComicsRefs) db.libraryComics,
                    if (foldersRefs) db.folders,
                    if (folderComicsRefs) db.folderComics,
                    if (comicTagsRefs) db.comicTags,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (bookmarksRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          Bookmark
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._bookmarksRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).bookmarksRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (readingHistoryRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          ReadingHistoryData
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._readingHistoryRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).readingHistoryRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (favoritesRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          Favorite
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._favoritesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).favoritesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (wantToReadRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          WantToReadData
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._wantToReadRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).wantToReadRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (libraryComicsRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          LibraryComic
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._libraryComicsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).libraryComicsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (foldersRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          Folder
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._foldersRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).foldersRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.coverComicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (folderComicsRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          FolderComic
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._folderComicsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).folderComicsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (comicTagsRefs)
                        await $_getPrefetchedData<
                          ComicRow,
                          $ComicsTable,
                          ComicTag
                        >(
                          currentTable: table,
                          referencedTable: $$ComicsTableReferences
                              ._comicTagsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ComicsTableReferences(
                                db,
                                table,
                                p0,
                              ).comicTagsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.comicId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$ComicsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ComicsTable,
      ComicRow,
      $$ComicsTableFilterComposer,
      $$ComicsTableOrderingComposer,
      $$ComicsTableAnnotationComposer,
      $$ComicsTableCreateCompanionBuilder,
      $$ComicsTableUpdateCompanionBuilder,
      (ComicRow, $$ComicsTableReferences),
      ComicRow,
      PrefetchHooks Function({
        bool bookmarksRefs,
        bool readingHistoryRefs,
        bool favoritesRefs,
        bool wantToReadRefs,
        bool libraryComicsRefs,
        bool foldersRefs,
        bool folderComicsRefs,
        bool comicTagsRefs,
      })
    >;
typedef $$BookmarksTableCreateCompanionBuilder =
    BookmarksCompanion Function({
      Value<int> id,
      required int comicId,
      Value<int?> page,
      Value<String?> location,
      Value<String?> note,
      Value<DateTime> createdAt,
    });
typedef $$BookmarksTableUpdateCompanionBuilder =
    BookmarksCompanion Function({
      Value<int> id,
      Value<int> comicId,
      Value<int?> page,
      Value<String?> location,
      Value<String?> note,
      Value<DateTime> createdAt,
    });

final class $$BookmarksTableReferences
    extends BaseReferences<_$AppDatabase, $BookmarksTable, Bookmark> {
  $$BookmarksTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('bookmarks__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$BookmarksTableFilterComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get page => $composableBuilder(
    column: $table.page,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get location => $composableBuilder(
    column: $table.location,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$BookmarksTableOrderingComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get page => $composableBuilder(
    column: $table.page,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get location => $composableBuilder(
    column: $table.location,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get note => $composableBuilder(
    column: $table.note,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$BookmarksTableAnnotationComposer
    extends Composer<_$AppDatabase, $BookmarksTable> {
  $$BookmarksTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get page =>
      $composableBuilder(column: $table.page, builder: (column) => column);

  GeneratedColumn<String> get location =>
      $composableBuilder(column: $table.location, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$BookmarksTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $BookmarksTable,
          Bookmark,
          $$BookmarksTableFilterComposer,
          $$BookmarksTableOrderingComposer,
          $$BookmarksTableAnnotationComposer,
          $$BookmarksTableCreateCompanionBuilder,
          $$BookmarksTableUpdateCompanionBuilder,
          (Bookmark, $$BookmarksTableReferences),
          Bookmark,
          PrefetchHooks Function({bool comicId})
        > {
  $$BookmarksTableTableManager(_$AppDatabase db, $BookmarksTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$BookmarksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$BookmarksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$BookmarksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> comicId = const Value.absent(),
                Value<int?> page = const Value.absent(),
                Value<String?> location = const Value.absent(),
                Value<String?> note = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => BookmarksCompanion(
                id: id,
                comicId: comicId,
                page: page,
                location: location,
                note: note,
                createdAt: createdAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int comicId,
                Value<int?> page = const Value.absent(),
                Value<String?> location = const Value.absent(),
                Value<String?> note = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => BookmarksCompanion.insert(
                id: id,
                comicId: comicId,
                page: page,
                location: location,
                note: note,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$BookmarksTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$BookmarksTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$BookmarksTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$BookmarksTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $BookmarksTable,
      Bookmark,
      $$BookmarksTableFilterComposer,
      $$BookmarksTableOrderingComposer,
      $$BookmarksTableAnnotationComposer,
      $$BookmarksTableCreateCompanionBuilder,
      $$BookmarksTableUpdateCompanionBuilder,
      (Bookmark, $$BookmarksTableReferences),
      Bookmark,
      PrefetchHooks Function({bool comicId})
    >;
typedef $$ReadingHistoryTableCreateCompanionBuilder =
    ReadingHistoryCompanion Function({
      Value<int> id,
      required int comicId,
      required String action,
      Value<int?> page,
      Value<DateTime> timestamp,
    });
typedef $$ReadingHistoryTableUpdateCompanionBuilder =
    ReadingHistoryCompanion Function({
      Value<int> id,
      Value<int> comicId,
      Value<String> action,
      Value<int?> page,
      Value<DateTime> timestamp,
    });

final class $$ReadingHistoryTableReferences
    extends
        BaseReferences<
          _$AppDatabase,
          $ReadingHistoryTable,
          ReadingHistoryData
        > {
  $$ReadingHistoryTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('reading_history__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ReadingHistoryTableFilterComposer
    extends Composer<_$AppDatabase, $ReadingHistoryTable> {
  $$ReadingHistoryTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get action => $composableBuilder(
    column: $table.action,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get page => $composableBuilder(
    column: $table.page,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get timestamp => $composableBuilder(
    column: $table.timestamp,
    builder: (column) => ColumnFilters(column),
  );

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ReadingHistoryTableOrderingComposer
    extends Composer<_$AppDatabase, $ReadingHistoryTable> {
  $$ReadingHistoryTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get action => $composableBuilder(
    column: $table.action,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get page => $composableBuilder(
    column: $table.page,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get timestamp => $composableBuilder(
    column: $table.timestamp,
    builder: (column) => ColumnOrderings(column),
  );

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ReadingHistoryTableAnnotationComposer
    extends Composer<_$AppDatabase, $ReadingHistoryTable> {
  $$ReadingHistoryTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get action =>
      $composableBuilder(column: $table.action, builder: (column) => column);

  GeneratedColumn<int> get page =>
      $composableBuilder(column: $table.page, builder: (column) => column);

  GeneratedColumn<DateTime> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => column);

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ReadingHistoryTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ReadingHistoryTable,
          ReadingHistoryData,
          $$ReadingHistoryTableFilterComposer,
          $$ReadingHistoryTableOrderingComposer,
          $$ReadingHistoryTableAnnotationComposer,
          $$ReadingHistoryTableCreateCompanionBuilder,
          $$ReadingHistoryTableUpdateCompanionBuilder,
          (ReadingHistoryData, $$ReadingHistoryTableReferences),
          ReadingHistoryData,
          PrefetchHooks Function({bool comicId})
        > {
  $$ReadingHistoryTableTableManager(
    _$AppDatabase db,
    $ReadingHistoryTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ReadingHistoryTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ReadingHistoryTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ReadingHistoryTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> comicId = const Value.absent(),
                Value<String> action = const Value.absent(),
                Value<int?> page = const Value.absent(),
                Value<DateTime> timestamp = const Value.absent(),
              }) => ReadingHistoryCompanion(
                id: id,
                comicId: comicId,
                action: action,
                page: page,
                timestamp: timestamp,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int comicId,
                required String action,
                Value<int?> page = const Value.absent(),
                Value<DateTime> timestamp = const Value.absent(),
              }) => ReadingHistoryCompanion.insert(
                id: id,
                comicId: comicId,
                action: action,
                page: page,
                timestamp: timestamp,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ReadingHistoryTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$ReadingHistoryTableReferences
                                    ._comicIdTable(db),
                                referencedColumn:
                                    $$ReadingHistoryTableReferences
                                        ._comicIdTable(db)
                                        .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ReadingHistoryTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ReadingHistoryTable,
      ReadingHistoryData,
      $$ReadingHistoryTableFilterComposer,
      $$ReadingHistoryTableOrderingComposer,
      $$ReadingHistoryTableAnnotationComposer,
      $$ReadingHistoryTableCreateCompanionBuilder,
      $$ReadingHistoryTableUpdateCompanionBuilder,
      (ReadingHistoryData, $$ReadingHistoryTableReferences),
      ReadingHistoryData,
      PrefetchHooks Function({bool comicId})
    >;
typedef $$FavoritesTableCreateCompanionBuilder =
    FavoritesCompanion Function({
      Value<int> comicId,
      Value<DateTime> createdAt,
    });
typedef $$FavoritesTableUpdateCompanionBuilder =
    FavoritesCompanion Function({
      Value<int> comicId,
      Value<DateTime> createdAt,
    });

final class $$FavoritesTableReferences
    extends BaseReferences<_$AppDatabase, $FavoritesTable, Favorite> {
  $$FavoritesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('favorites__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$FavoritesTableFilterComposer
    extends Composer<_$AppDatabase, $FavoritesTable> {
  $$FavoritesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FavoritesTableOrderingComposer
    extends Composer<_$AppDatabase, $FavoritesTable> {
  $$FavoritesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FavoritesTableAnnotationComposer
    extends Composer<_$AppDatabase, $FavoritesTable> {
  $$FavoritesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FavoritesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FavoritesTable,
          Favorite,
          $$FavoritesTableFilterComposer,
          $$FavoritesTableOrderingComposer,
          $$FavoritesTableAnnotationComposer,
          $$FavoritesTableCreateCompanionBuilder,
          $$FavoritesTableUpdateCompanionBuilder,
          (Favorite, $$FavoritesTableReferences),
          Favorite,
          PrefetchHooks Function({bool comicId})
        > {
  $$FavoritesTableTableManager(_$AppDatabase db, $FavoritesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FavoritesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FavoritesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FavoritesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> comicId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => FavoritesCompanion(comicId: comicId, createdAt: createdAt),
          createCompanionCallback:
              ({
                Value<int> comicId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => FavoritesCompanion.insert(
                comicId: comicId,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$FavoritesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$FavoritesTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$FavoritesTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$FavoritesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FavoritesTable,
      Favorite,
      $$FavoritesTableFilterComposer,
      $$FavoritesTableOrderingComposer,
      $$FavoritesTableAnnotationComposer,
      $$FavoritesTableCreateCompanionBuilder,
      $$FavoritesTableUpdateCompanionBuilder,
      (Favorite, $$FavoritesTableReferences),
      Favorite,
      PrefetchHooks Function({bool comicId})
    >;
typedef $$WantToReadTableCreateCompanionBuilder =
    WantToReadCompanion Function({
      Value<int> comicId,
      Value<DateTime> createdAt,
    });
typedef $$WantToReadTableUpdateCompanionBuilder =
    WantToReadCompanion Function({
      Value<int> comicId,
      Value<DateTime> createdAt,
    });

final class $$WantToReadTableReferences
    extends BaseReferences<_$AppDatabase, $WantToReadTable, WantToReadData> {
  $$WantToReadTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('want_to_read__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$WantToReadTableFilterComposer
    extends Composer<_$AppDatabase, $WantToReadTable> {
  $$WantToReadTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$WantToReadTableOrderingComposer
    extends Composer<_$AppDatabase, $WantToReadTable> {
  $$WantToReadTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$WantToReadTableAnnotationComposer
    extends Composer<_$AppDatabase, $WantToReadTable> {
  $$WantToReadTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$WantToReadTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $WantToReadTable,
          WantToReadData,
          $$WantToReadTableFilterComposer,
          $$WantToReadTableOrderingComposer,
          $$WantToReadTableAnnotationComposer,
          $$WantToReadTableCreateCompanionBuilder,
          $$WantToReadTableUpdateCompanionBuilder,
          (WantToReadData, $$WantToReadTableReferences),
          WantToReadData,
          PrefetchHooks Function({bool comicId})
        > {
  $$WantToReadTableTableManager(_$AppDatabase db, $WantToReadTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WantToReadTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WantToReadTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WantToReadTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> comicId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => WantToReadCompanion(comicId: comicId, createdAt: createdAt),
          createCompanionCallback:
              ({
                Value<int> comicId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => WantToReadCompanion.insert(
                comicId: comicId,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$WantToReadTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$WantToReadTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$WantToReadTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$WantToReadTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $WantToReadTable,
      WantToReadData,
      $$WantToReadTableFilterComposer,
      $$WantToReadTableOrderingComposer,
      $$WantToReadTableAnnotationComposer,
      $$WantToReadTableCreateCompanionBuilder,
      $$WantToReadTableUpdateCompanionBuilder,
      (WantToReadData, $$WantToReadTableReferences),
      WantToReadData,
      PrefetchHooks Function({bool comicId})
    >;
typedef $$WatchedFoldersTableCreateCompanionBuilder =
    WatchedFoldersCompanion Function({
      Value<int> id,
      required String path,
      Value<DateTime?> lastScanned,
      Value<bool> autoScan,
      Value<DateTime> dateAdded,
    });
typedef $$WatchedFoldersTableUpdateCompanionBuilder =
    WatchedFoldersCompanion Function({
      Value<int> id,
      Value<String> path,
      Value<DateTime?> lastScanned,
      Value<bool> autoScan,
      Value<DateTime> dateAdded,
    });

class $$WatchedFoldersTableFilterComposer
    extends Composer<_$AppDatabase, $WatchedFoldersTable> {
  $$WatchedFoldersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastScanned => $composableBuilder(
    column: $table.lastScanned,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get autoScan => $composableBuilder(
    column: $table.autoScan,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get dateAdded => $composableBuilder(
    column: $table.dateAdded,
    builder: (column) => ColumnFilters(column),
  );
}

class $$WatchedFoldersTableOrderingComposer
    extends Composer<_$AppDatabase, $WatchedFoldersTable> {
  $$WatchedFoldersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastScanned => $composableBuilder(
    column: $table.lastScanned,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get autoScan => $composableBuilder(
    column: $table.autoScan,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get dateAdded => $composableBuilder(
    column: $table.dateAdded,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$WatchedFoldersTableAnnotationComposer
    extends Composer<_$AppDatabase, $WatchedFoldersTable> {
  $$WatchedFoldersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get path =>
      $composableBuilder(column: $table.path, builder: (column) => column);

  GeneratedColumn<DateTime> get lastScanned => $composableBuilder(
    column: $table.lastScanned,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get autoScan =>
      $composableBuilder(column: $table.autoScan, builder: (column) => column);

  GeneratedColumn<DateTime> get dateAdded =>
      $composableBuilder(column: $table.dateAdded, builder: (column) => column);
}

class $$WatchedFoldersTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $WatchedFoldersTable,
          WatchedFolder,
          $$WatchedFoldersTableFilterComposer,
          $$WatchedFoldersTableOrderingComposer,
          $$WatchedFoldersTableAnnotationComposer,
          $$WatchedFoldersTableCreateCompanionBuilder,
          $$WatchedFoldersTableUpdateCompanionBuilder,
          (
            WatchedFolder,
            BaseReferences<_$AppDatabase, $WatchedFoldersTable, WatchedFolder>,
          ),
          WatchedFolder,
          PrefetchHooks Function()
        > {
  $$WatchedFoldersTableTableManager(
    _$AppDatabase db,
    $WatchedFoldersTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WatchedFoldersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WatchedFoldersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WatchedFoldersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> path = const Value.absent(),
                Value<DateTime?> lastScanned = const Value.absent(),
                Value<bool> autoScan = const Value.absent(),
                Value<DateTime> dateAdded = const Value.absent(),
              }) => WatchedFoldersCompanion(
                id: id,
                path: path,
                lastScanned: lastScanned,
                autoScan: autoScan,
                dateAdded: dateAdded,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String path,
                Value<DateTime?> lastScanned = const Value.absent(),
                Value<bool> autoScan = const Value.absent(),
                Value<DateTime> dateAdded = const Value.absent(),
              }) => WatchedFoldersCompanion.insert(
                id: id,
                path: path,
                lastScanned: lastScanned,
                autoScan: autoScan,
                dateAdded: dateAdded,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$WatchedFoldersTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $WatchedFoldersTable,
      WatchedFolder,
      $$WatchedFoldersTableFilterComposer,
      $$WatchedFoldersTableOrderingComposer,
      $$WatchedFoldersTableAnnotationComposer,
      $$WatchedFoldersTableCreateCompanionBuilder,
      $$WatchedFoldersTableUpdateCompanionBuilder,
      (
        WatchedFolder,
        BaseReferences<_$AppDatabase, $WatchedFoldersTable, WatchedFolder>,
      ),
      WatchedFolder,
      PrefetchHooks Function()
    >;
typedef $$LibrariesTableCreateCompanionBuilder =
    LibrariesCompanion Function({
      Value<int> id,
      required String name,
      Value<String> mediaType,
      Value<DateTime> dateCreated,
    });
typedef $$LibrariesTableUpdateCompanionBuilder =
    LibrariesCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<String> mediaType,
      Value<DateTime> dateCreated,
    });

final class $$LibrariesTableReferences
    extends BaseReferences<_$AppDatabase, $LibrariesTable, Library> {
  $$LibrariesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$LibraryComicsTable, List<LibraryComic>>
  _libraryComicsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.libraryComics,
    aliasName: 'libraries__id__library_comics__library_id',
  );

  $$LibraryComicsTableProcessedTableManager get libraryComicsRefs {
    final manager = $$LibraryComicsTableTableManager(
      $_db,
      $_db.libraryComics,
    ).filter((f) => f.libraryId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_libraryComicsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$LibrariesTableFilterComposer
    extends Composer<_$AppDatabase, $LibrariesTable> {
  $$LibrariesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> libraryComicsRefs(
    Expression<bool> Function($$LibraryComicsTableFilterComposer f) f,
  ) {
    final $$LibraryComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.libraryComics,
      getReferencedColumn: (t) => t.libraryId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibraryComicsTableFilterComposer(
            $db: $db,
            $table: $db.libraryComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$LibrariesTableOrderingComposer
    extends Composer<_$AppDatabase, $LibrariesTable> {
  $$LibrariesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get mediaType => $composableBuilder(
    column: $table.mediaType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LibrariesTableAnnotationComposer
    extends Composer<_$AppDatabase, $LibrariesTable> {
  $$LibrariesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get mediaType =>
      $composableBuilder(column: $table.mediaType, builder: (column) => column);

  GeneratedColumn<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => column,
  );

  Expression<T> libraryComicsRefs<T extends Object>(
    Expression<T> Function($$LibraryComicsTableAnnotationComposer a) f,
  ) {
    final $$LibraryComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.libraryComics,
      getReferencedColumn: (t) => t.libraryId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibraryComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.libraryComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$LibrariesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LibrariesTable,
          Library,
          $$LibrariesTableFilterComposer,
          $$LibrariesTableOrderingComposer,
          $$LibrariesTableAnnotationComposer,
          $$LibrariesTableCreateCompanionBuilder,
          $$LibrariesTableUpdateCompanionBuilder,
          (Library, $$LibrariesTableReferences),
          Library,
          PrefetchHooks Function({bool libraryComicsRefs})
        > {
  $$LibrariesTableTableManager(_$AppDatabase db, $LibrariesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LibrariesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LibrariesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LibrariesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> mediaType = const Value.absent(),
                Value<DateTime> dateCreated = const Value.absent(),
              }) => LibrariesCompanion(
                id: id,
                name: name,
                mediaType: mediaType,
                dateCreated: dateCreated,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                Value<String> mediaType = const Value.absent(),
                Value<DateTime> dateCreated = const Value.absent(),
              }) => LibrariesCompanion.insert(
                id: id,
                name: name,
                mediaType: mediaType,
                dateCreated: dateCreated,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$LibrariesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({libraryComicsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (libraryComicsRefs) db.libraryComics,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (libraryComicsRefs)
                    await $_getPrefetchedData<
                      Library,
                      $LibrariesTable,
                      LibraryComic
                    >(
                      currentTable: table,
                      referencedTable: $$LibrariesTableReferences
                          ._libraryComicsRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$LibrariesTableReferences(
                            db,
                            table,
                            p0,
                          ).libraryComicsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.libraryId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$LibrariesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LibrariesTable,
      Library,
      $$LibrariesTableFilterComposer,
      $$LibrariesTableOrderingComposer,
      $$LibrariesTableAnnotationComposer,
      $$LibrariesTableCreateCompanionBuilder,
      $$LibrariesTableUpdateCompanionBuilder,
      (Library, $$LibrariesTableReferences),
      Library,
      PrefetchHooks Function({bool libraryComicsRefs})
    >;
typedef $$LibraryComicsTableCreateCompanionBuilder =
    LibraryComicsCompanion Function({
      required int libraryId,
      required int comicId,
      Value<int> rowid,
    });
typedef $$LibraryComicsTableUpdateCompanionBuilder =
    LibraryComicsCompanion Function({
      Value<int> libraryId,
      Value<int> comicId,
      Value<int> rowid,
    });

final class $$LibraryComicsTableReferences
    extends BaseReferences<_$AppDatabase, $LibraryComicsTable, LibraryComic> {
  $$LibraryComicsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $LibrariesTable _libraryIdTable(_$AppDatabase db) =>
      db.libraries.createAlias('library_comics__library_id__libraries__id');

  $$LibrariesTableProcessedTableManager get libraryId {
    final $_column = $_itemColumn<int>('library_id')!;

    final manager = $$LibrariesTableTableManager(
      $_db,
      $_db.libraries,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_libraryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('library_comics__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$LibraryComicsTableFilterComposer
    extends Composer<_$AppDatabase, $LibraryComicsTable> {
  $$LibraryComicsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$LibrariesTableFilterComposer get libraryId {
    final $$LibrariesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.libraryId,
      referencedTable: $db.libraries,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibrariesTableFilterComposer(
            $db: $db,
            $table: $db.libraries,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LibraryComicsTableOrderingComposer
    extends Composer<_$AppDatabase, $LibraryComicsTable> {
  $$LibraryComicsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$LibrariesTableOrderingComposer get libraryId {
    final $$LibrariesTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.libraryId,
      referencedTable: $db.libraries,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibrariesTableOrderingComposer(
            $db: $db,
            $table: $db.libraries,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LibraryComicsTableAnnotationComposer
    extends Composer<_$AppDatabase, $LibraryComicsTable> {
  $$LibraryComicsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$LibrariesTableAnnotationComposer get libraryId {
    final $$LibrariesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.libraryId,
      referencedTable: $db.libraries,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LibrariesTableAnnotationComposer(
            $db: $db,
            $table: $db.libraries,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LibraryComicsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LibraryComicsTable,
          LibraryComic,
          $$LibraryComicsTableFilterComposer,
          $$LibraryComicsTableOrderingComposer,
          $$LibraryComicsTableAnnotationComposer,
          $$LibraryComicsTableCreateCompanionBuilder,
          $$LibraryComicsTableUpdateCompanionBuilder,
          (LibraryComic, $$LibraryComicsTableReferences),
          LibraryComic,
          PrefetchHooks Function({bool libraryId, bool comicId})
        > {
  $$LibraryComicsTableTableManager(_$AppDatabase db, $LibraryComicsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LibraryComicsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LibraryComicsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LibraryComicsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> libraryId = const Value.absent(),
                Value<int> comicId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LibraryComicsCompanion(
                libraryId: libraryId,
                comicId: comicId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required int libraryId,
                required int comicId,
                Value<int> rowid = const Value.absent(),
              }) => LibraryComicsCompanion.insert(
                libraryId: libraryId,
                comicId: comicId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$LibraryComicsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({libraryId = false, comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (libraryId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.libraryId,
                                referencedTable: $$LibraryComicsTableReferences
                                    ._libraryIdTable(db),
                                referencedColumn: $$LibraryComicsTableReferences
                                    ._libraryIdTable(db)
                                    .id,
                              )
                              as T;
                    }
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$LibraryComicsTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$LibraryComicsTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$LibraryComicsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LibraryComicsTable,
      LibraryComic,
      $$LibraryComicsTableFilterComposer,
      $$LibraryComicsTableOrderingComposer,
      $$LibraryComicsTableAnnotationComposer,
      $$LibraryComicsTableCreateCompanionBuilder,
      $$LibraryComicsTableUpdateCompanionBuilder,
      (LibraryComic, $$LibraryComicsTableReferences),
      LibraryComic,
      PrefetchHooks Function({bool libraryId, bool comicId})
    >;
typedef $$FoldersTableCreateCompanionBuilder =
    FoldersCompanion Function({
      Value<int> id,
      required String name,
      Value<int?> coverComicId,
      Value<DateTime> dateCreated,
    });
typedef $$FoldersTableUpdateCompanionBuilder =
    FoldersCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<int?> coverComicId,
      Value<DateTime> dateCreated,
    });

final class $$FoldersTableReferences
    extends BaseReferences<_$AppDatabase, $FoldersTable, Folder> {
  $$FoldersTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ComicsTable _coverComicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('folders__cover_comic_id__comics__id');

  $$ComicsTableProcessedTableManager? get coverComicId {
    final $_column = $_itemColumn<int>('cover_comic_id');
    if ($_column == null) return null;
    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_coverComicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static MultiTypedResultKey<$FolderComicsTable, List<FolderComic>>
  _folderComicsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.folderComics,
    aliasName: 'folders__id__folder_comics__folder_id',
  );

  $$FolderComicsTableProcessedTableManager get folderComicsRefs {
    final manager = $$FolderComicsTableTableManager(
      $_db,
      $_db.folderComics,
    ).filter((f) => f.folderId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_folderComicsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$FoldersTableFilterComposer
    extends Composer<_$AppDatabase, $FoldersTable> {
  $$FoldersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => ColumnFilters(column),
  );

  $$ComicsTableFilterComposer get coverComicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.coverComicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<bool> folderComicsRefs(
    Expression<bool> Function($$FolderComicsTableFilterComposer f) f,
  ) {
    final $$FolderComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folderComics,
      getReferencedColumn: (t) => t.folderId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FolderComicsTableFilterComposer(
            $db: $db,
            $table: $db.folderComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$FoldersTableOrderingComposer
    extends Composer<_$AppDatabase, $FoldersTable> {
  $$FoldersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => ColumnOrderings(column),
  );

  $$ComicsTableOrderingComposer get coverComicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.coverComicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FoldersTableAnnotationComposer
    extends Composer<_$AppDatabase, $FoldersTable> {
  $$FoldersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<DateTime> get dateCreated => $composableBuilder(
    column: $table.dateCreated,
    builder: (column) => column,
  );

  $$ComicsTableAnnotationComposer get coverComicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.coverComicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<T> folderComicsRefs<T extends Object>(
    Expression<T> Function($$FolderComicsTableAnnotationComposer a) f,
  ) {
    final $$FolderComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.folderComics,
      getReferencedColumn: (t) => t.folderId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FolderComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.folderComics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$FoldersTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FoldersTable,
          Folder,
          $$FoldersTableFilterComposer,
          $$FoldersTableOrderingComposer,
          $$FoldersTableAnnotationComposer,
          $$FoldersTableCreateCompanionBuilder,
          $$FoldersTableUpdateCompanionBuilder,
          (Folder, $$FoldersTableReferences),
          Folder,
          PrefetchHooks Function({bool coverComicId, bool folderComicsRefs})
        > {
  $$FoldersTableTableManager(_$AppDatabase db, $FoldersTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FoldersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FoldersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FoldersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<int?> coverComicId = const Value.absent(),
                Value<DateTime> dateCreated = const Value.absent(),
              }) => FoldersCompanion(
                id: id,
                name: name,
                coverComicId: coverComicId,
                dateCreated: dateCreated,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                Value<int?> coverComicId = const Value.absent(),
                Value<DateTime> dateCreated = const Value.absent(),
              }) => FoldersCompanion.insert(
                id: id,
                name: name,
                coverComicId: coverComicId,
                dateCreated: dateCreated,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$FoldersTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({coverComicId = false, folderComicsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (folderComicsRefs) db.folderComics,
                  ],
                  addJoins:
                      <
                        T extends TableManagerState<
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic
                        >
                      >(state) {
                        if (coverComicId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.coverComicId,
                                    referencedTable: $$FoldersTableReferences
                                        ._coverComicIdTable(db),
                                    referencedColumn: $$FoldersTableReferences
                                        ._coverComicIdTable(db)
                                        .id,
                                  )
                                  as T;
                        }

                        return state;
                      },
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (folderComicsRefs)
                        await $_getPrefetchedData<
                          Folder,
                          $FoldersTable,
                          FolderComic
                        >(
                          currentTable: table,
                          referencedTable: $$FoldersTableReferences
                              ._folderComicsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$FoldersTableReferences(
                                db,
                                table,
                                p0,
                              ).folderComicsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.folderId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$FoldersTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FoldersTable,
      Folder,
      $$FoldersTableFilterComposer,
      $$FoldersTableOrderingComposer,
      $$FoldersTableAnnotationComposer,
      $$FoldersTableCreateCompanionBuilder,
      $$FoldersTableUpdateCompanionBuilder,
      (Folder, $$FoldersTableReferences),
      Folder,
      PrefetchHooks Function({bool coverComicId, bool folderComicsRefs})
    >;
typedef $$FolderComicsTableCreateCompanionBuilder =
    FolderComicsCompanion Function({
      required int folderId,
      required int comicId,
      Value<int> rowid,
    });
typedef $$FolderComicsTableUpdateCompanionBuilder =
    FolderComicsCompanion Function({
      Value<int> folderId,
      Value<int> comicId,
      Value<int> rowid,
    });

final class $$FolderComicsTableReferences
    extends BaseReferences<_$AppDatabase, $FolderComicsTable, FolderComic> {
  $$FolderComicsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $FoldersTable _folderIdTable(_$AppDatabase db) =>
      db.folders.createAlias('folder_comics__folder_id__folders__id');

  $$FoldersTableProcessedTableManager get folderId {
    final $_column = $_itemColumn<int>('folder_id')!;

    final manager = $$FoldersTableTableManager(
      $_db,
      $_db.folders,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_folderIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('folder_comics__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$FolderComicsTableFilterComposer
    extends Composer<_$AppDatabase, $FolderComicsTable> {
  $$FolderComicsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$FoldersTableFilterComposer get folderId {
    final $$FoldersTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.folderId,
      referencedTable: $db.folders,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FoldersTableFilterComposer(
            $db: $db,
            $table: $db.folders,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FolderComicsTableOrderingComposer
    extends Composer<_$AppDatabase, $FolderComicsTable> {
  $$FolderComicsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$FoldersTableOrderingComposer get folderId {
    final $$FoldersTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.folderId,
      referencedTable: $db.folders,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FoldersTableOrderingComposer(
            $db: $db,
            $table: $db.folders,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FolderComicsTableAnnotationComposer
    extends Composer<_$AppDatabase, $FolderComicsTable> {
  $$FolderComicsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$FoldersTableAnnotationComposer get folderId {
    final $$FoldersTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.folderId,
      referencedTable: $db.folders,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$FoldersTableAnnotationComposer(
            $db: $db,
            $table: $db.folders,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$FolderComicsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $FolderComicsTable,
          FolderComic,
          $$FolderComicsTableFilterComposer,
          $$FolderComicsTableOrderingComposer,
          $$FolderComicsTableAnnotationComposer,
          $$FolderComicsTableCreateCompanionBuilder,
          $$FolderComicsTableUpdateCompanionBuilder,
          (FolderComic, $$FolderComicsTableReferences),
          FolderComic,
          PrefetchHooks Function({bool folderId, bool comicId})
        > {
  $$FolderComicsTableTableManager(_$AppDatabase db, $FolderComicsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FolderComicsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FolderComicsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FolderComicsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> folderId = const Value.absent(),
                Value<int> comicId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FolderComicsCompanion(
                folderId: folderId,
                comicId: comicId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required int folderId,
                required int comicId,
                Value<int> rowid = const Value.absent(),
              }) => FolderComicsCompanion.insert(
                folderId: folderId,
                comicId: comicId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$FolderComicsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({folderId = false, comicId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (folderId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.folderId,
                                referencedTable: $$FolderComicsTableReferences
                                    ._folderIdTable(db),
                                referencedColumn: $$FolderComicsTableReferences
                                    ._folderIdTable(db)
                                    .id,
                              )
                              as T;
                    }
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$FolderComicsTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$FolderComicsTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$FolderComicsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $FolderComicsTable,
      FolderComic,
      $$FolderComicsTableFilterComposer,
      $$FolderComicsTableOrderingComposer,
      $$FolderComicsTableAnnotationComposer,
      $$FolderComicsTableCreateCompanionBuilder,
      $$FolderComicsTableUpdateCompanionBuilder,
      (FolderComic, $$FolderComicsTableReferences),
      FolderComic,
      PrefetchHooks Function({bool folderId, bool comicId})
    >;
typedef $$TagsTableCreateCompanionBuilder =
    TagsCompanion Function({Value<int> id, required String name});
typedef $$TagsTableUpdateCompanionBuilder =
    TagsCompanion Function({Value<int> id, Value<String> name});

final class $$TagsTableReferences
    extends BaseReferences<_$AppDatabase, $TagsTable, Tag> {
  $$TagsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$ComicTagsTable, List<ComicTag>>
  _comicTagsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.comicTags,
    aliasName: 'tags__id__comic_tags__tag_id',
  );

  $$ComicTagsTableProcessedTableManager get comicTagsRefs {
    final manager = $$ComicTagsTableTableManager(
      $_db,
      $_db.comicTags,
    ).filter((f) => f.tagId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_comicTagsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$TagsTableFilterComposer extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> comicTagsRefs(
    Expression<bool> Function($$ComicTagsTableFilterComposer f) f,
  ) {
    final $$ComicTagsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.comicTags,
      getReferencedColumn: (t) => t.tagId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicTagsTableFilterComposer(
            $db: $db,
            $table: $db.comicTags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$TagsTableOrderingComposer extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TagsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  Expression<T> comicTagsRefs<T extends Object>(
    Expression<T> Function($$ComicTagsTableAnnotationComposer a) f,
  ) {
    final $$ComicTagsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.comicTags,
      getReferencedColumn: (t) => t.tagId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicTagsTableAnnotationComposer(
            $db: $db,
            $table: $db.comicTags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$TagsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TagsTable,
          Tag,
          $$TagsTableFilterComposer,
          $$TagsTableOrderingComposer,
          $$TagsTableAnnotationComposer,
          $$TagsTableCreateCompanionBuilder,
          $$TagsTableUpdateCompanionBuilder,
          (Tag, $$TagsTableReferences),
          Tag,
          PrefetchHooks Function({bool comicTagsRefs})
        > {
  $$TagsTableTableManager(_$AppDatabase db, $TagsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TagsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TagsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TagsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
              }) => TagsCompanion(id: id, name: name),
          createCompanionCallback:
              ({Value<int> id = const Value.absent(), required String name}) =>
                  TagsCompanion.insert(id: id, name: name),
          withReferenceMapper: (p0) => p0
              .map(
                (e) =>
                    (e.readTable(table), $$TagsTableReferences(db, table, e)),
              )
              .toList(),
          prefetchHooksCallback: ({comicTagsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (comicTagsRefs) db.comicTags],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (comicTagsRefs)
                    await $_getPrefetchedData<Tag, $TagsTable, ComicTag>(
                      currentTable: table,
                      referencedTable: $$TagsTableReferences
                          ._comicTagsRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$TagsTableReferences(db, table, p0).comicTagsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.tagId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$TagsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TagsTable,
      Tag,
      $$TagsTableFilterComposer,
      $$TagsTableOrderingComposer,
      $$TagsTableAnnotationComposer,
      $$TagsTableCreateCompanionBuilder,
      $$TagsTableUpdateCompanionBuilder,
      (Tag, $$TagsTableReferences),
      Tag,
      PrefetchHooks Function({bool comicTagsRefs})
    >;
typedef $$ComicTagsTableCreateCompanionBuilder =
    ComicTagsCompanion Function({
      required int comicId,
      required int tagId,
      Value<int> rowid,
    });
typedef $$ComicTagsTableUpdateCompanionBuilder =
    ComicTagsCompanion Function({
      Value<int> comicId,
      Value<int> tagId,
      Value<int> rowid,
    });

final class $$ComicTagsTableReferences
    extends BaseReferences<_$AppDatabase, $ComicTagsTable, ComicTag> {
  $$ComicTagsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ComicsTable _comicIdTable(_$AppDatabase db) =>
      db.comics.createAlias('comic_tags__comic_id__comics__id');

  $$ComicsTableProcessedTableManager get comicId {
    final $_column = $_itemColumn<int>('comic_id')!;

    final manager = $$ComicsTableTableManager(
      $_db,
      $_db.comics,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_comicIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $TagsTable _tagIdTable(_$AppDatabase db) =>
      db.tags.createAlias('comic_tags__tag_id__tags__id');

  $$TagsTableProcessedTableManager get tagId {
    final $_column = $_itemColumn<int>('tag_id')!;

    final manager = $$TagsTableTableManager(
      $_db,
      $_db.tags,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_tagIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ComicTagsTableFilterComposer
    extends Composer<_$AppDatabase, $ComicTagsTable> {
  $$ComicTagsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$ComicsTableFilterComposer get comicId {
    final $$ComicsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableFilterComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$TagsTableFilterComposer get tagId {
    final $$TagsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tagId,
      referencedTable: $db.tags,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$TagsTableFilterComposer(
            $db: $db,
            $table: $db.tags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ComicTagsTableOrderingComposer
    extends Composer<_$AppDatabase, $ComicTagsTable> {
  $$ComicTagsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$ComicsTableOrderingComposer get comicId {
    final $$ComicsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableOrderingComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$TagsTableOrderingComposer get tagId {
    final $$TagsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tagId,
      referencedTable: $db.tags,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$TagsTableOrderingComposer(
            $db: $db,
            $table: $db.tags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ComicTagsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ComicTagsTable> {
  $$ComicTagsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  $$ComicsTableAnnotationComposer get comicId {
    final $$ComicsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.comicId,
      referencedTable: $db.comics,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ComicsTableAnnotationComposer(
            $db: $db,
            $table: $db.comics,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$TagsTableAnnotationComposer get tagId {
    final $$TagsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.tagId,
      referencedTable: $db.tags,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$TagsTableAnnotationComposer(
            $db: $db,
            $table: $db.tags,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ComicTagsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ComicTagsTable,
          ComicTag,
          $$ComicTagsTableFilterComposer,
          $$ComicTagsTableOrderingComposer,
          $$ComicTagsTableAnnotationComposer,
          $$ComicTagsTableCreateCompanionBuilder,
          $$ComicTagsTableUpdateCompanionBuilder,
          (ComicTag, $$ComicTagsTableReferences),
          ComicTag,
          PrefetchHooks Function({bool comicId, bool tagId})
        > {
  $$ComicTagsTableTableManager(_$AppDatabase db, $ComicTagsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ComicTagsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ComicTagsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ComicTagsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> comicId = const Value.absent(),
                Value<int> tagId = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ComicTagsCompanion(
                comicId: comicId,
                tagId: tagId,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required int comicId,
                required int tagId,
                Value<int> rowid = const Value.absent(),
              }) => ComicTagsCompanion.insert(
                comicId: comicId,
                tagId: tagId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ComicTagsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({comicId = false, tagId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (comicId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.comicId,
                                referencedTable: $$ComicTagsTableReferences
                                    ._comicIdTable(db),
                                referencedColumn: $$ComicTagsTableReferences
                                    ._comicIdTable(db)
                                    .id,
                              )
                              as T;
                    }
                    if (tagId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.tagId,
                                referencedTable: $$ComicTagsTableReferences
                                    ._tagIdTable(db),
                                referencedColumn: $$ComicTagsTableReferences
                                    ._tagIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ComicTagsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ComicTagsTable,
      ComicTag,
      $$ComicTagsTableFilterComposer,
      $$ComicTagsTableOrderingComposer,
      $$ComicTagsTableAnnotationComposer,
      $$ComicTagsTableCreateCompanionBuilder,
      $$ComicTagsTableUpdateCompanionBuilder,
      (ComicTag, $$ComicTagsTableReferences),
      ComicTag,
      PrefetchHooks Function({bool comicId, bool tagId})
    >;
typedef $$ConnectionsTableCreateCompanionBuilder =
    ConnectionsCompanion Function({
      Value<int> id,
      required String name,
      required String baseUrl,
      Value<String?> lastUsername,
      Value<DateTime> createdAt,
    });
typedef $$ConnectionsTableUpdateCompanionBuilder =
    ConnectionsCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<String> baseUrl,
      Value<String?> lastUsername,
      Value<DateTime> createdAt,
    });

class $$ConnectionsTableFilterComposer
    extends Composer<_$AppDatabase, $ConnectionsTable> {
  $$ConnectionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get baseUrl => $composableBuilder(
    column: $table.baseUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastUsername => $composableBuilder(
    column: $table.lastUsername,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ConnectionsTableOrderingComposer
    extends Composer<_$AppDatabase, $ConnectionsTable> {
  $$ConnectionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get baseUrl => $composableBuilder(
    column: $table.baseUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastUsername => $composableBuilder(
    column: $table.lastUsername,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ConnectionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ConnectionsTable> {
  $$ConnectionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get baseUrl =>
      $composableBuilder(column: $table.baseUrl, builder: (column) => column);

  GeneratedColumn<String> get lastUsername => $composableBuilder(
    column: $table.lastUsername,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$ConnectionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ConnectionsTable,
          ConnectionRow,
          $$ConnectionsTableFilterComposer,
          $$ConnectionsTableOrderingComposer,
          $$ConnectionsTableAnnotationComposer,
          $$ConnectionsTableCreateCompanionBuilder,
          $$ConnectionsTableUpdateCompanionBuilder,
          (
            ConnectionRow,
            BaseReferences<_$AppDatabase, $ConnectionsTable, ConnectionRow>,
          ),
          ConnectionRow,
          PrefetchHooks Function()
        > {
  $$ConnectionsTableTableManager(_$AppDatabase db, $ConnectionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ConnectionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ConnectionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ConnectionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> baseUrl = const Value.absent(),
                Value<String?> lastUsername = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => ConnectionsCompanion(
                id: id,
                name: name,
                baseUrl: baseUrl,
                lastUsername: lastUsername,
                createdAt: createdAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                required String baseUrl,
                Value<String?> lastUsername = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => ConnectionsCompanion.insert(
                id: id,
                name: name,
                baseUrl: baseUrl,
                lastUsername: lastUsername,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ConnectionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ConnectionsTable,
      ConnectionRow,
      $$ConnectionsTableFilterComposer,
      $$ConnectionsTableOrderingComposer,
      $$ConnectionsTableAnnotationComposer,
      $$ConnectionsTableCreateCompanionBuilder,
      $$ConnectionsTableUpdateCompanionBuilder,
      (
        ConnectionRow,
        BaseReferences<_$AppDatabase, $ConnectionsTable, ConnectionRow>,
      ),
      ConnectionRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$ComicsTableTableManager get comics =>
      $$ComicsTableTableManager(_db, _db.comics);
  $$BookmarksTableTableManager get bookmarks =>
      $$BookmarksTableTableManager(_db, _db.bookmarks);
  $$ReadingHistoryTableTableManager get readingHistory =>
      $$ReadingHistoryTableTableManager(_db, _db.readingHistory);
  $$FavoritesTableTableManager get favorites =>
      $$FavoritesTableTableManager(_db, _db.favorites);
  $$WantToReadTableTableManager get wantToRead =>
      $$WantToReadTableTableManager(_db, _db.wantToRead);
  $$WatchedFoldersTableTableManager get watchedFolders =>
      $$WatchedFoldersTableTableManager(_db, _db.watchedFolders);
  $$LibrariesTableTableManager get libraries =>
      $$LibrariesTableTableManager(_db, _db.libraries);
  $$LibraryComicsTableTableManager get libraryComics =>
      $$LibraryComicsTableTableManager(_db, _db.libraryComics);
  $$FoldersTableTableManager get folders =>
      $$FoldersTableTableManager(_db, _db.folders);
  $$FolderComicsTableTableManager get folderComics =>
      $$FolderComicsTableTableManager(_db, _db.folderComics);
  $$TagsTableTableManager get tags => $$TagsTableTableManager(_db, _db.tags);
  $$ComicTagsTableTableManager get comicTags =>
      $$ComicTagsTableTableManager(_db, _db.comicTags);
  $$ConnectionsTableTableManager get connections =>
      $$ConnectionsTableTableManager(_db, _db.connections);
}
