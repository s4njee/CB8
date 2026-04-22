/**
 * views/library.js — Library grid view
 *
 * Renders a paginated, infinitely-scrolling grid of comic/book cards.
 * Supports all routes: all, recent, library, folder, tag.
 */

import * as api from '../api.js';

const PAGE_SIZE = 48;

let currentFetch = null;   // AbortController not available in all contexts but we track the state
let offset = 0;
let totalCount = 0;
let loading = false;
let sentinel = null;
let observer = null;
let currentRoute = null;
let currentOptions = null;
let container = null;
let grid = null;

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
      renderEmpty();
    } else {
      for (const record of result.records) {
        grid.appendChild(createCard(record));
      }
    }
  } catch (err) {
    console.error('[CB8] Library load error:', err);
    if (offset === 0) renderEmpty();
  } finally {
    loading = false;
    const spinner = document.getElementById('grid-spinner');
    if (spinner) spinner.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

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
    img.style.opacity = '0.15';
  });

  const badge = document.createElement('div');
  badge.className = `card-badge${record.mediaType === 'book' ? ' book' : ''}`;
  badge.textContent = record.mediaType === 'book' ? 'Book' : 'Comic';

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  // Progress bar
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

  // Navigation
  const open = () => { window.location.hash = `#/read/${record.id}`; };
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  return card;
}

function renderEmpty() {
  if (!grid) return;
  grid.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = `
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
    <p>No items found</p>
  `;
  grid.appendChild(empty);
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
