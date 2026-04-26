/**
 * views/library.js — Library grid view (entry point).
 *
 * Renders the header, filter strips, optional Continue-Reading shelf, and
 * the infinitely-scrolling grid of comic/book cards. Card builders live in
 * library/cards.js, selection state in library/selection.js, the empty
 * state in library/empty.js, and the chrome (strips, header actions) in
 * library/strips.js.
 */

import * as api from '../api.js';
import { isAuthenticated, onAdminChange } from '../admin.js';

import {
  resetSelection, setGrid, trackId, clearSelection,
  ensureCheckbox, syncCardSelection,
} from './library/selection.js';
import {
  createCard, createFolderCard,
} from './library/cards.js';
import {
  buildMediaStrip, buildFileTypeStrip, buildReadStatusStrip,
  routeTitle, buildCollectionActions,
} from './library/strips.js';
import {
  renderEmpty, emptyReasonForRoute,
} from './library/empty.js';

const PAGE_SIZE = 48;
const SHELF_LIMIT = 20;

let offset = 0;
let totalCount = 0;
let loading = false;
let sentinel = null;
let observer = null;
let currentRoute = null;
let currentOptions = null;
let container = null;
let grid = null;

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
  void container;

  resetSelection();

  // Subscribe once to admin auth changes so entering/leaving admin mode
  // re-renders the selection affordances on the grid.
  if (!adminUnsubscribe) {
    adminUnsubscribe = onAdminChange(() => {
      clearSelection();
      if (grid) {
        grid.querySelectorAll('.comic-card').forEach((card) => {
          syncCardSelection(card);
          ensureCheckbox(card);
        });
      }
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

  // Admin affordance: a visible Delete button when viewing a specific
  // collection or folder. Same confirm + navigation flow as the sidebar
  // context menu; added here because the context menu isn't discoverable.
  if (isAuthenticated() && (route.type === 'library' || route.type === 'folder')) {
    header.appendChild(buildCollectionActions(route));
  }

  el.appendChild(header);

  el.appendChild(buildMediaStrip());
  el.appendChild(buildFileTypeStrip());
  if (isAuthenticated()) {
    el.appendChild(buildReadStatusStrip());
  }

  // Continue-reading shelf — only on the main "all" view, only when signed in.
  // Separate element so we can update/remove it without re-rendering the header.
  if (route.type === 'all' && isAuthenticated()) {
    const shelfHost = document.createElement('div');
    shelfHost.id = 'continue-shelf-host';
    el.appendChild(shelfHost);
    // Fire-and-forget: don't block grid render on shelf fetch.
    renderContinueShelf(shelfHost, options).catch((err) => {
      console.error('[CB8] continue shelf load failed:', err);
      shelfHost.remove();
    });
  }

  grid = document.createElement('div');
  grid.className = 'comics-grid';
  grid.id = 'comics-grid';
  el.appendChild(grid);
  setGrid(grid, route);

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

  installPullToRefresh();

  await loadNextPage();
}

// ---------------------------------------------------------------------------
// Pull-to-refresh (mobile)
// ---------------------------------------------------------------------------

function installPullToRefresh() {
  const scrollEl = document.getElementById('main-content');
  if (!scrollEl || scrollEl._ptrInstalled) return;
  scrollEl._ptrInstalled = true;

  const PULL_THRESHOLD = 70;
  const MAX_PULL = 120;
  let ptrStartY = 0;
  let ptrDelta = 0;
  let pulling = false;

  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<div class="ptr-spinner"></div>';
  indicator.style.transform = 'translateY(-60px)';
  scrollEl.prepend(indicator);

  const isReaderOpen = () => document.body.classList.contains('reader-open');

  scrollEl.addEventListener('touchstart', (e) => {
    if (isReaderOpen()) { pulling = false; return; }
    if (scrollEl.scrollTop === 0 && e.touches.length === 1) {
      ptrStartY = e.touches[0].clientY;
      pulling = true;
      ptrDelta = 0;
    } else {
      pulling = false;
    }
  }, { passive: true });

  scrollEl.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    ptrDelta = Math.min(MAX_PULL, e.touches[0].clientY - ptrStartY);
    if (ptrDelta > 0) {
      indicator.style.transform = `translateY(${ptrDelta - 60}px)`;
      indicator.classList.toggle('ready', ptrDelta >= PULL_THRESHOLD);
    } else {
      indicator.style.transform = 'translateY(-60px)';
    }
  }, { passive: true });

  scrollEl.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (ptrDelta >= PULL_THRESHOLD) {
      indicator.classList.add('refreshing');
      indicator.style.transform = 'translateY(10px)';
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      setTimeout(() => {
        indicator.classList.remove('refreshing', 'ready');
        indicator.style.transform = 'translateY(-60px)';
      }, 600);
    } else {
      indicator.style.transform = 'translateY(-60px)';
      indicator.classList.remove('ready');
    }
    ptrDelta = 0;
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Continue-reading shelf (inline, on #/ only)
// ---------------------------------------------------------------------------

async function renderContinueShelf(host, options) {
  const records = await api.fetchContinueReading(SHELF_LIMIT, options.mediaType || undefined);
  if (!records || records.length === 0) {
    host.remove();
    return;
  }

  const shelf = document.createElement('section');
  shelf.className = 'continue-shelf';
  shelf.setAttribute('aria-label', 'Continue reading');

  const header = document.createElement('div');
  header.className = 'continue-shelf-header';
  const title = document.createElement('h2');
  title.className = 'continue-shelf-title';
  title.textContent = 'Continue Reading';
  const seeAll = document.createElement('a');
  seeAll.className = 'continue-shelf-seeall';
  seeAll.href = '#/continue';
  seeAll.textContent = 'See all';
  header.appendChild(title);
  header.appendChild(seeAll);

  const track = document.createElement('div');
  track.className = 'continue-shelf-track';
  for (const record of records) {
    const card = createCard(record);
    card.classList.add('continue-shelf-card');
    track.appendChild(card);
  }

  shelf.appendChild(header);
  shelf.appendChild(track);
  host.appendChild(shelf);
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

    // The "all" view (no library, no folder, no search/tag) hides comics
    // that already live inside a virtual folder, the same way the Electron
    // grid does. Folder cards then take their place — see folder load below.
    const isAllView = !currentRoute || (currentRoute.type !== 'recent'
      && currentRoute.type !== 'continue'
      && currentRoute.type !== 'library'
      && currentRoute.type !== 'folder'
      && currentRoute.type !== 'tag');

    if (currentRoute.type === 'recent') {
      const records = await api.fetchRecentlyRead(PAGE_SIZE + offset, currentOptions.mediaType || undefined);
      result = { records: records.slice(offset, offset + PAGE_SIZE), totalCount: records.length };
    } else if (currentRoute.type === 'continue') {
      const records = await api.fetchContinueReading(PAGE_SIZE + offset, currentOptions.mediaType || undefined);
      result = { records: records.slice(offset, offset + PAGE_SIZE), totalCount: records.length };
    } else if (currentRoute.type === 'library') {
      result = await api.fetchLibraryComics(currentRoute.id, opts);
    } else if (currentRoute.type === 'folder') {
      result = await api.fetchFolderComics(currentRoute.id, opts);
    } else if (currentRoute.type === 'tag') {
      result = await api.fetchComics({ ...opts, tag: currentRoute.tag });
    } else {
      result = await api.fetchComics({ ...opts, excludeFoldered: true });
    }

    // First page of the all view: render folder cards before the comic cards
    // so virtual folders behave like actual containers.
    if (isAllView && offset === 0) {
      try {
        const folders = await api.fetchFolders();
        for (const folder of folders ?? []) {
          grid.appendChild(createFolderCard(folder));
        }
      } catch (err) {
        console.warn('[CB8] Failed to load folders for all view:', err);
      }
    }

    totalCount = result.totalCount || result.records.length;
    offset += result.records.length;

    const countEl = document.getElementById('grid-count');
    if (countEl) countEl.textContent = `${totalCount.toLocaleString()} item${totalCount !== 1 ? 's' : ''}`;

    if (result.records.length === 0 && offset === 0) {
      renderEmpty(grid, emptyReasonForRoute(currentRoute));
    } else {
      for (const record of result.records) {
        grid.appendChild(createCard(record));
        trackId(record.id);
      }
    }
  } catch (err) {
    console.error('[CB8] Library load error:', err);
    if (offset === 0) {
      const reason =
        err?.status === 401 || err?.status === 403 ? 'signed-out'
        : err?.status >= 400 && err?.status < 500 ? 'empty'
        : 'offline';
      renderEmpty(grid, reason);
    }
  } finally {
    loading = false;
    const spinner = document.getElementById('grid-spinner');
    if (spinner) spinner.hidden = true;
  }
}
