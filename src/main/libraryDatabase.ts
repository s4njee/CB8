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
import * as maintenance from './db/maintenance';

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
  setComicSeries(comicId: number, seriesName: string | null, volumeNumber: number | null, chapterNumber: number | null): void {
    comics.setComicSeries(this.db, comicId, seriesName, volumeNumber, chapterNumber);
  }
  getAllSeries(): { name: string; count: number; coverComicId: number | null }[] {
    return comics.getAllSeries(this.db);
  }
  getSeriesComics(name: string): MediaRecord[] { return comics.getSeriesComics(this.db, name); }
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
  getFolderSeriesGroups(userId: number | null, folderId: number, options: Parameters<typeof folders.getFolderSeriesGroups>[3] = {}) {
    return folders.getFolderSeriesGroups(this.db, userId, folderId, options);
  }
  getFolderVolumeGroups(userId: number | null, folderId: number, seriesKey: string, options: Parameters<typeof folders.getFolderVolumeGroups>[4] = {}) {
    return folders.getFolderVolumeGroups(this.db, userId, folderId, seriesKey, options);
  }
  getFolderChapterGroups(userId: number | null, folderId: number, seriesKey: string, volumeKey: string, options: Parameters<typeof folders.getFolderChapterGroups>[5] = {}) {
    return folders.getFolderChapterGroups(this.db, userId, folderId, seriesKey, volumeKey, options);
  }
  getFolderVolumeComicsForUser(
    userId: number | null,
    folderId: number,
    seriesKey: string,
    volumeKey: string,
    chapterKey: string | null,
    options: Parameters<typeof folders.getFolderVolumeComicsForUser>[6] = {},
  ) {
    return folders.getFolderVolumeComicsForUser(this.db, userId, folderId, seriesKey, volumeKey, chapterKey, options);
  }
  getComicFolderIds(comicId: number): number[] { return folders.getComicFolderIds(this.db, comicId); }

  // Global (library-wide) hierarchy — no folder scope, used by search/browse view.
  getGlobalSeriesGroups(userId: number | null, options: Parameters<typeof folders.getGlobalSeriesGroups>[2] = {}) {
    return folders.getGlobalSeriesGroups(this.db, userId, options);
  }
  getGlobalVolumeGroups(userId: number | null, seriesKey: string, options: Parameters<typeof folders.getGlobalVolumeGroups>[3] = {}) {
    return folders.getGlobalVolumeGroups(this.db, userId, seriesKey, options);
  }
  getGlobalChapterGroups(userId: number | null, seriesKey: string, volumeKey: string, options: Parameters<typeof folders.getGlobalChapterGroups>[4] = {}) {
    return folders.getGlobalChapterGroups(this.db, userId, seriesKey, volumeKey, options);
  }
  getGlobalVolumeComicsForUser(
    userId: number | null,
    seriesKey: string,
    volumeKey: string,
    chapterKey: string | null,
    options: Parameters<typeof folders.getGlobalVolumeComicsForUser>[5] = {},
  ) {
    return folders.getGlobalVolumeComicsForUser(this.db, userId, seriesKey, volumeKey, chapterKey, options);
  }

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

  // --- maintenance ---
  /** Wipe all catalog rows; preserves users, sessions, app_meta. */
  clearLibrary(): maintenance.ClearLibraryResult { return maintenance.clearLibrary(this.db); }
}
