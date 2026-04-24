/**
 * app/router.js — Hash parsing + top-level navigate() that swaps the view
 * between the reader overlay and the library grid.
 */

import { renderLibrary } from '../views/library.js';
import { renderReader, destroyReader } from '../views/reader.js';
import { state } from './state.js';
import { closeTabPanel, updateTabBarActive, updateSidebarActive } from './tabPanel.js';
import { closeSortSheet } from './sort.js';
import { openModal } from '../admin/modal.js';
import { renderResetPassword } from '../admin/resetPassword.js';
import { showToast } from './toast.js';

export function parseRoute(hash) {
  // Strip the leading '#' and split off any query-string suffix so auth email
  // links like "#/reset-password?token=..." parse cleanly.
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');

  if (path === '/') return { type: 'all' };
  if (path === '/recent') return { type: 'recent' };
  if (path === '/continue') return { type: 'continue' };
  if (path === '/reset-password') return { type: 'reset-password', token: params.get('token') };
  if (path === '/verified') return { type: 'verified' };

  const libM = path.match(/^\/library\/(\d+)$/);
  if (libM) return { type: 'library', id: parseInt(libM[1], 10) };

  const folderM = path.match(/^\/folder\/(\d+)$/);
  if (folderM) return { type: 'folder', id: parseInt(folderM[1], 10) };

  const tagM = path.match(/^\/tag\/(.+)$/);
  if (tagM) return { type: 'tag', tag: decodeURIComponent(tagM[1]) };

  const readM = path.match(/^\/read\/(\d+)(?:\/(\d+))?$/);
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

  // One-shot routes that just open a modal or flash a toast, then behave
  // like '/' for the underlying view.
  if (route.type === 'reset-password') {
    openModal((b) => renderResetPassword(b, { token: route.token }));
  } else if (route.type === 'verified') {
    showToast('Email verified — you are signed in.');
    window.location.replace('#/');
  }

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
