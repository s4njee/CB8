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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  mediaType: '',      // '' | 'comic' | 'book'
  sortBy: 'title',
  search: '',
  route: null,        // parsed route object
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

  const overlay = document.getElementById('reader-overlay');
  const viewContainer = document.getElementById('view-container');

  if (route.type === 'read') {
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
    document.body.style.overflow = '';
    await renderLibrary(viewContainer, route, {
      mediaType: state.mediaType,
      sortBy: state.sortBy,
      search: state.search,
    });
  }
}

// ---------------------------------------------------------------------------
// Sidebar population
// ---------------------------------------------------------------------------

async function populateSidebar() {
  try {
    const [libraries, folders, tags] = await Promise.all([
      api.fetchLibraries(),
      api.fetchFolders(),
      api.fetchTags(),
    ]);

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

  // Sort
  const sortSelect = document.getElementById('sort-select');
  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value;
    navigate();
  });

  // Media type buttons
  document.querySelectorAll('.media-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.media-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.mediaType = btn.dataset.type;
      navigate();
    });
  });

  // Mobile sidebar toggle
  const sidebarToggle = document.createElement('button');
  sidebarToggle.id = 'sidebar-toggle';
  sidebarToggle.setAttribute('aria-label', 'Toggle sidebar');
  sidebarToggle.innerHTML = '☰';
  document.getElementById('navbar').prepend(sidebarToggle);

  const sidebar = document.getElementById('sidebar');
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
  // Close sidebar on navigation
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a')) sidebar.classList.remove('open');
  });

  // Keyboard: Escape closes reader
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('reader-overlay').classList.contains('hidden')) {
      window.location.hash = '#/';
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  wireControls();
  await populateSidebar();
  window.addEventListener('hashchange', navigate);
  await navigate();
}

init().catch(console.error);
