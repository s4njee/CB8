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
import { toggleAdminPanel, openAddComic, refreshSession, onAdminChange, isAuthenticated, isAdmin, gatherFromDrop } from './admin.js';

// ---------------------------------------------------------------------------
// Generic small context menu used by sidebar/tab-panel item right-click
// ---------------------------------------------------------------------------

let _sideMenu = null;
function closeSideMenu() {
  _sideMenu?.remove();
  _sideMenu = null;
  document.removeEventListener('click', _onSideDocClick, true);
  document.removeEventListener('keydown', _onSideKey, true);
  window.removeEventListener('scroll', closeSideMenu, true);
  window.removeEventListener('resize', closeSideMenu);
}
function _onSideDocClick(e) { if (_sideMenu && !_sideMenu.contains(e.target)) closeSideMenu(); }
function _onSideKey(e) { if (e.key === 'Escape') closeSideMenu(); }

function openSideContextMenu(x, y, items) {
  closeSideMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    if (it.danger) btn.className = 'danger';
    btn.textContent = it.label;
    btn.addEventListener('click', () => { closeSideMenu(); it.onClick(); });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
  _sideMenu = menu;
  setTimeout(() => {
    document.addEventListener('click', _onSideDocClick, true);
    document.addEventListener('keydown', _onSideKey, true);
    window.addEventListener('scroll', closeSideMenu, true);
    window.addEventListener('resize', closeSideMenu);
  }, 0);
}

function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0, startY = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; handler(startX, startY, e); }, 500);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  mediaType: '',       // '' | 'comic' | 'book'
  sortBy:    'title',  // 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead'
  search:    '',
  fileExt:   '',       // '' | 'epub' | 'pdf' | 'cbz' | 'cbr' | 'mobi'
  readStatus: '',      // '' | 'unread' | 'in-progress' | 'completed'
  favoritesOnly: false,
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
export function setReadStatus(next) {
  state.readStatus = next || '';
  navigate();
}
export function setFavoritesOnly(next) {
  state.favoritesOnly = !!next;
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
      readStatus: state.readStatus,
      favorites: state.favoritesOnly ? true : undefined,
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
    const comicLibs = libraries.filter((l) => l.mediaType !== 'book');
    const bookLibs = libraries.filter((l) => l.mediaType === 'book');
    const showGroups = comicLibs.length > 0 && bookLibs.length > 0;
    const appendLib = (lib) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#/library/${lib.id}`;
      a.className = 'sidebar-link';
      a.textContent = lib.name;
      a.dataset.count = lib.comicCount;
      li.appendChild(a);
      libList.appendChild(li);
    };
    const appendSubheading = (label) => {
      const li = document.createElement('li');
      li.className = 'sidebar-subheading';
      li.textContent = label;
      libList.appendChild(li);
    };
    if (showGroups) {
      appendSubheading('Comics');
      comicLibs.forEach(appendLib);
      appendSubheading('Books');
      bookLibs.forEach(appendLib);
    } else {
      libraries.forEach(appendLib);
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
      if (it.heading) {
        const li = document.createElement('li');
        li.className = 'tab-panel-subheading';
        li.textContent = it.label;
        list.appendChild(li);
        continue;
      }
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = it.href;
      a.className = 'tab-panel-item';
      a.addEventListener('click', (e) => {
        if (_sideMenu) { e.preventDefault(); return; }
        closeTabPanel();
      });
      const name = document.createElement('span');
      name.className = 'tab-panel-item-name';
      name.textContent = it.label;
      a.appendChild(name);
      if (it.count != null) {
        const count = document.createElement('span');
        count.className = 'tab-panel-count';
        count.textContent = String(it.count);
        a.appendChild(count);
      }

      if (isAuthenticated() && it.onRename && it.onDelete) {
        const openCtx = (x, y) => {
          openSideContextMenu(x, y, [
            { label: 'Rename', onClick: () => startInlineRename(a, name, it) },
            { label: it.deleteLabel || 'Delete', danger: true, onClick: it.onDelete },
          ]);
        };
        a.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openCtx(e.clientX, e.clientY);
        });
        attachLongPress(a, (x, y) => openCtx(x, y));
      }

      li.appendChild(a);
      list.appendChild(li);
    }
  }

  const addBtn = document.getElementById('tab-panel-add');
  if (addBtn) {
    addBtn.onclick = null;
    const canAdd = isAuthenticated() && (kind === 'collections' || kind === 'folders');
    addBtn.hidden = !canAdd;
    if (canAdd) {
      addBtn.setAttribute('aria-label', kind === 'collections' ? 'New collection' : 'New folder');
      addBtn.title = kind === 'collections' ? 'New collection' : 'New folder';
      addBtn.onclick = () => {
        if (kind === 'collections') promptNewCollection();
        else promptNewFolder();
      };
    }
  }

  panel.hidden = false;
  updateTabBarActive();
}

function startInlineRename(anchor, nameEl, item) {
  const original = nameEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tab-panel-rename-input';
  input.value = original;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async () => {
    if (done) return; done = true;
    const next = input.value.trim();
    if (!next || next === original) {
      input.replaceWith(nameEl);
      return;
    }
    try {
      await item.onRename(next);
      // Panel will re-render via cb8:library-changed
    } catch (err) {
      showToast(err.message);
      input.replaceWith(nameEl);
    }
  };
  const cancel = () => {
    if (done) return; done = true;
    input.replaceWith(nameEl);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

async function promptNewCollection() {
  const name = window.prompt('New collection name:');
  if (!name?.trim()) return;
  const mediaType = window.confirm('Books collection? (Cancel = Comics)') ? 'book' : 'comic';
  try {
    await api.createLibrary(name.trim(), mediaType);
    showToast(`Created "${name.trim()}"`);
    window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  } catch (err) { showToast(err.message); }
}

async function promptNewFolder() {
  const name = window.prompt('New folder name:');
  if (!name?.trim()) return;
  try {
    await api.createFolder(name.trim(), []);
    showToast(`Created "${name.trim()}"`);
    window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  } catch (err) { showToast(err.message); }
}

function closeTabPanel() {
  state.tabPanel = null;
  const panel = document.getElementById('tab-panel');
  if (panel) panel.hidden = true;
  updateTabBarActive();
}

function tabPanelItems(kind) {
  if (kind === 'collections') {
    const libToItem = (lib) => ({
      href: `#/library/${lib.id}`,
      label: lib.name,
      count: lib.comicCount,
      onRename: async (next) => {
        await api.renameLibrary(lib.id, next);
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      },
      onDelete: async () => {
        if (!window.confirm(`Delete collection "${lib.name}"? Comics and files are not removed.`)) return;
        try {
          await api.deleteLibrary(lib.id);
          showToast(`Deleted "${lib.name}"`);
          if (state.route?.type === 'library' && state.route.id === lib.id) {
            window.location.hash = '#/';
          }
          window.dispatchEvent(new CustomEvent('cb8:library-changed'));
        } catch (err) { showToast(err.message); }
      },
    });
    const comicLibs = sidebarCache.libraries.filter((l) => l.mediaType !== 'book');
    const bookLibs = sidebarCache.libraries.filter((l) => l.mediaType === 'book');
    if (comicLibs.length > 0 && bookLibs.length > 0) {
      return [
        { heading: true, label: 'Comics' },
        ...comicLibs.map(libToItem),
        { heading: true, label: 'Books' },
        ...bookLibs.map(libToItem),
      ];
    }
    return sidebarCache.libraries.map(libToItem);
  }
  if (kind === 'folders') {
    return sidebarCache.folders.map((f) => ({
      href: `#/folder/${f.id}`,
      label: f.name,
      count: f.comicCount,
      onRename: async (next) => {
        await api.renameFolder(f.id, next);
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      },
      onDelete: async () => {
        if (!window.confirm(`Delete folder "${f.name}"? Comics and files are not removed.`)) return;
        try {
          await api.deleteFolder(f.id);
          showToast(`Deleted "${f.name}"`);
          if (state.route?.type === 'folder' && state.route.id === f.id) {
            window.location.hash = '#/';
          }
          window.dispatchEvent(new CustomEvent('cb8:library-changed'));
        } catch (err) { showToast(err.message); }
      },
    }));
  }
  if (kind === 'tags') {
    return sidebarCache.tags.map((name) => ({
      href: `#/tag/${encodeURIComponent(name)}`,
      label: name,
      onRename: async (next) => {
        await api.renameTag(name, next);
        if (state.route?.type === 'tag' && state.route.tag === name) {
          window.location.hash = `#/tag/${encodeURIComponent(next)}`;
        }
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      },
      deleteLabel: 'Delete tag',
      onDelete: async () => {
        if (!window.confirm(`Delete tag "${name}"? This will remove the tag from all comics.`)) return;
        try {
          await api.deleteTag(name);
          showToast(`Deleted tag "${name}"`);
          if (state.route?.type === 'tag' && state.route.tag === name) {
            window.location.hash = '#/';
          }
          window.dispatchEvent(new CustomEvent('cb8:library-changed'));
        } catch (err) { showToast(err.message); }
      },
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
  document.getElementById('admin-add-button')?.addEventListener('click', openAddComic);
  document.getElementById('sidebar-add-library')?.addEventListener('click', promptNewCollection);
  document.getElementById('sidebar-add-folder')?.addEventListener('click', promptNewFolder);
  onAdminChange(() => {
    const adminFlag = isAdmin();
    document.body.classList.toggle('admin-authenticated', adminFlag);
    document.body.classList.toggle('user-authenticated', isAuthenticated());
    document.getElementById('admin-button')?.classList.toggle('active', isAuthenticated());
  });

  // Re-navigate when admin mutates the library
  window.addEventListener('cb8:library-changed', async () => {
    await populateSidebar();
    if (state.tabPanel) openTabPanel(state.tabPanel);
    navigate();
  });

  // Re-render tab panel action button visibility when admin auth changes
  onAdminChange(() => {
    if (state.tabPanel) openTabPanel(state.tabPanel);
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
// Window-level drag-and-drop
// ---------------------------------------------------------------------------

function wireDrop() {
  const overlay = document.getElementById('drop-overlay') || (() => {
    const el = document.createElement('div');
    el.id = 'drop-overlay';
    el.hidden = true;
    el.innerHTML = '<span>Drop to add to library</span>';
    document.body.appendChild(el);
    return el;
  })();

  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    dragCounter++;
    overlay.hidden = false;
  });

  document.addEventListener('dragleave', () => {
    if (!isAuthenticated()) return;
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.hidden = true; }
  });

  document.addEventListener('dragover', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.hidden = true;
    if (!isAuthenticated()) return;

    let items;
    try {
      items = await gatherFromDrop(e.dataTransfer);
    } catch (err) {
      showToast(`Drop failed: ${err.message}`);
      return;
    }
    if (items.length === 0) {
      showToast('No supported files in drop (.cbz .cbr .epub .pdf .mobi)');
      return;
    }

    showToast(`Uploading ${items.length} file${items.length !== 1 ? 's' : ''}…`);
    let added = 0;
    let failed = 0;
    for (const { file, relPath } of items) {
      try {
        await api.adminUploadFile(file, relPath);
        added++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      showToast(`Added ${added} file${added !== 1 ? 's' : ''}`);
    } else {
      showToast(`Added ${added}, failed ${failed}`);
    }
    if (added > 0) window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  wireControls();
  wireDrop();
  updateSortLabel();
  await refreshSession();
  await populateSidebar();
  window.addEventListener('hashchange', navigate);
  await navigate();
}

export { isAuthenticated };

init().catch(console.error);
