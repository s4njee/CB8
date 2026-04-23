/**
 * app/tabPanel.js — Mobile tab bar + swap-panel for collections / folders / tags.
 *
 * Also hosts the shared inline-rename helper used by both the sidebar rows
 * and the tab panel rows, plus the "new collection / folder" prompts that
 * those rows link to.
 */

import * as api from '../api.js';
import { state, sidebarCache } from './state.js';
import { showToast } from './toast.js';
import { openSideContextMenu, attachLongPress, isSideMenuOpen } from './sideContextMenu.js';
import { isAuthenticated } from '../admin.js';

export function updateTabBarActive() {
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

export function updateSidebarActive(route) {
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

export function openTabPanel(kind) {
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
        if (isSideMenuOpen()) { e.preventDefault(); return; }
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

export function startInlineRename(anchor, nameEl, item) {
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

export async function promptNewCollection() {
  const result = await openCollectionModal();
  if (!result) return;
  try {
    await api.createLibrary(result.name, result.mediaType);
    showToast(`Created "${result.name}"`);
    window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  } catch (err) { showToast(err.message); }
}

function openCollectionModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'collection-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="admin-modal-backdrop"></div>
      <div class="admin-modal-panel" role="document">
        <h2 class="admin-modal-title">New collection</h2>
        <form class="admin-form" autocomplete="off">
          <label class="admin-label" for="collection-name">Name</label>
          <input id="collection-name" type="text" class="admin-input" required />
          <span class="admin-label">Type</span>
          <div class="radio-row" role="radiogroup" aria-label="Collection type">
            <label class="radio-pill">
              <input type="radio" name="media-type" value="comic" checked />
              <span>Comics</span>
            </label>
            <label class="radio-pill">
              <input type="radio" name="media-type" value="book" />
              <span>Books</span>
            </label>
          </div>
          <div class="admin-actions">
            <button type="button" class="admin-btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="admin-btn-primary">Create</button>
          </div>
        </form>
      </div>
    `;
    Object.assign(modal.style, {
      position: 'fixed', inset: '0', zIndex: '240',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    document.body.appendChild(modal);

    const nameInput = modal.querySelector('#collection-name');
    const form = modal.querySelector('form');

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      modal.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
    document.addEventListener('keydown', onKey);

    modal.querySelector('.admin-modal-backdrop').addEventListener('click', () => close(null));
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const mediaType = modal.querySelector('input[name="media-type"]:checked').value;
      close({ name, mediaType });
    });

    setTimeout(() => nameInput.focus(), 0);
  });
}

export async function promptNewFolder() {
  const name = window.prompt('New folder name:');
  if (!name?.trim()) return;
  try {
    await api.createFolder(name.trim(), []);
    showToast(`Created "${name.trim()}"`);
    window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  } catch (err) { showToast(err.message); }
}

export function closeTabPanel() {
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
