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
