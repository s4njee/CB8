/**
 * admin/contextMenu.js — Right-click card context menu + tag editor modal.
 *
 * Renders a floating menu anchored at (x, y) with actions that depend on
 * the current route (library/folder) and admin state.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { openModal, closeModal } from './modal.js';
import { isAdmin } from './session.js';
import { openFolderModal, openCollectionModal } from '../app/tabPanel.js';

let _contextMenu = null;

function _closeContextMenu() {
  _contextMenu?.remove();
  _contextMenu = null;
  document.removeEventListener('click', _onDocClick, true);
  document.removeEventListener('keydown', _onDocKey, true);
  window.removeEventListener('resize', _closeContextMenu);
  window.removeEventListener('scroll', _closeContextMenu, true);
}

function _onDocClick(e) {
  if (_contextMenu && !_contextMenu.contains(e.target)) _closeContextMenu();
}

function _onDocKey(e) {
  if (e.key === 'Escape') _closeContextMenu();
}

async function openTagEditor(comicId) {
  let comic;
  try { comic = await api.fetchComic(comicId); }
  catch (err) { showToast(err.message); return; }

  let tags = Array.isArray(comic.tags) ? [...comic.tags] : [];

  openModal((body) => {
    body.innerHTML = `
      <h2 class="admin-modal-title">Edit tags</h2>
      <div class="admin-hint">${comic.title}</div>
      <div class="tag-editor-chips"></div>
      <form class="admin-form tag-editor-form" autocomplete="off">
        <input type="text" class="admin-input tag-editor-input" placeholder="Add a tag…" />
      </form>
      <div class="admin-actions">
        <button type="button" class="admin-btn-primary" data-action="close">Done</button>
      </div>
    `;
    const chips = body.querySelector('.tag-editor-chips');
    const form = body.querySelector('form');
    const input = body.querySelector('.tag-editor-input');

    const render = () => {
      chips.innerHTML = '';
      if (tags.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tag-editor-empty';
        empty.textContent = 'No tags';
        chips.appendChild(empty);
        return;
      }
      for (const t of tags) {
        const chip = document.createElement('span');
        chip.className = 'tag-editor-chip';
        chip.innerHTML = `<span>${t}</span><button type="button" aria-label="Remove">×</button>`;
        chip.querySelector('button').addEventListener('click', async () => {
          const next = tags.filter((x) => x !== t);
          try {
            await api.setComicTags(comicId, next);
            tags = next;
            render();
            window.dispatchEvent(new CustomEvent('cb8:library-changed'));
          } catch (err) { showToast(err.message); }
        });
        chips.appendChild(chip);
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val || tags.includes(val)) { input.value = ''; return; }
      const next = [...tags, val];
      try {
        await api.setComicTags(comicId, next);
        tags = next;
        input.value = '';
        render();
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      } catch (err) { showToast(err.message); }
    });

    body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    render();
    setTimeout(() => input.focus(), 0);
  });
}

export function openCardContextMenu(x, y, { targetId, targets, isSelected, grid, route, onToggleSelect, onDelete, onRemoved }) {
  _closeContextMenu();

  const inLibrary = route?.type === 'library';
  const inFolder = route?.type === 'folder';

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button type="button" role="menuitem" data-action="open">Open</button>
    <button type="button" role="menuitem" data-action="select">${isSelected ? 'Deselect' : 'Select'}</button>
    <div class="context-menu-sep"></div>
    <div class="context-menu-item context-menu-submenu" data-action="add-to-collection" role="menuitem" tabindex="0" aria-haspopup="true">
      Add to collection ▸
      <div class="context-submenu" hidden></div>
    </div>
    <div class="context-menu-item context-menu-submenu" data-action="add-to-folder" role="menuitem" tabindex="0" aria-haspopup="true">
      Add to folder ▸
      <div class="context-submenu" hidden></div>
    </div>
    ${targets.length === 1 ? '<button type="button" role="menuitem" data-action="tags">Tags…</button>' : ''}
    <div class="context-menu-sep"></div>
    <button type="button" role="menuitem" data-action="mark-read">Mark as read</button>
    <button type="button" role="menuitem" data-action="mark-unread">Mark as unread</button>
    ${targets.length === 1 ? '<button type="button" role="menuitem" data-action="toggle-favorite">Toggle favorite</button>' : ''}
    ${inLibrary || inFolder ? '<div class="context-menu-sep"></div>' : ''}
    ${inLibrary ? '<button type="button" role="menuitem" data-action="remove-from-library">Remove from collection</button>' : ''}
    ${inFolder ? '<button type="button" role="menuitem" data-action="remove-from-folder">Remove from folder</button>' : ''}
    ${isAdmin() ? '<div class="context-menu-sep"></div><button type="button" role="menuitem" class="danger" data-action="delete">Delete' + (targets.length > 1 ? ` ${targets.length} items` : '') + '</button>' : ''}
  `;

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  menu.style.top  = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
  _contextMenu = menu;

  menu.querySelector('[data-action="open"]').addEventListener('click', () => {
    _closeContextMenu();
    window.location.hash = `#/read/${targetId}`;
  });

  menu.querySelector('[data-action="select"]').addEventListener('click', () => {
    _closeContextMenu();
    onToggleSelect(targetId);
  });

  // ---- Add to collection submenu ----
  const trigger = menu.querySelector('[data-action="add-to-collection"]');
  const submenu = trigger.querySelector('.context-submenu');
  let loaded = false;

  const populateSubmenu = async () => {
    if (loaded) { submenu.hidden = false; return; }
    loaded = true;
    submenu.innerHTML = '<div class="context-submenu-loading">Loading…</div>';
    submenu.hidden = false;

    try {
      const libraries = await api.fetchLibraries();
      submenu.innerHTML = '';

      for (const lib of libraries) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-submenu-item';
        btn.textContent = lib.name;
        btn.addEventListener('click', async () => {
          _closeContextMenu();
          try {
            await api.addComicsToLibrary(lib.id, targets);
            const n = targets.length;
            showToast(`Added ${n} item${n === 1 ? '' : 's'} to "${lib.name}"`);
          } catch (err) {
            showToast(err.message);
          }
        });
        submenu.appendChild(btn);
      }

      if (libraries.length > 0) {
        submenu.appendChild(Object.assign(document.createElement('div'), { className: 'context-submenu-sep' }));
      }

      const newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'context-submenu-item';
      newBtn.textContent = '+ New collection…';
      newBtn.addEventListener('click', async () => {
        _closeContextMenu();
        const result = await openCollectionModal();
        if (!result) return;
        api.createLibrary(result.name, result.mediaType)
          .then((lib) => api.addComicsToLibrary(lib.id, targets).then(() => lib))
          .then((lib) => {
            const n = targets.length;
            showToast(`Created "${lib.name}" and added ${n} item${n === 1 ? '' : 's'}`);
            window.dispatchEvent(new CustomEvent('cb8:library-changed'));
          })
          .catch((err) => showToast(err.message));
      });
      submenu.appendChild(newBtn);
    } catch {
      submenu.innerHTML = '<div class="context-submenu-loading">Failed to load</div>';
    }
  };

  trigger.addEventListener('mouseenter', populateSubmenu);
  trigger.addEventListener('click', populateSubmenu);

  // ---- Add to folder submenu ----
  const folderTrigger = menu.querySelector('[data-action="add-to-folder"]');
  const folderSubmenu = folderTrigger.querySelector('.context-submenu');
  let foldersLoaded = false;

  const populateFolderSubmenu = async () => {
    if (foldersLoaded) { folderSubmenu.hidden = false; return; }
    foldersLoaded = true;
    folderSubmenu.innerHTML = '<div class="context-submenu-loading">Loading…</div>';
    folderSubmenu.hidden = false;
    try {
      const folders = await api.fetchFolders();
      folderSubmenu.innerHTML = '';
      for (const folder of folders) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'context-submenu-item';
        btn.textContent = folder.name;
        btn.addEventListener('click', async () => {
          _closeContextMenu();
          try {
            await api.addComicsToFolder(folder.id, targets);
            showToast(`Added ${targets.length} item${targets.length === 1 ? '' : 's'} to "${folder.name}"`);
            window.dispatchEvent(new CustomEvent('cb8:library-changed'));
          } catch (err) { showToast(err.message); }
        });
        folderSubmenu.appendChild(btn);
      }
      if (folders.length > 0) {
        folderSubmenu.appendChild(Object.assign(document.createElement('div'), { className: 'context-submenu-sep' }));
      }
      const newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'context-submenu-item';
      newBtn.textContent = '+ New folder…';
      newBtn.addEventListener('click', async () => {
        _closeContextMenu();
        const name = await openFolderModal();
        if (!name) return;
        api.createFolder(name, targets)
          .then((folder) => {
            showToast(`Created "${folder.name}" with ${targets.length} item${targets.length === 1 ? '' : 's'}`);
            window.dispatchEvent(new CustomEvent('cb8:library-changed'));
          })
          .catch((err) => showToast(err.message));
      });
      folderSubmenu.appendChild(newBtn);
    } catch {
      folderSubmenu.innerHTML = '<div class="context-submenu-loading">Failed to load</div>';
    }
  };

  folderTrigger.addEventListener('mouseenter', populateFolderSubmenu);
  folderTrigger.addEventListener('click', populateFolderSubmenu);

  // ---- Tags editor ----
  const tagsBtn = menu.querySelector('[data-action="tags"]');
  if (tagsBtn) {
    tagsBtn.addEventListener('click', () => {
      _closeContextMenu();
      openTagEditor(targets[0]);
    });
  }

  // ---- Remove from collection ----
  const removeLibBtn = menu.querySelector('[data-action="remove-from-library"]');
  if (removeLibBtn) {
    removeLibBtn.addEventListener('click', async () => {
      _closeContextMenu();
      try {
        await api.removeComicsFromLibrary(route.id, targets);
        showToast(`Removed ${targets.length} item${targets.length === 1 ? '' : 's'} from collection`);
        onRemoved?.(targets);
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      } catch (err) { showToast(err.message); }
    });
  }

  // ---- Remove from folder ----
  const removeFolderBtn = menu.querySelector('[data-action="remove-from-folder"]');
  if (removeFolderBtn) {
    removeFolderBtn.addEventListener('click', async () => {
      _closeContextMenu();
      try {
        await api.removeComicsFromFolder(route.id, targets);
        showToast(`Removed ${targets.length} item${targets.length === 1 ? '' : 's'} from folder`);
        onRemoved?.(targets);
        window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      } catch (err) { showToast(err.message); }
    });
  }

  // ---- Mark as read / unread ----
  menu.querySelector('[data-action="mark-read"]').addEventListener('click', async () => {
    _closeContextMenu();
    try {
      await Promise.all(targets.map((id) => api.setCompleted(id, true)));
      showToast(`Marked ${targets.length} item${targets.length === 1 ? '' : 's'} as read`);
      window.dispatchEvent(new CustomEvent('cb8:progress-changed', { detail: { ids: targets } }));
    } catch (err) { showToast(err.message); }
  });

  menu.querySelector('[data-action="mark-unread"]').addEventListener('click', async () => {
    _closeContextMenu();
    try {
      await Promise.all(targets.map((id) => api.clearProgress(id)));
      showToast(`Marked ${targets.length} item${targets.length === 1 ? '' : 's'} as unread`);
      window.dispatchEvent(new CustomEvent('cb8:progress-changed', { detail: { ids: targets } }));
    } catch (err) { showToast(err.message); }
  });

  // ---- Toggle favorite (single target) ----
  const favBtn = menu.querySelector('[data-action="toggle-favorite"]');
  if (favBtn) {
    favBtn.addEventListener('click', async () => {
      _closeContextMenu();
      const card = grid?.querySelector(`.comic-card[data-id="${targetId}"]`);
      const isFav = card?.classList.contains('favorited');
      try {
        if (isFav) await api.removeFavorite(targetId);
        else await api.addFavorite(targetId);
        card?.classList.toggle('favorited', !isFav);
        card?.querySelector('.card-fav-heart')?.replaceChildren(
          document.createTextNode(!isFav ? '♥' : '♡'),
        );
        showToast(!isFav ? 'Added to favorites' : 'Removed from favorites');
      } catch (err) { showToast(err.message); }
    });
  }

  // ---- Delete (admin only) ----
  const deleteBtn = menu.querySelector('[data-action="delete"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      _closeContextMenu();
      await onDelete(targets);
    });
  }

  setTimeout(() => {
    document.addEventListener('click', _onDocClick, true);
    document.addEventListener('keydown', _onDocKey, true);
    window.addEventListener('resize', _closeContextMenu);
    window.addEventListener('scroll', _closeContextMenu, true);
  }, 0);
}
