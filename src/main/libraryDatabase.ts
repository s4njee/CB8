/**
 * LibraryDatabase — facade over the per-domain modules in src/main/db/.
 *
 * Each method delegates to a free function that accepts the raw `Database`
 * handle. The split is purely for file navigation; behavior is unchanged.
 */

import Database from 'better-sqlite3';
import type { ComicRecord, QueryOptions, QueryResult } from '../shared/types';
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

export class LibraryDatabase {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Open the database, run schema migrations, and execute one-shot repair
   * jobs (some of which call into the async thumbnailer). Replaces the prior
   * synchronous constructor.
   */
  static async open(dbPath: string): Promise<LibraryDatabase> {
    const db = await openOrRecreate(dbPath);
    return new LibraryDatabase(db);
  }

  initialize(): void {
    // Schema already created in open(); this is a no-op hook for callers.
  }

  /** Raw better-sqlite3 handle — used by the better-auth adapter. */
  get raw(): Database.Database { return this.db; }

  // --- app_meta ---
  getAppMeta(key: string): string | null { return appMeta.getAppMeta(this.db, key); }
  setAppMeta(key: string, value: string): void { appMeta.setAppMeta(this.db, key, value); }

  // --- comics ---
  addComic(record: Omit<ComicRecord, 'id' | 'dateAdded'>): ComicRecord { return comics.addComic(this.db, record); }
  removeComics(ids: number[]): void { comics.removeComics(this.db, ids); }
  isDismissed(filePath: string): boolean { return comics.isDismissed(this.db, filePath); }
  getComic(id: number): ComicRecord | null { return comics.getComic(this.db, id); }
  comicExistsByPath(filePath: string): boolean { return comics.comicExistsByPath(this.db, filePath); }
  updateCoverThumbnailByPath(filePath: string, coverThumbnail: Buffer | null): void {
    comics.updateCoverThumbnailByPath(this.db, filePath, coverThumbnail);
  }
  updatePageCountByPath(filePath: string, pageCount: number): void {
    comics.updatePageCountByPath(this.db, filePath, pageCount);
  }
  queryComics(options: QueryOptions = {}): QueryResult { return comics.queryComics(this.db, options); }
  getComicByPath(filePath: string): ComicRecord | null { return comics.getComicByPath(this.db, filePath); }
  updateReadingProgress(comicId: number, pageIndex: number): void {
    comics.updateReadingProgress(this.db, comicId, pageIndex);
  }
  updateReadingLocation(comicId: number, location: string): void {
    comics.updateReadingLocation(this.db, comicId, location);
  }
  getRecentlyRead(limit: number = 10, mediaType?: 'comic' | 'book'): ComicRecord[] {
    return comics.getRecentlyRead(this.db, limit, mediaType);
  }
  getContinueReading(limit: number = 10, mediaType?: 'comic' | 'book'): ComicRecord[] {
    return comics.getContinueReading(this.db, limit, mediaType);
  }
  setComicSeries(comicId: number, seriesName: string | null, volumeNumber: number | null, chapterNumber: number | null): void {
    comics.setComicSeries(this.db, comicId, seriesName, volumeNumber, chapterNumber);
  }
  getAllSeries(): { name: string; count: number; coverComicId: number | null }[] {
    return comics.getAllSeries(this.db);
  }
  getSeriesComics(name: string): ComicRecord[] { return comics.getSeriesComics(this.db, name); }
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
  setUserPasswordHash(id: number, passwordHash: string): void { users.setUserPasswordHash(this.db, id, passwordHash); }

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
  getRecentlyReadByUser(userId: number, limit: number, mediaType?: 'comic' | 'book'): ComicRecord[] {
    return progress.getRecentlyReadByUser(this.db, userId, limit, mediaType);
  }
  getContinueReadingByUser(userId: number, limit: number, mediaType?: 'comic' | 'book'): ComicRecord[] {
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
