/**
 * views/library/strips.js — mobile filter strips + header chrome.
 *
 * Pure DOM builders. The state setters are imported from app.js so a click
 * mutates the global state machine and triggers a re-render.
 */

import * as api from '../../api.js';
import { getState, setMediaType, setFileExt, setReadStatus, setFavoritesOnly } from '../../app.js';
import { sidebarCache } from '../../app/state.js';
import { showToast } from '../../app/toast.js';

const FILETYPE_PILLS = [
  { ext: '',     label: 'All' },
  { ext: 'epub', label: 'EPUB' },
  { ext: 'pdf',  label: 'PDF' },
  { ext: 'cbz',  label: 'CBZ' },
  { ext: 'cbr',  label: 'CBR' },
  { ext: 'mobi', label: 'MOBI' },
];

const MEDIA_PILLS = [
  { type: '',      label: 'All' },
  { type: 'comic', label: 'Comics' },
  { type: 'book',  label: 'Books' },
];

const READ_STATUS_PILLS = [
  { status: '',            label: 'All' },
  { status: 'unread',      label: 'Unread' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'completed',   label: 'Completed' },
];

export function buildMediaStrip() {
  const strip = document.createElement('div');
  strip.className = 'media-strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Media type');
  const current = getState().mediaType || '';
  for (const { type, label } of MEDIA_PILLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'strip-pill' + (type === current ? ' active' : '');
    btn.dataset.type = type;
    btn.textContent = label;
    btn.addEventListener('click', () => setMediaType(type));
    strip.appendChild(btn);
  }
  return strip;
}

export function buildFileTypeStrip() {
  const strip = document.createElement('div');
  strip.className = 'filetype-strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'File type');
  const current = getState().fileExt || '';
  for (const { ext, label } of FILETYPE_PILLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'strip-pill' + (ext === current ? ' active' : '');
    btn.dataset.ext = ext;
    btn.textContent = label;
    btn.addEventListener('click', () => setFileExt(ext));
    strip.appendChild(btn);
  }
  return strip;
}

export function buildReadStatusStrip() {
  const strip = document.createElement('div');
  strip.className = 'read-status-strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Read status and favorites');
  const current = getState().readStatus || '';
  for (const { status, label } of READ_STATUS_PILLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'strip-pill' + (status === current ? ' active' : '');
    btn.dataset.status = status;
    btn.textContent = label;
    btn.addEventListener('click', () => setReadStatus(status));
    strip.appendChild(btn);
  }

  // Favorites toggle lives in the same row as the read-status pills.
  const on = Boolean(getState().favoritesOnly);
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'strip-pill favorites-pill' + (on ? ' active' : '');
  favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  favBtn.innerHTML = `<span class="heart">${on ? '♥' : '♡'}</span> Favorites`;
  favBtn.addEventListener('click', () => setFavoritesOnly(!on));
  strip.appendChild(favBtn);

  return strip;
}

export function routeTitle(route) {
  switch (route.type) {
    case 'all':     return 'All Items';
    case 'continue': return 'Continue Reading';
    case 'recent':  return 'Recently Read';
    case 'library': {
      const lib = sidebarCache.libraries.find((l) => l.id === route.id);
      return lib?.name ?? 'Collection';
    }
    case 'folder': {
      const folder = sidebarCache.folders.find((f) => f.id === route.id);
      return folder?.name ?? 'Folder';
    }
    case 'tag':     return `Tag: ${route.tag}`;
    default:        return 'Library';
  }
}

/**
 * Header action bar shown when viewing a specific library or folder —
 * currently just a Delete button. Mirrors the sidebar context menu so the
 * action is discoverable for users who don't know about right-click.
 */
export function buildCollectionActions(route) {
  const wrap = document.createElement('div');
  wrap.className = 'library-header-actions';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'library-header-btn library-header-btn-danger';
  btn.title = route.type === 'library' ? 'Delete collection' : 'Delete folder';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6h18"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
    </svg>
    <span>Delete</span>
  `;

  btn.addEventListener('click', async () => {
    const isLibrary = route.type === 'library';
    const kind = isLibrary ? 'collection' : 'folder';
    const name = routeTitle(route);
    if (!window.confirm(`Delete ${kind} "${name}"? Comics and files are not removed.`)) return;
    try {
      if (isLibrary) await api.deleteLibrary(route.id);
      else await api.deleteFolder(route.id);
      showToast(`Deleted "${name}"`);
      window.location.hash = '#/';
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
    } catch (err) {
      showToast(err.message || `Could not delete ${kind}`);
    }
  });

  wrap.appendChild(btn);
  return wrap;
}
