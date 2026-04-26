/**
 * app.js — CB8 Web UI SPA shell.
 *
 * Public entry point: boots state, wires controls, and delegates to the
 * modules under app/. Re-exports the surface that views/ and admin/
 * modules import (showToast, getState, mediaType/filter setters,
 * isAuthenticated). The hash-routing contract is:
 *   #/                 → all comics/books
 *   #/continue         → continue reading (in-progress only)
 *   #/recent           → recently read
 *   #/library/:id      → library collection
 *   #/folder/:id       → folder
 *   #/tag/:name        → tag filter
 *   #/read/:id         → reader (comic, epub, pdf)
 */

import { toggleAdminPanel, openAddComic, refreshSession, onAdminChange, isAuthenticated, isAdmin } from './admin.js';
import { state, getState } from './app/state.js';
import { showToast } from './app/toast.js';
import { navigate } from './app/router.js';
import { populateSidebar } from './app/sidebar.js';
import { openTabPanel, closeTabPanel, promptNewCollection, promptNewFolder } from './app/tabPanel.js';
import { openSortSheet, closeSortSheet, updateSortLabel, applySort } from './app/sort.js';
import { wireDrop } from './app/drop.js';
import { onComicOpened, onOpenSettings } from './host/index.js';
import { openModal } from './admin/modal.js';
import { renderSettings } from './admin/settings.js';

export { showToast, getState, isAuthenticated };

export function setMediaType(next) {
  state.mediaType = next || '';
  document.querySelectorAll('.media-btn').forEach((b) => {
    b.classList.toggle('active', (b.dataset.type || '') === state.mediaType);
  });
  // Re-render the sidebar so folder filtering (comic vs book) follows the
  // media-type toggle.
  populateSidebar();
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

function wireHostBridges() {
  // OS-driven file open: main resolves the path to a library comic id and
  // fires `comic-opened`. We just navigate to the reader. No-op outside
  // Electron (the bridge returns a no-op unsubscribe).
  onComicOpened((comicId) => {
    if (Number.isFinite(comicId)) window.location.hash = `#/read/${comicId}`;
  });

  // App menu "Web Server…" — open the SPA settings dialog (renders an
  // explanatory placeholder when the host bridge is unavailable).
  onOpenSettings(() => {
    openModal((b) => renderSettings(b));
  });
}

async function init() {
  wireControls();
  wireDrop();
  wireHostBridges();
  updateSortLabel();
  await refreshSession();
  await populateSidebar();
  window.addEventListener('hashchange', navigate);
  await navigate();
}

init().catch(console.error);
