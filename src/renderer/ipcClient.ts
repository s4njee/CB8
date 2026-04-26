import type { MediaRecord, QueryOptions, QueryResult, ScanProgress } from '../shared/types';
import type {
  AddFilesResponse,
  ArchiveOpenResponse,
  ArchivePageResponse,
  FolderSummary,
  LibrarySummary,
} from '../shared/ipcTypes';

const api = window.electronAPI;

// --- Archive ---

export async function archiveOpen(filePath: string): Promise<ArchiveOpenResponse> {
  return api.invoke('archive:open', filePath);
}

export async function archivePage(pageIndex: number): Promise<ArchivePageResponse> {
  return api.invoke('archive:page', pageIndex);
}

export async function archiveClose(): Promise<void> {
  await api.invoke('archive:close');
}

export async function readBookFile(filePath: string): Promise<ArrayBuffer> {
  return api.invoke('book:read-file', filePath);
}

// --- Dialog ---

export async function openFileDialog(): Promise<string | null> {
  return api.invoke('dialog:open-file');
}

// --- Library ---

export async function queryComics(options: QueryOptions): Promise<QueryResult> {
  return api.invoke('library:query', options);
}

export async function queryLibraryComics(libraryId: number, options: QueryOptions): Promise<QueryResult> {
  return api.invoke('libraries:query', libraryId, options);
}

export async function scanDirectory(directoryPath: string): Promise<number> {
  return api.invoke('library:scan', directoryPath);
}

export async function scanBooksDirectory(directoryPath: string): Promise<number> {
  return api.invoke('library:scan-books', directoryPath);
}

export async function classifyPaths(paths: string[]): Promise<{ files: string[]; directories: string[] }> {
  return api.invoke('library:classify-paths', paths);
}

export function onScanProgress(callback: (progress: ScanProgress) => void): () => void {
  return api.on('library:scan-progress', callback);
}

export function cancelScan(): void {
  api.send('library:scan-cancel');
}

export async function addTag(comicId: number, tag: string): Promise<void> {
  await api.invoke('library:add-tag', comicId, tag);
}

export async function removeTag(comicId: number, tag: string): Promise<void> {
  await api.invoke('library:remove-tag', comicId, tag);
}

export async function removeComics(ids: number[]): Promise<void> {
  await api.invoke('library:remove-comics', ids);
}

export async function getThumbnail(comicId: number): Promise<Buffer | null> {
  return api.invoke('library:get-thumbnail', comicId);
}

export async function getAllTags(): Promise<string[]> {
  return api.invoke('library:get-tags');
}

export async function openDirectoryDialog(): Promise<string | null> {
  return api.invoke('dialog:open-directory');
}

export async function addComicFiles(filePaths: string[]): Promise<AddFilesResponse> {
  return api.invoke('library:add-files', filePaths);
}

export async function refreshBookMetadata(comicId: number): Promise<MediaRecord | null> {
  return api.invoke('library:refresh-book-metadata', comicId);
}

export function getPathForFile(file: File): string {
  return api.getPathForFile(file);
}

export async function getLibraries(mediaType?: 'comic' | 'book'): Promise<LibrarySummary[]> {
  return api.invoke('libraries:list', mediaType);
}

export async function createLibrary(name: string, mediaType?: 'comic' | 'book'): Promise<{ id: number; name: string; mediaType: 'comic' | 'book' } | null> {
  return api.invoke('libraries:create', name, mediaType);
}

export async function renameLibrary(id: number, newName: string): Promise<void> {
  await api.invoke('libraries:rename', id, newName);
}

export async function deleteLibrary(id: number): Promise<void> {
  await api.invoke('libraries:delete', id);
}

export async function addComicsToLibrary(libraryId: number, comicIds: number[]): Promise<void> {
  await api.invoke('libraries:add-comics', libraryId, comicIds);
}

export async function addFoldersToLibrary(libraryId: number, folderIds: number[]): Promise<void> {
  await api.invoke('libraries:add-folders', libraryId, folderIds);
}

export async function removeComicsFromLibrary(libraryId: number, comicIds: number[]): Promise<void> {
  await api.invoke('libraries:remove-comics', libraryId, comicIds);
}

// --- Folders ---

export async function getFolders(libraryId?: number | null): Promise<FolderSummary[]> {
  return api.invoke('folders:list', libraryId);
}

export async function createFolder(name: string, comicIds: number[]): Promise<{ id: number; name: string } | null> {
  return api.invoke('folders:create', name, comicIds);
}

export async function renameFolder(id: number, newName: string): Promise<void> {
  await api.invoke('folders:rename', id, newName);
}

export async function deleteFolder(id: number): Promise<void> {
  await api.invoke('folders:delete', id);
}

export async function queryFolderComics(folderId: number, options: QueryOptions): Promise<QueryResult> {
  return api.invoke('folders:query', folderId, options);
}

export async function addComicsToFolder(folderId: number, comicIds: number[]): Promise<void> {
  await api.invoke('folders:add-comics', folderId, comicIds);
}

export async function removeComicsFromFolder(folderId: number, comicIds: number[]): Promise<void> {
  await api.invoke('folders:remove-comics', folderId, comicIds);
}

// --- Window ---

export async function toggleFullscreen(): Promise<void> {
  await api.invoke('window:toggle-fullscreen');
}

export async function exitFullscreen(): Promise<void> {
  await api.invoke('window:exit-fullscreen');
}

export function onFileOpened(callback: (filePath: string) => void): () => void {
  return api.on('file-opened', callback);
}

// --- Reading progress ---

export async function updateReadingProgress(comicId: number, pageIndex: number): Promise<void> {
  await api.invoke('reading:update-progress', comicId, pageIndex);
}

export async function getRecentlyRead(limit?: number, mediaType?: 'comic' | 'book'): Promise<MediaRecord[]> {
  return api.invoke('reading:recently-read', limit, mediaType);
}

export async function getComicByPath(filePath: string): Promise<MediaRecord | null> {
  return api.invoke('reading:get-comic-by-path', filePath);
}

export async function updateReadingLocation(comicId: number, location: string): Promise<void> {
  await api.invoke('reading:update-location', comicId, location);
}

// --- Web server settings ---

// --- App meta ---

export async function getAppMeta(key: string): Promise<string | null> {
  return api.invoke('app-meta:get', key);
}

export async function setAppMeta(key: string, value: string): Promise<void> {
  await api.invoke('app-meta:set', key, value);
}

export interface WebServerSettings {
  enabled: boolean;
  port: number;
  url: string | null;
  lanUrl: string | null;
}

export async function getWebServerSettings(): Promise<WebServerSettings> {
  return api.invoke('webserver:get-settings');
}

export async function setWebServerSettings(enabled: boolean, port: number): Promise<WebServerSettings> {
  return api.invoke('webserver:set-settings', enabled, port);
}

export function onOpenSettings(callback: () => void): () => void {
  return api.on('open-settings', callback);
}
