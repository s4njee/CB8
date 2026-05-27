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

  const folderChapterM = path.match(/^\/folder\/(\d+)\/series\/([^/]+)\/volume\/([^/]+)\/chapter\/([^/]+)$/);
  if (folderChapterM) {
    return {
      type: 'folderChapter',
      id: parseInt(folderChapterM[1], 10),
      seriesKey: decodeURIComponent(folderChapterM[2]),
      volumeKey: decodeURIComponent(folderChapterM[3]),
      chapterKey: decodeURIComponent(folderChapterM[4]),
    };
  }

  const folderVolumeM = path.match(/^\/folder\/(\d+)\/series\/([^/]+)\/volume\/([^/]+)$/);
  if (folderVolumeM) {
    return {
      type: 'folderVolume',
      id: parseInt(folderVolumeM[1], 10),
      seriesKey: decodeURIComponent(folderVolumeM[2]),
      volumeKey: decodeURIComponent(folderVolumeM[3]),
    };
  }

  const folderSeriesM = path.match(/^\/folder\/(\d+)\/series\/([^/]+)$/);
  if (folderSeriesM) {
    return {
      type: 'folderSeries',
      id: parseInt(folderSeriesM[1], 10),
      seriesKey: decodeURIComponent(folderSeriesM[2]),
    };
  }

  const folderM = path.match(/^\/folder\/(\d+)$/);
  if (folderM) return { type: 'folder', id: parseInt(folderM[1], 10) };

  // Global browse/search hierarchy (no folder scope — used when searching)
  const browseChapterM = path.match(/^\/browse\/series\/([^/]+)\/volume\/([^/]+)\/chapter\/([^/]+)$/);
  if (browseChapterM) {
    return {
      type: 'browseChapter',
      seriesKey: decodeURIComponent(browseChapterM[1]),
      volumeKey: decodeURIComponent(browseChapterM[2]),
      chapterKey: decodeURIComponent(browseChapterM[3]),
    };
  }
  const browseVolumeM = path.match(/^\/browse\/series\/([^/]+)\/volume\/([^/]+)$/);
  if (browseVolumeM) {
    return {
      type: 'browseVolume',
      seriesKey: decodeURIComponent(browseVolumeM[1]),
      volumeKey: decodeURIComponent(browseVolumeM[2]),
    };
  }
  const browseSeriesM = path.match(/^\/browse\/series\/([^/]+)$/);
  if (browseSeriesM) {
    return {
      type: 'browseSeries',
      seriesKey: decodeURIComponent(browseSeriesM[1]),
    };
  }

  const tagM = path.match(/^\/tag\/(.+)$/);
  if (tagM) return { type: 'tag', tag: decodeURIComponent(tagM[1]) };

  const readM = path.match(/^\/read\/(\d+)(?:\/(\d+))?$/);
  if (readM) return { type: 'read', id: parseInt(readM[1], 10), page: readM[2] ? parseInt(readM[2], 10) : null };

  return { type: 'all' };
}

// Last non-reader hash — used as the back-button destination when the
// reader is opened. Defaults to '#/' for the case where the user deep-links
// directly into a #/read/… URL without prior navigation.
let previousLibraryHash = '#/';

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
    const backHash = previousLibraryHash;
    await renderReader(
      document.getElementById('reader-content'),
      route.id,
      route.page,
      () => { window.location.hash = backHash; },
      backHash,
    );
  } else {
    // Record the last library/browse view so the reader back button returns here.
    previousLibraryHash = window.location.hash || '#/';
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
