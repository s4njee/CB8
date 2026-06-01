/**
 * api.ts — CB8 Web UI API client (TypeScript version)
 */

const API = ''; // same-origin

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface WebComicRecord {
  id: number;
  title: string;
  pageCount: number;          // 0 for books that haven't been counted
  fileSize: number;           // bytes
  dateAdded: string;          // ISO-ish, e.g. "2026-05-20 14:33:21"
  tags: string[];
  lastPage: number | null;    // 0-indexed; null = unread
  lastLocation: string | null;// EPUB CFI string when applicable
  lastRead: string | null;    // last reading timestamp
  mediaType: 'comic' | 'book';
  thumbnailUrl: string;       // already includes ?v= cache buster
  fileExt: string;            // 'epub' | 'pdf' | 'mobi' | 'cbz' | 'cbr' — no leading dot
  favorited: boolean;         // per-user when authenticated; always false for guests
}

export interface Folder {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book' | 'mixed' | 'empty';  // 'empty' folders are hidden client-side
  thumbnailUrl: string | null;
}

export interface Library {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book';
}

export interface SeriesGroup {
  key: string;              // series name OR '__none__' sentinel
  name: string;             // display name
  count: number;
  coverComicId: number | null;
  thumbnailUrl: string | null;
}

export interface VolumeGroup {
  key: string;              // volume number as string OR '__none__'
  label: string;            // pre-formatted display label
  count: number;            // total comics in this volume
  chapterCount: number;     // distinct chapter buckets
  coverComicId: number | null;
  thumbnailUrl: string | null;
}

export interface ChapterGroup {
  key: string;              // chapter number as string OR '__none__'
  label: string;
  count: number;
  coverComicId: number | null;
  thumbnailUrl: string | null;
  singleComicId?: number;   // when count===1 and chapter has a real number
}

export interface GroupResponse<T> {
  groups: T[];
  totalCount: number;
}

export interface SessionResponse {
  authenticated: boolean;
  user: {
    id: number;
    username: string;
    isAdmin: boolean;
  } | null;
  host: boolean;            // request came from 127.0.0.1
  guestAccess: boolean;
}

export interface Bookmark {
  id: number;
  page: number;             // 0-indexed
  note: string | null;
  createdAt: string;
}

export interface HistoryRecord {
  id: number;
  comicId: number;
  action: string;
  page: number | null;
  createdAt: string;
  comic?: WebComicRecord;
}

export interface IngestProgressEvent {
  type: 'progress';
  phase: 'discover' | 'process';
  discovered: number;
  processed: number;
  currentFile: string;
}

export interface IngestErrorEvent {
  type: 'error';
  message: string;
}

export interface IngestFailuresSummaryEvent {
  type: 'failures-summary';
  total: number;
  byClass: Record<string, number>;
  sample: Array<{
    path: string;
    errorClass: string;
    message: string;
  }>;
}

export interface IngestDoneEvent {
  type: 'done';
  added: number;
}

export type IngestEvent =
  | IngestProgressEvent
  | IngestErrorEvent
  | IngestFailuresSummaryEvent
  | IngestDoneEvent;

export interface IngestProgress {
  added: number;
  errors: string[];
  failuresSummary: IngestFailuresSummaryEvent | null;
}

export interface UploadResponse {
  added: number;
  skipped?: number;
  reason?: string;
  filePath: string;
}

export interface HostInfo {
  isElectron: boolean;
  platform: string;
  homePath?: string;
}

export interface InitialCredentials {
  username?: string;
  initial_password?: string | null;
  password?: string | null;
}

export interface ClearLibraryResponse {
  ok: boolean;
  removed: {
    comics: number;
    libraries: number;
    folders: number;
    tags: number;
    progress: number;
    bookmarks: number;
    history: number;
    favorites: number;
    dismissedPaths: number;
  };
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, { status, code }: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    if (status != null) this.status = status;
    if (code != null) this.code = code;
  }
}

function buildQuery(params?: Record<string, any>): string {
  if (!params) return '';
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null);
  if (filtered.length === 0) return '';
  return `?${new URLSearchParams(Object.fromEntries(filtered) as Record<string, string>).toString()}`;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.message || body.error || fallback;
}

interface RequestOptions {
  query?: Record<string, any>;
  body?: any;
  credentials?: RequestCredentials;
  parse?: 'json' | 'none';
  parseError?: 'soft' | 'strict';
  headers?: Record<string, string>;
}

async function request(method: string, path: string, opts: RequestOptions = {}): Promise<any> {
  const { query, body, credentials, parse = 'json', parseError, headers } = opts;
  const init: RequestInit = {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    credentials,
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}${buildQuery(query)}`, init);
  if (!res.ok) {
    const fallback = `API error ${res.status}`;
    const errBody = await res.json().catch(() => ({}));
    const message = errBody.message || errBody.error || fallback;
    throw new ApiError(message, { status: res.status, code: errBody.code });
  }
  if (parse === 'none') return undefined;
  if (parseError === 'soft') {
    return res.json().catch(() => ({ ok: true }));
  }
  return res.json();
}

const get = (path: string, opts?: RequestOptions) => request('GET', path, opts);
const post = (path: string, opts?: RequestOptions) => request('POST', path, opts);
const put = (path: string, opts?: RequestOptions) => request('PUT', path, opts);
const del = (path: string, opts?: RequestOptions) => request('DELETE', path, opts);

export { ApiError };

// ---------------------------------------------------------------------------
// Comics & libraries
// ---------------------------------------------------------------------------

export const fetchComics = (options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get('/api/comics', { query: options });

export const fetchComic = (id: number): Promise<WebComicRecord> =>
  get(`/api/comics/${id}`);

export const deleteComic = (id: number): Promise<void> =>
  del(`/api/comics/${id}`, { parse: 'none' });

export function thumbnailUrl(id: number, width?: number): string {
  return `${API}/api/comics/${id}/thumbnail${width ? `?width=${width | 0}` : ''}`;
}

export function pageUrl(id: number, page: number, width?: number): string {
  return `${API}/api/comics/${id}/pages/${page}${width ? `?width=${width | 0}` : ''}`;
}

export function fileUrl(id: number): string {
  return `${API}/api/comics/${id}/file`;
}

export const fetchLibraries = (mediaType?: 'comic' | 'book'): Promise<Library[]> =>
  get('/api/libraries', { query: { mediaType } });

export const createLibrary = (name: string, mediaType: 'comic' | 'book'): Promise<Library> =>
  post('/api/libraries', { body: { name, mediaType } });

export const renameLibrary = (id: number, name: string): Promise<Library> =>
  put(`/api/libraries/${id}`, { body: { name } });

export const deleteLibrary = (id: number): Promise<void> =>
  del(`/api/libraries/${id}`, { parse: 'none' });

export const addComicsToLibrary = (libraryId: number, comicIds: number[]): Promise<void> =>
  post(`/api/libraries/${libraryId}/comics`, { body: { comicIds }, parse: 'none' });

export const removeComicsFromLibrary = (libraryId: number, comicIds: number[]): Promise<void> =>
  del(`/api/libraries/${libraryId}/comics`, { body: { comicIds }, parse: 'none' });

export const addFoldersToLibrary = (libraryId: number, folderIds: number[]): Promise<void> =>
  post(`/api/libraries/${libraryId}/folders`, { body: { folderIds }, parse: 'none' });

export const fetchLibraryComics = (libraryId: number, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/libraries/${libraryId}/comics`, { query: options });

export const refreshBookMetadata = (comicId: number): Promise<void> =>
  post(`/api/comics/${comicId}/refresh-metadata`, { parse: 'none' });

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const fetchFolders = (): Promise<Folder[]> =>
  get('/api/folders');

export const fetchFolderComics = (folderId: number, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/folders/${folderId}/comics`, { query: options });

export const fetchFolderSeries = (folderId: number, options: Record<string, any> = {}): Promise<GroupResponse<SeriesGroup>> =>
  get(`/api/folders/${folderId}/series`, { query: options });

export const fetchFolderSeriesVolumes = (folderId: number, seriesKey: string, options: Record<string, any> = {}): Promise<GroupResponse<VolumeGroup>> =>
  get(`/api/folders/${folderId}/series/${encodeURIComponent(seriesKey)}/volumes`, { query: options });

export const fetchFolderVolumeChapters = (folderId: number, seriesKey: string, volumeKey: string, options: Record<string, any> = {}): Promise<GroupResponse<ChapterGroup>> =>
  get(`/api/folders/${folderId}/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/chapters`, { query: options });

export const fetchFolderVolumeComics = (folderId: number, seriesKey: string, volumeKey: string, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/folders/${folderId}/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/comics`, { query: options });

export const fetchFolderChapterComics = (folderId: number, seriesKey: string, volumeKey: string, chapterKey: string, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/folders/${folderId}/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/chapters/${encodeURIComponent(chapterKey)}/comics`, { query: options });

// ---------------------------------------------------------------------------
// Global browse/search hierarchy (mirrors folder hierarchy without folder scope)
// ---------------------------------------------------------------------------

export const fetchBrowseSeries = (options: Record<string, any> = {}): Promise<GroupResponse<SeriesGroup>> =>
  get('/api/browse/series', { query: options });

export const fetchBrowseSeriesVolumes = (seriesKey: string, options: Record<string, any> = {}): Promise<GroupResponse<VolumeGroup>> =>
  get(`/api/browse/series/${encodeURIComponent(seriesKey)}/volumes`, { query: options });

export const fetchBrowseVolumeChapters = (seriesKey: string, volumeKey: string, options: Record<string, any> = {}): Promise<GroupResponse<ChapterGroup>> =>
  get(`/api/browse/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/chapters`, { query: options });

export const fetchBrowseVolumeComics = (seriesKey: string, volumeKey: string, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/browse/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/comics`, { query: options });

export const fetchBrowseChapterComics = (seriesKey: string, volumeKey: string, chapterKey: string, options: Record<string, any> = {}): Promise<{ records: WebComicRecord[]; totalCount: number }> =>
  get(`/api/browse/series/${encodeURIComponent(seriesKey)}/volumes/${encodeURIComponent(volumeKey)}/chapters/${encodeURIComponent(chapterKey)}/comics`, { query: options });

export const createFolder = (name: string, comicIds: number[] = []): Promise<Folder> =>
  post('/api/folders', { body: { name, comicIds } });

export const renameFolder = (id: number, name: string): Promise<Folder> =>
  put(`/api/folders/${id}`, { body: { name } });

export const deleteFolder = (id: number): Promise<void> =>
  del(`/api/folders/${id}`, { parse: 'none' });

export const addComicsToFolder = (folderId: number, comicIds: number[]): Promise<void> =>
  post(`/api/folders/${folderId}/comics`, { body: { comicIds }, parse: 'none' });

export const removeComicsFromFolder = (folderId: number, comicIds: number[]): Promise<void> =>
  del(`/api/folders/${folderId}/comics`, { body: { comicIds }, parse: 'none' });

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const fetchTags = (): Promise<string[]> =>
  get('/api/tags');

export const setComicTags = (comicId: number, tags: string[]): Promise<void> =>
  put(`/api/comics/${comicId}/tags`, { body: { tags }, parse: 'none' });

export const renameTag = (oldName: string, newName: string): Promise<void> =>
  put(`/api/tags/${encodeURIComponent(oldName)}`, { body: { newName }, parse: 'none' });

export const deleteTag = (name: string): Promise<void> =>
  del(`/api/tags/${encodeURIComponent(name)}`, { parse: 'none' });

export const addTagToComics = (tag: string, comicIds: number[]): Promise<void> =>
  post(`/api/tags/${encodeURIComponent(tag)}/comics`, { body: { comicIds }, parse: 'none' });

export const removeTagFromComics = (tag: string, comicIds: number[]): Promise<void> =>
  del(`/api/tags/${encodeURIComponent(tag)}/comics`, { body: { comicIds }, parse: 'none' });

// ---------------------------------------------------------------------------
// Reading lists
// ---------------------------------------------------------------------------

export const fetchRecentlyRead = (limit = 20, mediaType?: 'comic' | 'book'): Promise<WebComicRecord[]> =>
  get('/api/recently-read', { query: { limit, mediaType } });

export const fetchContinueReading = (limit = 20, mediaType?: 'comic' | 'book'): Promise<WebComicRecord[]> =>
  get('/api/continue-reading', { query: { limit, mediaType } });

// ---------------------------------------------------------------------------
// Progress / completion
// ---------------------------------------------------------------------------

export const updateProgress = (id: number, page: number): Promise<void> =>
  put(`/api/comics/${id}/progress`, { body: { page }, parse: 'none' });

export const updateLocation = (id: number, location: string): Promise<void> =>
  put(`/api/comics/${id}/progress`, { body: { location }, parse: 'none' });

export const clearProgress = (comicId: number): Promise<void> =>
  del(`/api/comics/${comicId}/progress`, { parse: 'none' });

export const setCompleted = (comicId: number, completed: boolean): Promise<void> =>
  put(`/api/comics/${comicId}/progress`, { body: { completed }, parse: 'none' });

// ---------------------------------------------------------------------------
// Auth (multi-user, better-auth backed)
// ---------------------------------------------------------------------------

export async function getSession(): Promise<SessionResponse> {
  try {
    return await get('/api/auth/session');
  } catch {
    return { authenticated: false, user: null, host: false, guestAccess: false };
  }
}

export async function login(identifier: string, password: string): Promise<any> {
  const isEmail = identifier.includes('@');
  const path = isEmail ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username';
  const body = isEmail ? { email: identifier, password } : { username: identifier, password };
  return request('POST', path, { body, credentials: 'same-origin' });
}

export const logout = (): Promise<void> =>
  post('/api/auth/sign-out', { credentials: 'same-origin', parse: 'none' });

export const signup = ({ email, password, username, name }: Record<string, string>): Promise<any> =>
  post('/api/auth/sign-up/email', {
    body: {
      email,
      password,
      username,
      name: name ?? username ?? email,
      callbackURL: `${window.location.origin}/#/verified`
    },
    credentials: 'same-origin',
  });

export const register = (username: string, password: string): Promise<any> =>
  signup({ email: `${username}@local`, password, username });

export const requestPasswordReset = (email: string): Promise<any> =>
  post('/api/auth/forget-password', { body: { email }, credentials: 'same-origin', parseError: 'soft' });

export const resetPassword = (newPassword: string, token: string): Promise<any> =>
  post('/api/auth/reset-password', { body: { newPassword, token }, credentials: 'same-origin', parseError: 'soft' });

export const sendVerificationEmail = (email: string): Promise<any> =>
  post('/api/auth/send-verification-email', { body: { email }, credentials: 'same-origin', parseError: 'soft' });

// ---------------------------------------------------------------------------
// Users (admin only)
// ---------------------------------------------------------------------------

export const getUsers = (): Promise<any[]> =>
  get('/api/users');

export const createUser = (username: string, password: string): Promise<any> =>
  register(username, password);

export const deleteUser = (id: number): Promise<void> =>
  del(`/api/users/${id}`, { parse: 'none' });

export const setUserRole = (id: number, isAdmin: boolean): Promise<void> =>
  put(`/api/users/${id}/role`, { body: { isAdmin }, parse: 'none' });

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export async function getBookmarks(comicId: number): Promise<Bookmark[]> {
  try {
    return await get(`/api/comics/${comicId}/bookmarks`);
  } catch {
    return [];
  }
}

export const createBookmark = (comicId: number, page: number, note: string | null = null): Promise<Bookmark> =>
  post(`/api/comics/${comicId}/bookmarks`, { body: { page, note } });

export const updateBookmark = (comicId: number, bookmarkId: number, note: string): Promise<Bookmark> =>
  put(`/api/comics/${comicId}/bookmarks/${bookmarkId}`, { body: { note } });

export const deleteBookmark = (comicId: number, bookmarkId: number): Promise<void> =>
  del(`/api/comics/${comicId}/bookmarks/${bookmarkId}`, { parse: 'none' });

// ---------------------------------------------------------------------------
// History / series / favorites
// ---------------------------------------------------------------------------

export const logHistory = (comicId: number, action: string, page: number | null = null): Promise<void> =>
  post('/api/history', { body: { comicId, action, page }, parse: 'none' });

export const getHistory = (offset = 0, limit = 50): Promise<HistoryRecord[]> =>
  get('/api/history', { query: { offset, limit } });

export const getSeries = (): Promise<string[]> =>
  get('/api/series');

export const getSeriesComics = (name: string): Promise<WebComicRecord[]> =>
  get(`/api/series/${encodeURIComponent(name)}/comics`);

export const addFavorite = (comicId: number): Promise<void> =>
  post(`/api/comics/${comicId}/favorite`, { parse: 'none' });

export const removeFavorite = (comicId: number): Promise<void> =>
  del(`/api/comics/${comicId}/favorite`, { parse: 'none' });

// ---------------------------------------------------------------------------
// Metadata + settings
// ---------------------------------------------------------------------------

export const searchMetadata = (comicId: number, query: string, sources?: string[]): Promise<any> =>
  get(`/api/comics/${comicId}/metadata-search`, {
    query: { q: query, sources: sources?.length ? sources.join(',') : undefined },
  });

export const applyMetadata = (comicId: number, metadata: any): Promise<any> =>
  put(`/api/comics/${comicId}/metadata`, { body: metadata });

export const setGuestAccess = (enabled: boolean): Promise<void> =>
  put('/api/settings/guest-access', { body: { enabled }, parse: 'none' });

export async function fetchInitialCredentials(): Promise<InitialCredentials | null> {
  const creds = await get('/api/settings/initial-credentials');
  if (!creds) return null;
  return {
    ...creds,
    initial_password: creds.initial_password ?? creds.password ?? null,
  };
}

export const clearInitialCredentials = (): Promise<void> =>
  del('/api/settings/initial-credentials', { parse: 'none' });

// ---------------------------------------------------------------------------
// Admin (legacy + host-only)
// ---------------------------------------------------------------------------

export const adminHostInfo = (): Promise<HostInfo> =>
  get('/api/admin/host-info');

export async function adminSession(): Promise<{ authenticated: boolean }> {
  try {
    return await get('/api/admin/session');
  } catch {
    return { authenticated: false };
  }
}

export async function adminLogin(password: string): Promise<boolean> {
  try {
    await post('/api/admin/login', { body: { password } });
    return true;
  } catch {
    return false;
  }
}

export const adminLogout = (): Promise<void> =>
  post('/api/admin/logout', { parse: 'none' });

/** Pop the Electron native picker on the server host. */
export const adminPickPath = (kind: 'file' | 'directory'): Promise<{ path: string | null }> =>
  post('/api/admin/pick-path', { body: { kind } });

/** List directory entries for path autocomplete. */
export const adminListDir = (partialPath: string): Promise<{ dir: string; entries: { name: string; path: string; isDir: boolean }[] }> =>
  get('/api/admin/list-dir', { query: { path: partialPath } });

/**
 * Start a server-side scan. Streamed NDJSON response.
 */
export async function adminAddPath(
  targetPath: string,
  onProgress?: (event: IngestProgressEvent) => void,
  opts: { folderName?: string; useFolderNamesAsSeries?: boolean } = {}
): Promise<IngestProgress> {
  const body: Record<string, any> = { path: targetPath };
  if (opts.folderName) body.folderName = opts.folderName;
  if (opts.useFolderNamesAsSeries) body.useFolderNamesAsSeries = true;

  const res = await fetch(`${API}/api/admin/add-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new ApiError(await readErrorMessage(res, `HTTP ${res.status}`), { status: res.status });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let added = 0;
  const errors: string[] = [];
  let failuresSummary: IngestFailuresSummaryEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: IngestEvent;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === 'progress') {
        onProgress?.(msg);
      } else if (msg.type === 'error') {
        errors.push(msg.message);
      } else if (msg.type === 'failures-summary') {
        failuresSummary = msg;
      } else if (msg.type === 'done') {
        added = msg.added ?? 0;
      }
    }
  }
  return { added, errors, failuresSummary };
}

export const adminGetIngestErrors = (limit = 50): Promise<any[]> =>
  get('/api/admin/ingest-errors', { query: { limit } });

export const adminClearIngestErrors = (): Promise<void> =>
  del('/api/admin/ingest-errors', { parse: 'none' });

/**
 * Wipe the library catalog. Preserves users, sessions, and app settings.
 */
export const clearLibrary = (): Promise<ClearLibraryResponse> =>
  del('/api/admin/library');

/**
 * Upload a single file with raw-body POST. Uses XHR for progress.
 */
export function adminUploadFile(
  file: File,
  relPath: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/admin/upload`);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CB8-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-CB8-Relpath', encodeURIComponent(relPath || file.name));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.response || {}) as UploadResponse);
      } else {
        reject(new ApiError(xhr.response?.error || `HTTP ${xhr.status}`, { status: xhr.status }));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(file);
  });
}
