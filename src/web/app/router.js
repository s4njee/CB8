/**
 * app/router.js — Hash parsing + top-level navigate() that swaps the view
 * between the reader overlay and the library grid.
 */

import { renderLibrary } from '../views/library.js';
import { renderReader, destroyReader } from '../views/reader.js';
import { state } from './state.js';
import { closeTabPanel, updateTabBarActive, updateSidebarActive } from './tabPanel.js';
import { closeSortSheet } from './sort.js';

export function parseRoute(hash) {
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

export async function navigate() {
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
