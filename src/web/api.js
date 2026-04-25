/**
 * api.js — CB8 Web UI API client
 * Thin fetch wrappers for the /api/* endpoints.
 */

const API = '';  // same-origin

export async function fetchComics(options = {}) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  );
  const res = await fetch(`${API}/api/comics?${params}`);
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchComic(id) {
  const res = await fetch(`${API}/api/comics/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function thumbnailUrl(id, width) {
  const q = width ? `?width=${width|0}` : '';
  return `${API}/api/comics/${id}/thumbnail${q}`;
}

export function pageUrl(id, page, width) {
  const q = width ? `?width=${width|0}` : '';
  return `${API}/api/comics/${id}/pages/${page}${q}`;
}

export function fileUrl(id) {
  return `${API}/api/comics/${id}/file`;
}

export async function fetchLibraries(mediaType) {
  const params = mediaType ? `?mediaType=${mediaType}` : '';
  const res = await fetch(`${API}/api/libraries${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function createLibrary(name, mediaType) {
  const res = await fetch(`${API}/api/libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mediaType }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function addComicsToLibrary(libraryId, comicIds) {
  const res = await fetch(`${API}/api/libraries/${libraryId}/comics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicIds }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function fetchLibraryComics(libraryId, options = {}) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  );
  const res = await fetch(`${API}/api/libraries/${libraryId}/comics?${params}`);
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchFolders() {
  const res = await fetch(`${API}/api/folders`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchFolderComics(folderId, options = {}) {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  );
  const res = await fetch(`${API}/api/folders/${folderId}/comics?${params}`);
  if (!res.ok) {
    const err = new Error(`API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchTags() {
  const res = await fetch(`${API}/api/tags`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchRecentlyRead(limit = 20, mediaType) {
  const params = new URLSearchParams({ limit });
  if (mediaType) params.set('mediaType', mediaType);
  const res = await fetch(`${API}/api/recently-read?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchContinueReading(limit = 20, mediaType) {
  const params = new URLSearchParams({ limit });
  if (mediaType) params.set('mediaType', mediaType);
  const res = await fetch(`${API}/api/continue-reading?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function updateProgress(id, page) {
  await fetch(`${API}/api/comics/${id}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page }),
  });
}

export async function updateLocation(id, location) {
  await fetch(`${API}/api/comics/${id}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  });
}

// --- Admin ---

export async function adminHostInfo() {
  const res = await fetch(`${API}/api/admin/host-info`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function adminSession() {
  const res = await fetch(`${API}/api/admin/session`);
  if (!res.ok) return { authenticated: false };
  return res.json();
}

export async function adminLogin(password) {
  const res = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export async function adminLogout() {
  await fetch(`${API}/api/admin/logout`, { method: 'POST' });
}

/**
 * Pop a native picker on the server host (501 if no host picker is wired).
 * Returns { path: string | null } (null when cancelled).
 */
export async function adminPickPath(kind) {
  const res = await fetch(`${API}/api/admin/pick-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Start a server-side scan. `onProgress` is called with each
 * {type:'progress', phase, discovered, processed, currentFile} event.
 * Resolves with { added, errors } after the 'done' event.
 */
export async function adminAddPath(targetPath, onProgress) {
  const res = await fetch(`${API}/api/admin/add-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
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

/**
 * List directory entries for path autocomplete. Filters to directories and
 * supported file types. Returns up to 50 matches.
 */
export async function adminListDir(partialPath) {
  const res = await fetch(`${API}/api/admin/list-dir?path=${encodeURIComponent(partialPath)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Upload a single file using a raw-body POST. Uses XHR because `fetch` has no
 * upload-progress events in browsers.
 *
 * `relPath` may include forward-slash-separated subdirs (for folder drops).
 * Returns { added, skipped?, reason?, filePath } on success.
 */
export function adminUploadFile(file, relPath, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/admin/upload`);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CB8-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-CB8-Relpath', encodeURIComponent(relPath || file.name));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response || {});
      } else {
        const msg = xhr.response?.error || `HTTP ${xhr.status}`;
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(file);
  });
}

// --- Library management ---

export async function renameLibrary(id, name) {
  const res = await fetch(`${API}/api/libraries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function deleteLibrary(id) {
  const res = await fetch(`${API}/api/libraries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function removeComicsFromLibrary(libraryId, comicIds) {
  const res = await fetch(`${API}/api/libraries/${libraryId}/comics`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicIds }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

// --- Folder management ---

export async function createFolder(name, comicIds = []) {
  const res = await fetch(`${API}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, comicIds }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function renameFolder(id, name) {
  const res = await fetch(`${API}/api/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function deleteFolder(id) {
  const res = await fetch(`${API}/api/folders/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function addComicsToFolder(folderId, comicIds) {
  const res = await fetch(`${API}/api/folders/${folderId}/comics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicIds }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function removeComicsFromFolder(folderId, comicIds) {
  const res = await fetch(`${API}/api/folders/${folderId}/comics`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicIds }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

// --- Tag management ---

export async function setComicTags(comicId, tags) {
  const res = await fetch(`${API}/api/comics/${comicId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function renameTag(oldName, newName) {
  const res = await fetch(`${API}/api/tags/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function deleteTag(name) {
  const res = await fetch(`${API}/api/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API error ${res.status}`);
  return res.json();
}

export async function deleteComic(id) {
  const res = await fetch(`${API}/api/comics/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Auth (multi-user) ---

export async function getSession() {
  const res = await fetch(`${API}/api/auth/session`);
  if (!res.ok) return { authenticated: false };
  return res.json();
}

/**
 * Sign in with a username (or email used as a username) and password.
 */
export async function login(identifier, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identifier, password }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(body.message || body.error || `Login failed (${res.status})`);
    e.code = body.code || null;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function logout() {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'same-origin' });
}

/**
 * Create a new account. Email is required; username is optional but
 * recommended (enables username-based login via the better-auth username
 * plugin).
 */
export async function signup({ email, password, username, name }) {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      username,
      name: name ?? username ?? email,
      // Where the server should send the user after they click the
      // verification link in their email.
      callbackURL: `${window.location.origin}/#/verified`,
    }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Sign-up failed (${res.status})`);
  }
  return res.json();
}

// Kept as a compatibility shim for older callers — will be removed once the
// admin-side user management UI is wired to `signup`.
export async function register(username, password) {
  return signup({ email: `${username}@local`, password, username });
}

/** Ask the server to email a password-reset link for the given address. */
export async function requestPasswordReset(email) {
  const res = await fetch(`${API}/api/auth/forget-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Reset failed (${res.status})`);
  }
  return res.json().catch(() => ({ ok: true }));
}

/** Complete a password reset using the token from the emailed link. */
export async function resetPassword(newPassword, token) {
  const res = await fetch(`${API}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, token }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Reset failed (${res.status})`);
  }
  return res.json().catch(() => ({ ok: true }));
}

/** Re-send the verification email. Used when a user tries to sign in but isn't verified yet. */
export async function sendVerificationEmail(email) {
  const res = await fetch(`${API}/api/auth/send-verification-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Could not send verification email (${res.status})`);
  }
  return res.json().catch(() => ({ ok: true }));
}

// --- Users (admin only) ---

export async function getUsers() {
  const res = await fetch(`${API}/api/users`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function createUser(username, password, isAdmin = false) {
  return register(username, password, isAdmin);
}

export async function deleteUser(id) {
  const res = await fetch(`${API}/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export async function setUserRole(id, isAdmin) {
  const res = await fetch(`${API}/api/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isAdmin }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// --- Progress ---

export async function clearProgress(comicId) {
  await fetch(`${API}/api/comics/${comicId}/progress`, { method: 'DELETE' });
}

export async function setCompleted(comicId, completed) {
  await fetch(`${API}/api/comics/${comicId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
}

// --- Bookmarks ---

export async function getBookmarks(comicId) {
  const res = await fetch(`${API}/api/comics/${comicId}/bookmarks`);
  if (!res.ok) return [];
  return res.json();
}

export async function createBookmark(comicId, page, note = null) {
  const res = await fetch(`${API}/api/comics/${comicId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, note }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function updateBookmark(comicId, bookmarkId, note) {
  const res = await fetch(`${API}/api/comics/${comicId}/bookmarks/${bookmarkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function deleteBookmark(comicId, bookmarkId) {
  await fetch(`${API}/api/comics/${comicId}/bookmarks/${bookmarkId}`, { method: 'DELETE' });
}

// --- History ---

export async function logHistory(comicId, action, page = null) {
  await fetch(`${API}/api/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comicId, action, page }),
  });
}

export async function getHistory(offset = 0, limit = 50) {
  const res = await fetch(`${API}/api/history?offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// --- Series ---

export async function getSeries() {
  const res = await fetch(`${API}/api/series`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getSeriesComics(name) {
  const res = await fetch(`${API}/api/series/${encodeURIComponent(name)}/comics`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// --- Favorites ---

export async function addFavorite(comicId) {
  await fetch(`${API}/api/comics/${comicId}/favorite`, { method: 'POST' });
}

export async function removeFavorite(comicId) {
  await fetch(`${API}/api/comics/${comicId}/favorite`, { method: 'DELETE' });
}

// --- Metadata ---

export async function searchMetadata(comicId, query, sources) {
  const params = new URLSearchParams({ q: query });
  if (sources?.length) params.set('sources', sources.join(','));
  const res = await fetch(`${API}/api/comics/${comicId}/metadata-search?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function applyMetadata(comicId, metadata) {
  const res = await fetch(`${API}/api/comics/${comicId}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// --- Settings ---

export async function setGuestAccess(enabled) {
  const res = await fetch(`${API}/api/settings/guest-access`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
