/**
 * app.js — CB8 Web UI SPA router and shell controller
 *
 * Hash-based routing:
 *   #/                 → all comics/books
 *   #/recent           → recently read
 *   #/library/:id      → library collection
 *   #/folder/:id       → folder
 *   #/tag/:name        → tag filter
 *   #/read/:id         → reader (comic, epub, pdf)
 */

import * as api from './api.js';
import { renderLibrary } from './views/library.js';
import { renderReader, destroyReader } from './views/reader.js';
import { toggleAdminPanel, refreshSession, onAdminChange, isAuthenticated } from './admin.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  mediaType: '',       // '' | 'comic' | 'book'
  sortBy:    'title',  // 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead'
  search:    '',
  fileExt:   '',       // '' | 'epub' | 'pdf' | 'cbz' | 'cbr' | 'mobi'
  route:     null,
  tabPanel:  null,     // null | 'collections' | 'folders' | 'tags'
};

// Cached sidebar data (also used to populate the mobile Tab_Panel).
const sidebarCache = {
  libraries: [],
  folders: [],
  tags: [],
};

const SORT_LABELS = {
  title: 'Title',
  dateAdded: 'Date added',
  fileSize: 'File size',
  pageCount: 'Pages',
  lastRead: 'Recently Read',
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

export function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Expose a subset of app state + updaters for view modules.
export function getState() {
  return state;
}
export function setMediaType(next) {
  state.mediaType = next || '';
  document.querySelectorAll('.media-btn').forEach((b) => {
    b.classList.toggle('active', (b.dataset.type || '') === state.mediaType);
  });
  navigate();
}
export function setFileExt(next) {
  state.fileExt = next || '';
  navigate();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function parseRoute(hash) {
  const h = (hash || '#/').replace(/^#/, '') || '/';
  if (h === '/') return { type: 'all' };
  if (h === '/recent') return { type: 'recent' };

  const libM = h.match(/^\/library\/(\d+)$/);
  if (libM) return { type: 'library', id: parseInt(libM[1], 10) };

  const folderM = h.match(/^\/folder\/(\d+)$/);
  if (folderM) return { type: 'folder', id: parseInt(folderM[1], 10) };

  const tagM = h.match(/^\/tag\/(.+)$/);
  if (tagM) return { type: 'tag', tag: decodeURIComponent(tagM[1]) };

  const readM = h.match(/^\/read\/(\d+)(?:\/(\d+))?$/);
  if (readM) return { type: 'read', id: parseInt(readM[1], 10), page: readM[2] ? parseInt(readM[2], 10) : null };

  return { type: 'all' };
}

async function navigate() {
  const route = parseRoute(window.location.hash);
  state.route = route;
  updateSidebarActive(route);
  updateTabBarActive();

  const overlay = document.getElementById('reader-overlay');
  const viewContainer = document.getElementById('view-container');

  if (route.type === 'read') {
    closeTabPanel();
    closeSortSheet();
    document.body.classList.add('reader-open');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await renderReader(
      document.getElementById('reader-content'),
      route.id,
      route.page,
      () => { window.location.hash = '#/'; },
    );
  } else {
    destroyReader();
    overlay.classList.add('hidden');
    document.body.classList.remove('reader-open');
    document.body.style.overflow = '';
    await renderLibrary(viewContainer, route, {
      mediaType: state.mediaType,
      sortBy: state.sortBy,
      search: state.search,
      fileExt: state.fileExt,
    });
  }
}

// ---------------------------------------------------------------------------
// Sidebar population (also populates the mobile Tab_Panel cache)
// ---------------------------------------------------------------------------

async function populateSidebar() {
  try {
    const [libraries, folders, tags] = await Promise.all([
      api.fetchLibraries(),
      api.fetchFolders(),
      api.fetchTags(),
    ]);

    sidebarCache.libraries = libraries;
    sidebarCache.folders = folders;
    sidebarCache.tags = tags;

    const libList = document.getElementById('library-list');
    libList.innerHTML = '';
    for (const lib of libraries) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#/library/${lib.id}`;
      a.className = 'sidebar-link';
      a.textContent = lib.name;
      a.dataset.count = lib.comicCount;
      li.appendChild(a);
      libList.appendChild(li);
    }
    document.getElementById('section-libraries').hidden = libraries.length === 0;

    const folderList = document.getElementById('folder-list');
    folderList.innerHTML = '';
    for (const folder of folders) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#/folder/${folder.id}`;
      a.className = 'sidebar-link';
      a.textContent = folder.name;
      li.appendChild(a);
      folderList.appendChild(li);
    }
    document.getElementById('section-folders').hidden = folders.length === 0;

    const tagList = document.getElementById('tag-list');
    tagList.innerHTML = '';
    for (const tag of tags) {
      const li = document.createElement('li');
      const chip = document.createElement('a');
      chip.href = `#/tag/${encodeURIComponent(tag)}`;
      chip.className = 'tag-chip';
      chip.textContent = tag;
      li.appendChild(chip);
      tagList.appendChild(li);
    }
    document.getElementById('section-tags').hidden = tags.length === 0;

    updateSidebarActive(state.route || { type: 'all' });
  } catch (err) {
    console.error('[CB8] Sidebar populate error:', err);
  }
}

function updateSidebarActive(route) {
  document.querySelectorAll('.sidebar-link, .tag-chip').forEach((el) => {
    el.classList.remove('active');
  });

  if (!route) return;
  if (route.type === 'all') {
    document.getElementById('link-all')?.classList.add('active');
  } else if (route.type === 'recent') {
    document.getElementById('link-recent')?.classList.add('active');
  } else if (route.type === 'library') {
    document.querySelector(`a[href="#/library/${route.id}"]`)?.classList.add('active');
  } else if (route.type === 'folder') {
    document.querySelector(`a[href="#/folder/${route.id}"]`)?.classList.add('active');
  } else if (route.type === 'tag') {
    document.querySelector(`a[href="#/tag/${encodeURIComponent(route.tag)}"]`)?.classList.add('active');
  }
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function updateTabBarActive() {
  const route = state.route || { type: 'all' };
  const panelKinds = new Set(['collections', 'folders', 'tags']);
  document.querySelectorAll('#tab-bar button').forEach((btn) => {
    const tab = btn.dataset.tab;
    let active = false;
    if (state.tabPanel && panelKinds.has(tab)) {
      active = tab === state.tabPanel;
    } else if (!state.tabPanel) {
      if (tab === 'all' && route.type === 'all') active = true;
      else if (tab === 'recent' && route.type === 'recent') active = true;
    }
    btn.classList.toggle('active', active);
  });
}

function openTabPanel(kind) {
  state.tabPanel = kind;
  const panel = document.getElementById('tab-panel');
  const title = document.getElementById('tab-panel-title');
  const list = panel.querySelector('.tab-panel-list');

  const titles = { collections: 'Collections', folders: 'Folders', tags: 'Tags' };
  title.textContent = titles[kind];

  list.innerHTML = '';
  const items = tabPanelItems(kind);
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'tab-panel-empty';
    const emptyLabels = {
      collections: 'No collections',
      folders: 'No folders',
      tags: 'No tags',
    };
    li.textContent = emptyLabels[kind];
    list.appendChild(li);
  } else {
    for (const it of items) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = it.href;
      a.addEventListener('click', () => closeTabPanel());
      const name = document.createElement('span');
      name.textContent = it.label;
      a.appendChild(name);
      if (it.count != null) {
        const count = document.createElement('span');
        count.className = 'tab-panel-count';
        count.textContent = String(it.count);
        a.appendChild(count);
      }
      li.appendChild(a);
      list.appendChild(li);
    }
  }

  panel.hidden = false;
  updateTabBarActive();
}

function closeTabPanel() {
  state.tabPanel = null;
  const panel = document.getElementById('tab-panel');
  if (panel) panel.hidden = true;
  updateTabBarActive();
}

function tabPanelItems(kind) {
  if (kind === 'collections') {
    return sidebarCache.libraries.map((lib) => ({
      href: `#/library/${lib.id}`,
      label: lib.name,
      count: lib.comicCount,
    }));
  }
  if (kind === 'folders') {
    return sidebarCache.folders.map((f) => ({
      href: `#/folder/${f.id}`,
      label: f.name,
      count: f.comicCount,
    }));
  }
  if (kind === 'tags') {
    return sidebarCache.tags.map((name) => ({
      href: `#/tag/${encodeURIComponent(name)}`,
      label: name,
    }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Sort sheet
// ---------------------------------------------------------------------------

function openSortSheet() {
  const sheet = document.getElementById('sort-sheet');
  sheet.querySelectorAll('button[data-sort]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === state.sortBy);
  });
  sheet.hidden = false;
}

function closeSortSheet() {
  const sheet = document.getElementById('sort-sheet');
  if (sheet) sheet.hidden = true;
}

function updateSortLabel() {
  const label = document.querySelector('#sort-button .sort-button-label');
  if (label) label.textContent = SORT_LABELS[state.sortBy] || 'Title';
}

function applySort(value) {
  state.sortBy = value;
  const select = document.getElementById('sort-select');
  if (select) select.value = value;
  updateSortLabel();
  navigate();
}

// ---------------------------------------------------------------------------
// Controls wiring
// ---------------------------------------------------------------------------

function wireControls() {
  // Search — debounced
  let searchTimer;
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      navigate();
    }, 280);
  });

  // Desktop sort <select>
  const sortSelect = document.getElementById('sort-select');
  sortSelect.addEventListener('change', () => {
    applySort(sortSelect.value);
  });

  // Mobile sort button
  const sortButton = document.getElementById('sort-button');
  sortButton?.addEventListener('click', openSortSheet);

  // Sort sheet interactions
  const sortSheet = document.getElementById('sort-sheet');
  sortSheet?.querySelector('.sort-sheet-backdrop')?.addEventListener('click', closeSortSheet);
  sortSheet?.querySelectorAll('button[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applySort(btn.dataset.sort);
      closeSortSheet();
    });
  });

  // Media type buttons (desktop toggle)
  document.querySelectorAll('.media-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMediaType(btn.dataset.type || '');
    });
  });

  // Tab bar
  document.querySelectorAll('#tab-bar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'all') {
        closeTabPanel();
        window.location.hash = '#/';
      } else if (tab === 'recent') {
        closeTabPanel();
        window.location.hash = '#/recent';
      } else if (tab === 'collections' || tab === 'folders' || tab === 'tags') {
        if (state.tabPanel === tab) closeTabPanel();
        else openTabPanel(tab);
      }
    });
  });

  // Tab panel close button
  document.querySelector('.tab-panel-close')?.addEventListener('click', closeTabPanel);

  // Admin button
  document.getElementById('admin-button')?.addEventListener('click', toggleAdminPanel);
  onAdminChange((authed) => {
    document.body.classList.toggle('admin-authenticated', authed);
    document.getElementById('admin-button')?.classList.toggle('active', authed);
  });

  // Re-navigate when admin mutates the library
  window.addEventListener('cb8:library-changed', () => {
    populateSidebar();
    navigate();
  });

  // Keyboard: Escape closes reader / open overlays
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('sort-sheet').hidden) { closeSortSheet(); return; }
    if (!document.getElementById('tab-panel').hidden) { closeTabPanel(); return; }
    if (!document.getElementById('reader-overlay').classList.contains('hidden')) {
      window.location.hash = '#/';
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  wireControls();
  updateSortLabel();
  await refreshSession();
  await populateSidebar();
  window.addEventListener('hashchange', navigate);
  await navigate();
}

export { isAuthenticated };

init().catch(console.error);
