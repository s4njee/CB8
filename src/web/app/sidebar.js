/**
 * app/sidebar.js — Desktop sidebar population.
 *
 * Fetches libraries/folders/tags, fills the DOM, and caches the result
 * for the mobile tab panel. Rename/delete actions hang off sidebar links
 * when the user is authenticated.
 */

import * as api from '../api.js';
import { state, sidebarCache } from './state.js';
import { showToast } from './toast.js';
import { openSideContextMenu, attachLongPress } from './sideContextMenu.js';
import { startInlineRename, updateSidebarActive } from './tabPanel.js';
import { isAuthenticated } from '../admin.js';

export async function populateSidebar() {
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
      const nameSpan = document.createElement('span');
      nameSpan.className = 'sidebar-link-name';
      nameSpan.textContent = lib.name;
      a.appendChild(nameSpan);
      a.dataset.count = lib.comicCount;
      if (isAuthenticated()) {
        const item = {
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
        };
        const openCtx = (x, y) => {
          openSideContextMenu(x, y, [
            { label: 'Rename', onClick: () => startInlineRename(a, nameSpan, item) },
            { label: 'Delete', danger: true, onClick: item.onDelete },
          ]);
        };
        a.addEventListener('contextmenu', (e) => { e.preventDefault(); openCtx(e.clientX, e.clientY); });
        attachLongPress(a, (x, y) => openCtx(x, y));
      }
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
    // Hide empty folders; when the top media toggle is on a specific type,
    // hide folders whose contents don't match. Mixed folders always show.
    const mediaFilter = state.mediaType || '';
    const visibleFolders = folders.filter((f) => {
      if (f.mediaType === 'empty') return false;
      if (mediaFilter === 'comic') return f.mediaType === 'comic' || f.mediaType === 'mixed';
      if (mediaFilter === 'book')  return f.mediaType === 'book'  || f.mediaType === 'mixed';
      return true;
    });
    for (const folder of visibleFolders) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#/folder/${folder.id}`;
      a.className = 'sidebar-link';
      a.textContent = folder.name;
      li.appendChild(a);
      folderList.appendChild(li);
    }
    document.getElementById('section-folders').hidden = visibleFolders.length === 0;

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
