/**
 * api.js — CB8 Web UI API client
 *
 * Thin fetch wrappers for the /api/* endpoints. Almost every call follows the
 * same shape (URL + optional query + optional JSON body, parse JSON, throw on
 * !ok with a message lifted from the response body), so a single `request()`
 * helper covers the bulk of the file.
 */

const API = '';  // same-origin

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    if (status != null) this.status = status;
    if (code != null) this.code = code;
  }
}

function buildQuery(params) {
  if (!params) return '';
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null);
  if (filtered.length === 0) return '';
  return `?${new URLSearchParams(Object.fromEntries(filtered)).toString()}`;
}

async function readErrorMessage(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.message || body.error || fallback;
}

/**
 * Perform a JSON-in / JSON-out request. Returns parsed JSON on success.
 * Throws ApiError with .status (and .code if the server provided one) on
 * any non-2xx response.
 *
 *   request('GET', '/api/comics', { query: { limit: 50 } })
 *   request('POST', '/api/folders', { body: { name } })
 *
 * Pass `parse: 'none'` to skip JSON parsing on success (for endpoints whose
 * body is empty or irrelevant). Pass `parseError: 'soft'` to fall back to
 * `{ ok: true }` if a successful response has no body.
 */
async function request(method, path, opts = {}) {
  const { query, body, credentials, parse = 'json', parseError, headers } = opts;
  const init = {
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

// Convenience wrappers — keep the call sites readable.
const get = (path, opts) => request('GET', path, opts);
const post = (path, opts) => request('POST', path, opts);
const put = (path, opts) => request('PUT', path, opts);
const del = (path, opts) => request('DELETE', path, opts);

export { ApiError };

// ---------------------------------------------------------------------------
// Comics & libraries
// ---------------------------------------------------------------------------

export const fetchComics = (options = {}) => get('/api/comics', { query: options });
export const fetchComic = (id) => get(`/api/comics/${id}`);
export const deleteComic = (id) => del(`/api/comics/${id}`);

export function thumbnailUrl(id, width) {
  return `${API}/api/comics/${id}/thumbnail${width ? `?width=${width|0}` : ''}`;
}
export function pageUrl(id, page, width) {
  return `${API}/api/comics/${id}/pages/${page}${width ? `?width=${width|0}` : ''}`;
}
export function fileUrl(id) {
  return `${API}/api/comics/${id}/file`;
}

export const fetchLibraries = (mediaType) =>
  get('/api/libraries', { query: { mediaType } });
export const createLibrary = (name, mediaType) =>
  post('/api/libraries', { body: { name, mediaType } });
export const renameLibrary = (id, name) =>
  put(`/api/libraries/${id}`, { body: { name } });
export const deleteLibrary = (id) =>
  del(`/api/libraries/${id}`);
export const addComicsToLibrary = (libraryId, comicIds) =>
  post(`/api/libraries/${libraryId}/comics`, { body: { comicIds } });
export const removeComicsFromLibrary = (libraryId, comicIds) =>
  del(`/api/libraries/${libraryId}/comics`, { body: { comicIds } });
export const addFoldersToLibrary = (libraryId, folderIds) =>
  post(`/api/libraries/${libraryId}/folders`, { body: { folderIds } });
export const fetchLibraryComics = (libraryId, options = {}) =>
  get(`/api/libraries/${libraryId}/comics`, { query: options });

// Re-derive page count + cover for an indexed book whose original ingest
// produced an incomplete record (typically a PDF that timed out).
export const refreshBookMetadata = (comicId) =>
  post(`/api/comics/${comicId}/refresh-metadata`);

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const fetchFolders = () => get('/api/folders');
export const fetchFolderComics = (folderId, options = {}) =>
  get(`/api/folders/${folderId}/comics`, { query: options });
export const createFolder = (name, comicIds = []) =>
  post('/api/folders', { body: { name, comicIds } });
export const renameFolder = (id, name) =>
  put(`/api/folders/${id}`, { body: { name } });
export const deleteFolder = (id) =>
  del(`/api/folders/${id}`);
export const addComicsToFolder = (folderId, comicIds) =>
  post(`/api/folders/${folderId}/comics`, { body: { comicIds } });
export const removeComicsFromFolder = (folderId, comicIds) =>
  del(`/api/folders/${folderId}/comics`, { body: { comicIds } });

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const fetchTags = () => get('/api/tags');
export const setComicTags = (comicId, tags) =>
  put(`/api/comics/${comicId}/tags`, { body: { tags } });
export const renameTag = (oldName, newName) =>
  put(`/api/tags/${encodeURIComponent(oldName)}`, { body: { newName } });
export const deleteTag = (name) =>
  del(`/api/tags/${encodeURIComponent(name)}`);
export const addTagToComics = (tag, comicIds) =>
  post(`/api/tags/${encodeURIComponent(tag)}/comics`, { body: { comicIds } });
export const removeTagFromComics = (tag, comicIds) =>
  del(`/api/tags/${encodeURIComponent(tag)}/comics`, { body: { comicIds } });

// ---------------------------------------------------------------------------
// Reading lists
// ---------------------------------------------------------------------------

export const fetchRecentlyRead = (limit = 20, mediaType) =>
  get('/api/recently-read', { query: { limit, mediaType } });
export const fetchContinueReading = (limit = 20, mediaType) =>
  get('/api/continue-reading', { query: { limit, mediaType } });

// ---------------------------------------------------------------------------
// Progress / completion
// ---------------------------------------------------------------------------

export const updateProgress = (id, page) =>
  put(`/api/comics/${id}/progress`, { body: { page }, parse: 'none' });
export const updateLocation = (id, location) =>
  put(`/api/comics/${id}/progress`, { body: { location }, parse: 'none' });
export const clearProgress = (comicId) =>
  del(`/api/comics/${comicId}/progress`, { parse: 'none' });
export const setCompleted = (comicId, completed) =>
  put(`/api/comics/${comicId}/progress`, { body: { completed }, parse: 'none' });

// ---------------------------------------------------------------------------
// Auth (multi-user, better-auth backed)
// ---------------------------------------------------------------------------

export async function getSession() {
  // Soft-fail to "unauthenticated" on any error so guests have a session
  // shape they can pattern-match against.
  try { return await get('/api/auth/session'); }
  catch { return { authenticated: false }; }
}

/**
 * Sign in with username or email. better-auth has separate endpoints; we
 * sniff '@' to pick.
 */
export async function login(identifier, password) {
  const isEmail = identifier.includes('@');
  const path = isEmail ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username';
  const body = isEmail ? { email: identifier, password } : { username: identifier, password };
  return request('POST', path, { body, credentials: 'same-origin' });
}

export const logout = () =>
  post('/api/auth/sign-out', { credentials: 'same-origin', parse: 'none' });

export const signup = ({ email, password, username, name }) =>
  post('/api/auth/sign-up/email', {
    body: { email, password, username, name: name ?? username ?? email,
      callbackURL: `${window.location.origin}/#/verified` },
    credentials: 'same-origin',
  });

// Compat shim — older callers; will be removed once admin user-mgmt UI uses signup.
export const register = (username, password) =>
  signup({ email: `${username}@local`, password, username });

export const requestPasswordReset = (email) =>
  post('/api/auth/forget-password', { body: { email }, credentials: 'same-origin', parseError: 'soft' });
export const resetPassword = (newPassword, token) =>
  post('/api/auth/reset-password', { body: { newPassword, token }, credentials: 'same-origin', parseError: 'soft' });
export const sendVerificationEmail = (email) =>
  post('/api/auth/send-verification-email', { body: { email }, credentials: 'same-origin', parseError: 'soft' });

// ---------------------------------------------------------------------------
// Users (admin only)
// ---------------------------------------------------------------------------

export const getUsers = () => get('/api/users');
export const createUser = (username, password, _isAdmin = false) => register(username, password);
export const deleteUser = (id) => del(`/api/users/${id}`);
export const setUserRole = (id, isAdmin) => put(`/api/users/${id}/role`, { body: { isAdmin } });

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export async function getBookmarks(comicId) {
  try { return await get(`/api/comics/${comicId}/bookmarks`); }
  catch { return []; }
}
export const createBookmark = (comicId, page, note = null) =>
  post(`/api/comics/${comicId}/bookmarks`, { body: { page, note } });
export const updateBookmark = (comicId, bookmarkId, note) =>
  put(`/api/comics/${comicId}/bookmarks/${bookmarkId}`, { body: { note } });
export const deleteBookmark = (comicId, bookmarkId) =>
  del(`/api/comics/${comicId}/bookmarks/${bookmarkId}`, { parse: 'none' });

// ---------------------------------------------------------------------------
// History / series / favorites
// ---------------------------------------------------------------------------

export const logHistory = (comicId, action, page = null) =>
  post('/api/history', { body: { comicId, action, page }, parse: 'none' });
export const getHistory = (offset = 0, limit = 50) =>
  get('/api/history', { query: { offset, limit } });

// v7+ hierarchy API — see `docs/hierarchy/design.md` §6.1.
// (Legacy `getSeries` and `getSeriesComics` were removed in v8.)
export const fetchLibrarySeries = (libraryId, options = {}) =>
  get(`/api/libraries/${libraryId}/series`, { query: options });
export const fetchSeries = (id) => get(`/api/series/${id}`);
export const fetchSeriesVolumes = (id, options = {}) =>
  get(`/api/series/${id}/volumes`, { query: options });
export const fetchSeriesChapters = (id, options = {}) =>
  get(`/api/series/${id}/chapters`, { query: options });
export const fetchVolumeChapters = (id, options = {}) =>
  get(`/api/volumes/${id}/chapters`, { query: options });
export const lookupSeriesByName = (libraryId, name) =>
  get('/api/series/lookup', { query: { libraryId, name } });
export const seriesCoverUrl = (id) => `/api/series/${id}/cover`;
export const volumeCoverUrl = (id) => `/api/volumes/${id}/cover`;

/**
 * Cross-kind search (R-11). Returns a flat array of
 *   { kind: 'series' | 'chapter', id, title, libraryId, seriesId }
 * with series hits ranked above chapter hits when both match.
 *
 * Pass `libraryId` to scope results to one library.
 */
export const searchAll = (q, options = {}) =>
  get('/api/search', { query: { q, ...options } });

export const addFavorite = (comicId) =>
  post(`/api/comics/${comicId}/favorite`, { parse: 'none' });
export const removeFavorite = (comicId) =>
  del(`/api/comics/${comicId}/favorite`, { parse: 'none' });

// ---------------------------------------------------------------------------
// Metadata + settings
// ---------------------------------------------------------------------------

export const searchMetadata = (comicId, query, sources) =>
  get(`/api/comics/${comicId}/metadata-search`, {
    query: { q: query, sources: sources?.length ? sources.join(',') : undefined },
  });
export const applyMetadata = (comicId, metadata) =>
  put(`/api/comics/${comicId}/metadata`, { body: metadata });

export const setGuestAccess = (enabled) =>
  put('/api/settings/guest-access', { body: { enabled } });

export const fetchInitialCredentials = () => get('/api/settings/initial-credentials');
export const clearInitialCredentials = () => del('/api/settings/initial-credentials');

// ---------------------------------------------------------------------------
// Admin (legacy + host-only)
// ---------------------------------------------------------------------------

export const adminHostInfo = () => get('/api/admin/host-info');
export async function adminSession() {
  try { return await get('/api/admin/session'); }
  catch { return { authenticated: false }; }
}
export async function adminLogin(password) {
  try { await post('/api/admin/login', { body: { password } }); return true; }
  catch { return false; }
}
export const adminLogout = () =>
  post('/api/admin/logout', { parse: 'none' });

/** Pop the Electron native picker on the server host. */
export const adminPickPath = (kind) => post('/api/admin/pick-path', { body: { kind } });

/** List directory entries for path autocomplete. */
export const adminListDir = (partialPath) =>
  get('/api/admin/list-dir', { query: { path: partialPath } });

/**
 * Start a server-side scan. `onProgress` is called with each
 * `{type:'progress', phase, discovered, processed, currentFile}` event.
 * Resolves with `{ added, errors }` after the 'done' event.
 *
 * Streamed NDJSON response — handled directly because `request()` assumes
 * a single JSON body.
 */
export async function adminAddPath(targetPath, onProgress, opts = {}) {
  const body = { path: targetPath };
  if (opts.folderName) body.folderName = opts.folderName;
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
  const errors = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'progress') onProgress?.(msg);
      else if (msg.type === 'error') errors.push(msg.message);
      else if (msg.type === 'done') added = msg.added ?? 0;
    }
  }
  return { added, errors };
}
