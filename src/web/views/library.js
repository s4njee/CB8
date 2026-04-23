/**
 * views/library.js — Library grid view
 *
 * Renders a paginated, infinitely-scrolling grid of comic/book cards.
 * Supports all routes: all, recent, library, folder, tag.
 */

import * as api from '../api.js';
import { getState, setMediaType, setFileExt, setReadStatus, setFavoritesOnly } from '../app.js';
import { isAuthenticated, isAdmin, bulkDeleteComics, onAdminChange } from '../admin.js';

const PAGE_SIZE = 48;

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

// Inline neutral book placeholder (used when a thumbnail fails to load).
const PLACEHOLDER_BOOK_SVG_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" preserveAspectRatio="xMidYMid slice">
       <rect width="64" height="96" fill="#1c1c1c"/>
       <g fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
         <path d="M18 24h28v48H18z"/>
         <path d="M18 24v48"/><path d="M22 32h20"/><path d="M22 40h20"/><path d="M22 48h14"/>
       </g>
     </svg>`,
  );

let offset = 0;
let totalCount = 0;
let loading = false;
let sentinel = null;
let observer = null;
let currentRoute = null;
let currentOptions = null;
let container = null;
let grid = null;

// Selection state (admin only)
const selection = new Set();
const orderedIds = [];
let lastClickedId = null;
let selectionBar = null;
let adminUnsubscribe = null;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function renderLibrary(el, route, options) {
  currentRoute = route;
  currentOptions = { ...options };
  offset = 0;
  totalCount = 0;
  loading = false;
  container = el;

  // Reset selection on each render
  selection.clear();
  orderedIds.length = 0;
  lastClickedId = null;
  updateSelectionBar();

  // Subscribe once to admin auth changes so entering/leaving admin mode
  // re-renders the selection affordances on the grid.
  if (!adminUnsubscribe) {
    adminUnsubscribe = onAdminChange(() => {
      selection.clear();
      lastClickedId = null;
      if (grid) {
        grid.querySelectorAll('.comic-card').forEach((card) => {
          syncCardSelection(card);
          ensureCheckbox(card);
        });
      }
      updateSelectionBar();
    });
  }

  // Disconnect any previous observer
  if (observer) { observer.disconnect(); observer = null; }

  el.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'library-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'library-title';
  titleEl.textContent = routeTitle(route);

  const countEl = document.createElement('div');
  countEl.className = 'library-count';
  countEl.id = 'grid-count';
  countEl.textContent = '';

  header.appendChild(titleEl);
  header.appendChild(countEl);
  el.appendChild(header);

  el.appendChild(buildMediaStrip());
  el.appendChild(buildFileTypeStrip());
  if (isAuthenticated()) {
    el.appendChild(buildReadStatusStrip());
    el.appendChild(buildFavoritesToggle());
  }

  grid = document.createElement('div');
  grid.className = 'comics-grid';
  grid.id = 'comics-grid';
  el.appendChild(grid);

  // Infinite scroll sentinel
  sentinel = document.createElement('div');
  sentinel.id = 'load-sentinel';
  el.appendChild(sentinel);

  const spinnerEl = document.createElement('div');
  spinnerEl.className = 'spinner';
  spinnerEl.id = 'grid-spinner';
  spinnerEl.hidden = true;
  el.appendChild(spinnerEl);

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !loading && offset < totalCount) {
        loadNextPage();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinel);

  await loadNextPage();
}

// ---------------------------------------------------------------------------
// Mobile filter strips
// ---------------------------------------------------------------------------

function buildMediaStrip() {
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

function buildFileTypeStrip() {
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

function buildReadStatusStrip() {
  const strip = document.createElement('div');
  strip.className = 'read-status-strip';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Read status');
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
  return strip;
}

function buildFavoritesToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'favorites-toggle';
  const btn = document.createElement('button');
  btn.type = 'button';
  const on = Boolean(getState().favoritesOnly);
  btn.className = 'strip-pill favorites-pill' + (on ? ' active' : '');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.innerHTML = `<span class="heart">${on ? '♥' : '♡'}</span> Favorites`;
  btn.addEventListener('click', () => setFavoritesOnly(!on));
  wrap.appendChild(btn);
  return wrap;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadNextPage() {
  if (loading) return;
  loading = true;

  const spinner = document.getElementById('grid-spinner');
  if (spinner) spinner.hidden = false;

  try {
    const opts = {
      ...currentOptions,
      offset,
      limit: PAGE_SIZE,
      sortBy: currentOptions.sortBy || 'title',
      sortOrder: currentOptions.sortBy === 'lastRead' ? 'desc' : undefined,
    };

    let result;

    if (currentRoute.type === 'recent') {
      const records = await api.fetchRecentlyRead(PAGE_SIZE + offset, currentOptions.mediaType || undefined);
      result = { records: records.slice(offset, offset + PAGE_SIZE), totalCount: records.length };
    } else if (currentRoute.type === 'library') {
      result = await api.fetchLibraryComics(currentRoute.id, opts);
    } else if (currentRoute.type === 'folder') {
      result = await api.fetchFolderComics(currentRoute.id, opts);
    } else if (currentRoute.type === 'tag') {
      result = await api.fetchComics({ ...opts, tag: currentRoute.tag });
    } else {
      result = await api.fetchComics(opts);
    }

    totalCount = result.totalCount || result.records.length;
    offset += result.records.length;

    const countEl = document.getElementById('grid-count');
    if (countEl) countEl.textContent = `${totalCount.toLocaleString()} item${totalCount !== 1 ? 's' : ''}`;

    if (result.records.length === 0 && offset === 0) {
      renderEmpty(emptyReasonForRoute());
    } else {
      for (const record of result.records) {
        grid.appendChild(createCard(record));
        orderedIds.push(record.id);
      }
    }
  } catch (err) {
    console.error('[CB8] Library load error:', err);
    if (offset === 0) renderEmpty('offline');
  } finally {
    loading = false;
    const spinner = document.getElementById('grid-spinner');
    if (spinner) spinner.hidden = true;
  }
}

function emptyReasonForRoute() {
  const s = getState();
  const hasFilter = Boolean(
    s.search || s.mediaType || s.fileExt ||
    (currentRoute && currentRoute.type === 'tag'),
  );
  if (hasFilter) return 'no-results';
  if (currentRoute && currentRoute.type === 'recent') return 'no-recent';
  return 'empty';
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

function formatBadgeFor(record) {
  const ext = (record.fileExt || '').toLowerCase();
  const isBookExt = ext === 'epub' || ext === 'pdf' || ext === 'mobi';
  const label = ext
    ? ext.toUpperCase()
    : (record.mediaType === 'book' ? 'Book' : 'Comic');
  const bookClass = isBookExt || (!ext && record.mediaType === 'book');
  return { label, bookClass };
}

function progressLabelFor(record) {
  if (record.pageCount > 0 && record.lastPage != null && record.lastPage > 0) {
    const pct = Math.max(1, Math.min(100, Math.round((record.lastPage / record.pageCount) * 100)));
    return `${pct}%`;
  }
  if (record.lastLocation) return 'In progress';
  return null;
}

function createCard(record) {
  const card = document.createElement('div');
  card.className = 'comic-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', record.title);
  card.dataset.id = record.id;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb-wrap';

  const img = document.createElement('img');
  img.className = 'card-thumb loading';
  img.alt = record.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = record.thumbnailUrl;
  img.addEventListener('load', () => img.classList.remove('loading'));
  img.addEventListener('error', () => {
    img.classList.remove('loading');
    img.src = PLACEHOLDER_BOOK_SVG_DATA_URI;
  });

  const { label: badgeLabel, bookClass } = formatBadgeFor(record);
  const badge = document.createElement('div');
  badge.className = `card-badge${bookClass ? ' book' : ''}`;
  badge.textContent = badgeLabel;

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  if (record.favorited) card.classList.add('favorited');
  if (isAuthenticated()) {
    const heart = document.createElement('div');
    heart.className = 'card-fav-heart';
    heart.textContent = record.favorited ? '♥' : '♡';
    heart.title = 'Toggle favorite';
    heart.addEventListener('click', async (e) => {
      e.stopPropagation();
      const on = card.classList.contains('favorited');
      try {
        if (on) await api.removeFavorite(record.id);
        else await api.addFavorite(record.id);
        card.classList.toggle('favorited', !on);
        heart.textContent = !on ? '♥' : '♡';
      } catch (err) {
        console.error('[CB8] favorite toggle failed:', err);
      }
    });
    thumbWrap.appendChild(heart);
  }

  ensureCheckbox(card);

  // Progress badge
  const progressLabel = progressLabelFor(record);
  if (progressLabel) {
    const pb = document.createElement('div');
    pb.className = 'progress-badge';
    pb.textContent = progressLabel;
    thumbWrap.appendChild(pb);
  }

  // Progress bar (existing)
  if (record.lastPage && record.pageCount > 0) {
    const pct = Math.min(100, Math.round((record.lastPage / record.pageCount) * 100));
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${pct}%`;
    bar.setAttribute('title', `${pct}% read`);
    thumbWrap.appendChild(bar);
  }

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = record.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = record.pageCount > 0 ? `${record.pageCount} pages` : '';

  info.appendChild(title);
  info.appendChild(meta);

  card.appendChild(thumbWrap);
  card.appendChild(info);

  // Navigation / selection
  const open = () => { window.location.hash = `#/read/${record.id}`; };
  card.addEventListener('click', (e) => {
    if (!isAuthenticated()) { open(); return; }
    e.preventDefault();
    if (e.shiftKey) selectRangeTo(record.id);
    else toggleSelection(record.id);
  });
  card.addEventListener('dblclick', (e) => {
    e.preventDefault();
    open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  card.addEventListener('contextmenu', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, record.id);
  });

  return card;
}

// ---------------------------------------------------------------------------
// Right-click context menu (admin only) — delegates to admin.js
// ---------------------------------------------------------------------------

function openContextMenu(x, y, targetId) {
  const targets = selection.has(targetId) ? Array.from(selection) : [targetId];
  import('../admin.js').then(({ openCardContextMenu }) => {
    openCardContextMenu(x, y, {
      targetId,
      targets,
      isSelected: selection.has(targetId),
      grid,
      route: currentRoute,
      onToggleSelect: (id) => toggleSelection(id),
      onRemoved: (ids) => {
        for (const id of ids) {
          selection.delete(id);
          grid?.querySelector(`.comic-card[data-id="${id}"]`)?.remove();
          const idx = orderedIds.indexOf(id);
          if (idx >= 0) orderedIds.splice(idx, 1);
        }
        lastClickedId = null;
        updateSelectionBar();
      },
      onDelete: async (ids) => {
        const { removed } = await bulkDeleteComics(ids);
        for (const id of removed) {
          selection.delete(id);
          grid?.querySelector(`.comic-card[data-id="${id}"]`)?.remove();
          const idx = orderedIds.indexOf(id);
          if (idx >= 0) orderedIds.splice(idx, 1);
        }
        lastClickedId = null;
        updateSelectionBar();
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Selection (admin only)
// ---------------------------------------------------------------------------

function ensureCheckbox(card) {
  const id = Number(card.dataset.id);
  const existing = card.querySelector('.card-checkbox');
  if (!isAuthenticated()) {
    existing?.remove();
    card.classList.remove('selected');
    return;
  }
  if (existing) {
    syncCardSelection(card);
    return;
  }
  const box = document.createElement('button');
  box.type = 'button';
  box.className = 'card-checkbox';
  box.setAttribute('aria-label', 'Select');
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.shiftKey) selectRangeTo(id);
    else toggleSelection(id);
  });
  const thumbWrap = card.querySelector('.card-thumb-wrap');
  thumbWrap?.appendChild(box);
  syncCardSelection(card);
}

function syncCardSelection(card) {
  const id = Number(card.dataset.id);
  const selected = selection.has(id);
  card.classList.toggle('selected', selected);
  card.setAttribute('aria-selected', selected ? 'true' : 'false');
}

function toggleSelection(id) {
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  lastClickedId = id;
  const card = grid?.querySelector(`.comic-card[data-id="${id}"]`);
  if (card) syncCardSelection(card);
  updateSelectionBar();
}

function selectRangeTo(id) {
  if (lastClickedId == null) {
    toggleSelection(id);
    return;
  }
  const from = orderedIds.indexOf(lastClickedId);
  const to = orderedIds.indexOf(id);
  if (from < 0 || to < 0) {
    toggleSelection(id);
    return;
  }
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  for (let i = lo; i <= hi; i++) selection.add(orderedIds[i]);
  grid?.querySelectorAll('.comic-card').forEach(syncCardSelection);
  updateSelectionBar();
}

function clearSelection() {
  selection.clear();
  lastClickedId = null;
  grid?.querySelectorAll('.comic-card.selected').forEach((card) => {
    card.classList.remove('selected');
    card.setAttribute('aria-selected', 'false');
  });
  updateSelectionBar();
}

function updateSelectionBar() {
  if (selection.size === 0) {
    selectionBar?.remove();
    selectionBar = null;
    return;
  }
  if (!selectionBar) {
    selectionBar = document.createElement('div');
    selectionBar.className = 'selection-bar';
    selectionBar.innerHTML = `
      <span class="selection-count"></span>
      <div class="selection-actions">
        <button type="button" class="selection-btn-secondary" data-action="clear">Cancel</button>
        <button type="button" class="selection-btn-danger" data-action="delete">Delete</button>
      </div>
    `;
    document.body.appendChild(selectionBar);
    selectionBar.querySelector('[data-action="clear"]').addEventListener('click', clearSelection);
    selectionBar.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ids = Array.from(selection);
      const { removed } = await bulkDeleteComics(ids);
      for (const id of removed) {
        selection.delete(id);
        grid?.querySelector(`.comic-card[data-id="${id}"]`)?.remove();
        const idx = orderedIds.indexOf(id);
        if (idx >= 0) orderedIds.splice(idx, 1);
      }
      lastClickedId = null;
      updateSelectionBar();
    });
  }
  selectionBar.querySelector('.selection-count').textContent =
    `${selection.size} selected`;
}

function renderEmpty(reason) {
  if (!grid) return;
  grid.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = emptyStateMarkup(reason);
  grid.appendChild(empty);
}

function emptyStateMarkup(reason) {
  const svgAttrs = 'width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  switch (reason) {
    case 'offline':
      return `
        <svg ${svgAttrs}>
          <path d="M2 2l20 20"/>
          <path d="M8.5 16.5A5 5 0 0 1 12 15a5 5 0 0 1 3.5 1.5"/>
          <path d="M5 12.5A8 8 0 0 1 10 10"/>
          <path d="M19 12a8 8 0 0 0-5.5-7.6"/>
          <path d="M2 8.8A13 13 0 0 1 7 6"/>
        </svg>
        <p>Cannot reach the server. Check your connection.</p>
      `;
    case 'no-results':
      return `
        <svg ${svgAttrs}>
          <circle cx="11" cy="11" r="7"/>
          <path d="m20 20-3.5-3.5"/>
        </svg>
        <p>No items match your search or filters.</p>
      `;
    case 'no-recent':
      return `
        <svg ${svgAttrs}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
        <p>Nothing read yet. Open a book or comic to get started.</p>
      `;
    case 'empty':
    default:
      return `
        <svg ${svgAttrs}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>No items found.</p>
      `;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeTitle(route) {
  switch (route.type) {
    case 'all':     return 'All Items';
    case 'recent':  return 'Recently Read';
    case 'library': return 'Collection';
    case 'folder':  return 'Folder';
    case 'tag':     return `Tag: ${route.tag}`;
    default:        return 'Library';
  }
}
