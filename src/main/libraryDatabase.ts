/**
 * LibraryDatabase — facade over the per-domain modules in src/main/db/.
 *
 * Each method delegates to a free function that accepts the raw `Database`
 * handle. The split is purely for file navigation; behavior is unchanged.
 */

import Database from 'better-sqlite3';
import type { MediaRecord, QueryOptions, QueryResult } from '../shared/types';
import { openOrRecreate } from './db/schema';
import * as appMeta from './db/appMeta';
import * as tags from './db/tags';
import * as bookmarks from './db/bookmarks';
import * as favorites from './db/favorites';
import * as users from './db/users';
import * as history from './db/history';
import * as progress from './db/progress';
import * as libraries from './db/libraries';
import * as folders from './db/folders';
import * as comics from './db/comics';
import * as seriesRepoNs from './db/series';
import * as volumeRepoNs from './db/volume';
import * as searchNs from './db/search';

export class LibraryDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = openOrRecreate(dbPath);
  }

  initialize(): void {
    // Schema already created in constructor; this is a no-op hook for callers.
  }

  /** Raw better-sqlite3 handle — used by the better-auth adapter. */
  get raw(): Database.Database { return this.db; }

  /**
   * Run a synchronous block inside a single SQLite transaction. Used by
   * the ingest pipeline to batch many small inserts into one commit,
   * which avoids per-row WAL fsync cost.
   */
  runInTransaction(fn: () => void): void {
    this.db.transaction(fn)();
  }

  // --- app_meta ---
  getAppMeta(key: string): string | null { return appMeta.getAppMeta(this.db, key); }
  setAppMeta(key: string, value: string): void { appMeta.setAppMeta(this.db, key, value); }

  // --- comics ---
  addComic(record: Omit<MediaRecord, 'id' | 'dateAdded'>): MediaRecord { return comics.addComic(this.db, record); }
  addComicFast(record: { filePath: string; title: string; pageCount: number; fileSize: number; coverThumbnail: Buffer; mediaType: 'comic' | 'book' }): number {
    return comics.addComicFast(this.db, record);
  }
  addComicsToFolderRaw(folderId: number, comicIds: number[]): void {
    folders.addComicsToFolderRaw(this.db, folderId, comicIds);
  }
  removeComics(ids: number[]): void { comics.removeComics(this.db, ids); }
  /** R-8 soft-delete a comic by file_path (file disappeared on scan). */
  softDeleteComicByPath(filePath: string, when?: string): number | null {
    return comics.softDeleteByPath(this.db, filePath, when);
  }
  restoreComicByPath(filePath: string): number | null { return comics.restoreByPath(this.db, filePath); }
  /** R-8 cascade soft-delete/restore on series + volume after chapter changes. */
  cascadeSeriesVolumeDeletion(seriesIds: number[], when?: string): void {
    comics.cascadeSeriesVolumeDeletion(this.db, seriesIds, when);
  }
  isDismissed(filePath: string): boolean { return comics.isDismissed(this.db, filePath); }
  getComic(id: number): MediaRecord | null { return comics.getComic(this.db, id); }
  comicExistsByPath(filePath: string): boolean { return comics.comicExistsByPath(this.db, filePath); }
  updateCoverThumbnailByPath(filePath: string, coverThumbnail: Buffer | null): void {
    comics.updateCoverThumbnailByPath(this.db, filePath, coverThumbnail);
  }
  updatePageCountByPath(filePath: string, pageCount: number): void {
    comics.updatePageCountByPath(this.db, filePath, pageCount);
  }
  queryComics(options: QueryOptions = {}): QueryResult { return comics.queryComics(this.db, options); }
  getComicByPath(filePath: string): MediaRecord | null { return comics.getComicByPath(this.db, filePath); }
  getCoverThumbnail(comicId: number): Buffer | null { return comics.getCoverThumbnail(this.db, comicId); }
  updateReadingProgress(comicId: number, pageIndex: number): void {
    comics.updateReadingProgress(this.db, comicId, pageIndex);
  }
  updateReadingLocation(comicId: number, location: string): void {
    comics.updateReadingLocation(this.db, comicId, location);
  }
  getRecentlyRead(limit: number = 10, mediaType?: 'comic' | 'book'): MediaRecord[] {
    return comics.getRecentlyRead(this.db, limit, mediaType);
  }
  getContinueReading(limit: number = 10, mediaType?: 'comic' | 'book'): MediaRecord[] {
    return comics.getContinueReading(this.db, limit, mediaType);
  }
  // setComicSeries / getAllSeries / getSeriesComics removed in v8 — use the
  // hierarchy facade (db.series.* / db.volume.* / db.listChaptersForSeries
  // / db.listChaptersForVolume) instead.
  /** R-9 chapter listing for a v7 series id. */
  listChaptersForSeries(seriesId: number, opts: { includeDeleted?: boolean; limit?: number; offset?: number } = {}): MediaRecord[] {
    return comics.listForSeries(this.db, seriesId, opts);
  }
  /** R-9 chapter listing scoped to a single volume id. */
  listChaptersForVolume(volumeId: number, opts: { includeDeleted?: boolean; limit?: number; offset?: number } = {}): MediaRecord[] {
    return comics.listForVolume(this.db, volumeId, opts);
  }
  /** R-10 default cover comic id. */
  defaultSeriesCover(seriesId: number): number | null { return comics.defaultSeriesCover(this.db, seriesId); }
  defaultVolumeCover(volumeId: number): number | null { return comics.defaultVolumeCover(this.db, volumeId); }
  /** R-11 cross-kind search returning series + chapter hits. */
  unionSearch(query: string, opts?: searchNs.SearchOptions): searchNs.SearchHit[] {
    return searchNs.unionSearch(this.db, query, opts);
  }

  /**
   * Hierarchy repos (schema v7+). Exposed as namespace accessors instead of
   * per-method facades because the surface is large; the proxy pattern keeps
   * the facade thin and lets consumers call e.g. `db.series.getOrCreate(...)`.
   * See `docs/hierarchy/design.md` §4.1.
   */
  get series(): SeriesFacade { return makeSeriesFacade(this.db); }
  get volume(): VolumeFacade { return makeVolumeFacade(this.db); }
  updateComicMetadata(
    comicId: number,
    fields: Parameters<typeof comics.updateComicMetadata>[2],
  ): void { comics.updateComicMetadata(this.db, comicId, fields); }
  getComicMetadata(id: number): ReturnType<typeof comics.getComicMetadata> {
    return comics.getComicMetadata(this.db, id);
  }
  queryComicsForUser(
    userId: number | null,
    options: Parameters<typeof comics.queryComicsForUser>[2],
  ): ReturnType<typeof comics.queryComicsForUser> {
    return comics.queryComicsForUser(this.db, userId, options);
  }

  // --- tags ---
  addTag(comicId: number, tag: string): void { tags.addTag(this.db, comicId, tag); }
  removeTag(comicId: number, tag: string): void { tags.removeTag(this.db, comicId, tag); }
  getAllTags(): string[] { return tags.getAllTags(this.db); }
  renameTag(oldName: string, newName: string): void { tags.renameTag(this.db, oldName, newName); }
  deleteTag(tag: string): void { tags.deleteTag(this.db, tag); }
  addTagBulk(comicIds: number[], tag: string): void { tags.addTagBulk(this.db, comicIds, tag); }
  removeTagBulk(comicIds: number[], tag: string): void { tags.removeTagBulk(this.db, comicIds, tag); }

  // --- libraries ---
  createLibrary(name: string, mediaType: 'comic' | 'book' = 'comic') {
    return libraries.createLibrary(this.db, name, mediaType);
  }
  renameLibrary(id: number, newName: string): void { libraries.renameLibrary(this.db, id, newName); }
  deleteLibrary(id: number): void { libraries.deleteLibrary(this.db, id); }
  getAllLibraries(mediaType?: 'comic' | 'book') { return libraries.getAllLibraries(this.db, mediaType); }
  /** R-6: Inbox is the catch-all for orphan ingests. */
  getOrCreateInboxLibrary(): number { return libraries.getOrCreateInbox(this.db); }
  getLibraryForFolder(folderId: number): number | null { return libraries.getLibraryForFolder(this.db, folderId); }
  addComicsToLibrary(libraryId: number, comicIds: number[]): void {
    libraries.addComicsToLibrary(this.db, libraryId, comicIds);
  }
  removeComicsFromLibrary(libraryId: number, comicIds: number[]): void {
    libraries.removeComicsFromLibrary(this.db, libraryId, comicIds);
  }
  addFoldersToLibrary(libraryId: number, folderIds: number[]): void {
    libraries.addFoldersToLibrary(this.db, libraryId, folderIds);
  }
  queryComicsByLibrary(libraryId: number, options: QueryOptions = {}): QueryResult {
    return libraries.queryComicsByLibrary(this.db, libraryId, options);
  }

  // --- folders ---
  createFolder(name: string, comicIds: number[]) { return folders.createFolder(this.db, name, comicIds); }
  renameFolder(id: number, newName: string): void { folders.renameFolder(this.db, id, newName); }
  deleteFolder(id: number): void { folders.deleteFolder(this.db, id); }
  getAllFolders(libraryId?: number | null) { return folders.getAllFolders(this.db, libraryId); }
  addComicsToFolder(folderId: number, comicIds: number[]): void {
    folders.addComicsToFolder(this.db, folderId, comicIds);
  }
  removeComicsFromFolder(folderId: number, comicIds: number[]): void {
    folders.removeComicsFromFolder(this.db, folderId, comicIds);
  }
  getFolderComics(folderId: number, options: QueryOptions = {}): QueryResult {
    return folders.getFolderComics(this.db, folderId, options);
  }
  getComicFolderIds(comicId: number): number[] { return folders.getComicFolderIds(this.db, comicId); }

  // --- users ---
  createUser(username: string, passwordHash: string, isAdmin: boolean) {
    return users.createUser(this.db, username, passwordHash, isAdmin);
  }
  getUserByUsername(username: string) { return users.getUserByUsername(this.db, username); }
  getUserById(id: number) { return users.getUserById(this.db, id); }
  listUsers() { return users.listUsers(this.db); }
  countAdmins(): number { return users.countAdmins(this.db); }
  countUsers(): number { return users.countUsers(this.db); }
  deleteUser(id: number): void { users.deleteUser(this.db, id); }
  setUserAdmin(id: number, isAdmin: boolean): void { users.setUserAdmin(this.db, id, isAdmin); }
  upsertCredentialAccount(userId: number, accountId: string, passwordHash: string): void {
    users.upsertCredentialAccount(this.db, userId, accountId, passwordHash);
  }

  // --- per-user progress ---
  upsertUserProgress(
    userId: number,
    comicId: number,
    opts: { page?: number | null; location?: string | null; completed?: boolean },
  ): void { progress.upsertUserProgress(this.db, userId, comicId, opts); }
  clearUserProgress(userId: number, comicId: number): void {
    progress.clearUserProgress(this.db, userId, comicId);
  }
  getUserProgress(userId: number, comicId: number) {
    return progress.getUserProgress(this.db, userId, comicId);
  }
  getRecentlyReadByUser(userId: number, limit: number, mediaType?: 'comic' | 'book'): MediaRecord[] {
    return progress.getRecentlyReadByUser(this.db, userId, limit, mediaType);
  }
  getContinueReadingByUser(userId: number, limit: number, mediaType?: 'comic' | 'book'): MediaRecord[] {
    return progress.getContinueReadingByUser(this.db, userId, limit, mediaType);
  }

  // --- bookmarks ---
  createBookmark(userId: number, comicId: number, page: number, note: string | null = null) {
    return bookmarks.createBookmark(this.db, userId, comicId, page, note);
  }
  listBookmarks(userId: number, comicId: number) {
    return bookmarks.listBookmarks(this.db, userId, comicId);
  }
  updateBookmark(userId: number, bookmarkId: number, note: string | null): void {
    bookmarks.updateBookmark(this.db, userId, bookmarkId, note);
  }
  deleteBookmark(userId: number, bookmarkId: number): void {
    bookmarks.deleteBookmark(this.db, userId, bookmarkId);
  }

  // --- reading history ---
  logHistory(userId: number, comicId: number, action: string, page: number | null): void {
    history.logHistory(this.db, userId, comicId, action, page);
  }
  getHistory(userId: number, offset: number, limit: number) {
    return history.getHistory(this.db, userId, offset, limit);
  }

  // --- favorites ---
  addFavorite(userId: number, comicId: number): void { favorites.addFavorite(this.db, userId, comicId); }
  removeFavorite(userId: number, comicId: number): void { favorites.removeFavorite(this.db, userId, comicId); }
  isFavorite(userId: number, comicId: number): boolean { return favorites.isFavorite(this.db, userId, comicId); }
}

// --- hierarchy facades (v7+) ---
// db.series.getOrCreate(...) etc. The bind-the-handle pattern saves us from
// adding a per-method wrapper for ~16 functions across two modules.
type SeriesFacade = {
  getOrCreate: (libraryId: number, name: string) => ReturnType<typeof seriesRepoNs.getOrCreate>;
  get:         (id: number) => ReturnType<typeof seriesRepoNs.get>;
  lookupByName:(libraryId: number, name: string) => ReturnType<typeof seriesRepoNs.lookupByName>;
  listForLibrary: (libraryId: number, opts?: seriesRepoNs.ListOptions) =>
    ReturnType<typeof seriesRepoNs.listForLibrary>;
  update:     (id: number, fields: seriesRepoNs.UpdateFields) => ReturnType<typeof seriesRepoNs.update>;
  softDelete: (id: number, when?: string) => void;
  restore:    (id: number) => void;
};
function makeSeriesFacade(db: Database.Database): SeriesFacade {
  return {
    getOrCreate:    (libraryId, name)         => seriesRepoNs.getOrCreate(db, libraryId, name),
    get:            (id)                      => seriesRepoNs.get(db, id),
    lookupByName:   (libraryId, name)         => seriesRepoNs.lookupByName(db, libraryId, name),
    listForLibrary: (libraryId, opts)         => seriesRepoNs.listForLibrary(db, libraryId, opts),
    update:         (id, fields)              => seriesRepoNs.update(db, id, fields),
    softDelete:     (id, when)                => seriesRepoNs.softDelete(db, id, when),
    restore:        (id)                      => seriesRepoNs.restore(db, id),
  };
}

type VolumeFacade = {
  getOrCreate:        (seriesId: number, number: number, name?: string | null) =>
    ReturnType<typeof volumeRepoNs.getOrCreate>;
  getOrCreateImplicit:(seriesId: number) => ReturnType<typeof volumeRepoNs.getOrCreateImplicit>;
  get:                (id: number) => ReturnType<typeof volumeRepoNs.get>;
  listForSeries:      (seriesId: number, opts?: volumeRepoNs.ListOptions) =>
    ReturnType<typeof volumeRepoNs.listForSeries>;
  update:     (id: number, fields: volumeRepoNs.UpdateFields) => ReturnType<typeof volumeRepoNs.update>;
  softDelete: (id: number, when?: string) => void;
  restore:    (id: number) => void;
};
function makeVolumeFacade(db: Database.Database): VolumeFacade {
  return {
    getOrCreate:         (seriesId, number, name) => volumeRepoNs.getOrCreate(db, seriesId, number, name ?? null),
    getOrCreateImplicit: (seriesId)               => volumeRepoNs.getOrCreateImplicit(db, seriesId),
    get:                 (id)                     => volumeRepoNs.get(db, id),
    listForSeries:       (seriesId, opts)         => volumeRepoNs.listForSeries(db, seriesId, opts),
    update:              (id, fields)             => volumeRepoNs.update(db, id, fields),
    softDelete:          (id, when)               => volumeRepoNs.softDelete(db, id, when),
    restore:             (id)                     => volumeRepoNs.restore(db, id),
  };
}
