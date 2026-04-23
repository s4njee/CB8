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
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchComic(id) {
  const res = await fetch(`${API}/api/comics/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function thumbnailUrl(id) {
  return `${API}/api/comics/${id}/thumbnail`;
}

export function pageUrl(id, page) {
  return `${API}/api/comics/${id}/pages/${page}`;
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
  if (!res.ok) throw new Error(`API error ${res.status}`);
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
  if (!res.ok) throw new Error(`API error ${res.status}`);
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
 * Pop the Electron native picker on the server host.
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
