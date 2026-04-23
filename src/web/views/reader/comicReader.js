/**
 * views/reader/comicReader.js — CBZ/CBR image-at-a-time reader with
 * pinch-zoom/pan, tap-zones, swipe, spread mode, and keyboard controls.
 */

import * as api from '../../api.js';
import { showToast } from '../../app.js';
import { state, acquireWakeLock, releaseWakeLock } from './state.js';
import { loadReaderPrefs, saveReaderPrefs } from './prefs.js';
import { buildToolbar } from './utils.js';

export async function renderComicReader(el, record, initialPage, onBack) {
  const startPage = initialPage ?? record.lastPage ?? 0;
  const prefs = loadReaderPrefs();

  state.comicState = {
    id: record.id,
    pageCount: record.pageCount,
    currentPage: startPage,
    title: record.title,
    onBack,
    prefs,
  };
  const comicState = state.comicState;

  const toolbar = buildToolbar(record.title, onBack);
  const pageLabel = toolbar.querySelector('.toolbar-pages');
  const slider = toolbar.querySelector('.reader-page-slider');

  // --- Extra toolbar buttons for comic reader ---
  const extraControls = document.createElement('div');
  extraControls.className = 'reader-extra-controls';

  const mkBtn = (title) => {
    const b = document.createElement('button');
    b.className = 'reader-tool-btn';
    b.type = 'button';
    b.title = title;
    return b;
  };

  const zoomBtn = mkBtn('Cycle zoom mode');
  const dirBtn = mkBtn('Toggle reading direction');
  const spreadBtn = mkBtn('Toggle spread (two-page) mode');
  const orientBtn = mkBtn('Lock to landscape');
  const fsBtn = mkBtn('Fullscreen');
  const bmBtn = mkBtn('Bookmark this page');
  const favBtn = mkBtn('Favorite');

  extraControls.append(zoomBtn, dirBtn, spreadBtn, orientBtn, bmBtn, favBtn, fsBtn);
  toolbar.appendChild(extraControls);

  const readerBody = document.createElement('div');
  readerBody.className = 'comic-reader';
  readerBody.id = 'comic-reader';
  readerBody.dataset.zoom = prefs.zoomMode;
  readerBody.dataset.direction = prefs.direction;
  readerBody.dataset.spread = prefs.spread;
  readerBody.dataset.transition = prefs.transition;

  const stage = document.createElement('div');
  stage.className = 'comic-stage';

  const img = document.createElement('img');
  img.className = 'comic-page-img';
  img.alt = 'Comic page';
  img.id = 'comic-page-img';
  img.dataset.zoom = prefs.zoomMode;
  stage.appendChild(img);

  const img2 = document.createElement('img');
  img2.className = 'comic-page-img comic-page-img-secondary';
  img2.alt = 'Comic page';
  img2.dataset.zoom = prefs.zoomMode;
  stage.appendChild(img2);

  readerBody.appendChild(stage);

  const hint = document.createElement('div');
  hint.className = 'page-hint';
  hint.id = 'page-hint';
  readerBody.appendChild(hint);

  const tapPrev = document.createElement('div');
  tapPrev.className = 'reader-tap-zone tap-prev';

  const tapNext = document.createElement('div');
  tapNext.className = 'reader-tap-zone tap-next';

  const pageDelta = (dir) => prefs.direction === 'rtl' ? -dir : dir;
  const pageStep = () => prefs.spread === 'double' ? 2 : 1;
  tapPrev.addEventListener('click', () => gotoPage(comicState.currentPage + pageDelta(-1) * pageStep(), { animDir: -1 }));
  tapNext.addEventListener('click', () => gotoPage(comicState.currentPage + pageDelta(1) * pageStep(), { animDir: 1 }));

  readerBody.appendChild(tapPrev);
  readerBody.appendChild(tapNext);

  el.appendChild(toolbar);
  el.appendChild(readerBody);

  if (slider && record.pageCount > 1) {
    slider.min = 0;
    slider.max = record.pageCount - 1;
    slider.addEventListener('input', () => gotoPage(parseInt(slider.value, 10)));
  }

  // --- Pinch-zoom / pan state ----------------------------------------------
  const pan = { scale: 1, tx: 0, ty: 0 };
  const MAX_SCALE = 5;
  function applyTransform() {
    stage.style.transform = `translate(${pan.tx}px, ${pan.ty}px) scale(${pan.scale})`;
    readerBody.classList.toggle('is-zoomed', pan.scale > 1.001);
  }
  function resetTransform() {
    pan.scale = 1; pan.tx = 0; pan.ty = 0;
    stage.style.transform = '';
    readerBody.classList.remove('is-zoomed');
  }

  // --- Zoom mode cycling ---
  const ZOOM_MODES = ['fit-height', 'fit-width', 'original'];
  const ZOOM_ICONS = { 'fit-height': '↕', 'fit-width': '↔', 'original': '1:1' };
  function applyZoom() {
    readerBody.dataset.zoom = prefs.zoomMode;
    img.dataset.zoom = prefs.zoomMode;
    img2.dataset.zoom = prefs.zoomMode;
    zoomBtn.textContent = ZOOM_ICONS[prefs.zoomMode] || '↕';
    resetTransform();
  }
  zoomBtn.addEventListener('click', () => {
    const i = ZOOM_MODES.indexOf(prefs.zoomMode);
    prefs.zoomMode = ZOOM_MODES[(i + 1) % ZOOM_MODES.length];
    saveReaderPrefs(prefs);
    applyZoom();
  });
  applyZoom();

  // --- Direction toggle ---
  function applyDirection() {
    readerBody.dataset.direction = prefs.direction;
    dirBtn.textContent = prefs.direction === 'rtl' ? '→←' : '←→';
  }
  dirBtn.addEventListener('click', () => {
    prefs.direction = prefs.direction === 'ltr' ? 'rtl' : 'ltr';
    saveReaderPrefs(prefs);
    applyDirection();
  });
  applyDirection();

  // --- Spread (two-page) toggle ---
  function applySpread() {
    readerBody.dataset.spread = prefs.spread;
    spreadBtn.textContent = prefs.spread === 'double' ? '▥' : '▯';
    spreadBtn.classList.toggle('active', prefs.spread === 'double');
    if (prefs.spread === 'double' && prefs.zoomMode !== 'fit-height') {
      prefs.zoomMode = 'fit-height';
      applyZoom();
    }
  }
  spreadBtn.addEventListener('click', () => {
    prefs.spread = prefs.spread === 'double' ? 'single' : 'double';
    saveReaderPrefs(prefs);
    applySpread();
    gotoPage(comicState.currentPage, { force: true });
  });
  applySpread();

  // --- Orientation lock ---
  let orientationLocked = false;
  const orientSupported = !!(screen.orientation && typeof screen.orientation.lock === 'function');
  if (!orientSupported) orientBtn.style.display = 'none';
  function updateOrientIcon() {
    orientBtn.textContent = orientationLocked ? '🔒' : '⟳';
    orientBtn.classList.toggle('active', orientationLocked);
    orientBtn.title = orientationLocked ? 'Unlock orientation' : 'Lock to landscape';
  }
  orientBtn.addEventListener('click', async () => {
    if (!orientSupported) return;
    try {
      if (orientationLocked) {
        screen.orientation.unlock();
        orientationLocked = false;
      } else {
        if (!document.fullscreenElement) {
          const target = document.getElementById('reader-overlay') || el;
          await target.requestFullscreen?.().catch(() => {});
        }
        await screen.orientation.lock('landscape');
        orientationLocked = true;
      }
    } catch (err) {
      showToast('Orientation lock not available');
    }
    updateOrientIcon();
  });
  updateOrientIcon();

  // --- Fullscreen ---
  const fsSupported = !!(el.requestFullscreen || document.documentElement.requestFullscreen);
  if (!fsSupported) {
    fsBtn.style.display = 'none';
  }
  function updateFsIcon() {
    fsBtn.textContent = document.fullscreenElement ? '⛶' : '⛶';
    fsBtn.classList.toggle('active', !!document.fullscreenElement);
  }
  fsBtn.addEventListener('click', () => {
    const target = document.getElementById('reader-overlay') || el;
    if (!document.fullscreenElement) target.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', updateFsIcon);
  updateFsIcon();

  // --- Bookmark toggle ---
  let bookmarks = [];
  async function refreshBookmarks() {
    try { bookmarks = await api.getBookmarks(record.id); } catch { bookmarks = []; }
    updateBmIcon();
  }
  function updateBmIcon() {
    const on = bookmarks.some((b) => b.page === comicState.currentPage);
    bmBtn.textContent = on ? '★' : '☆';
    bmBtn.classList.toggle('active', on);
  }
  bmBtn.addEventListener('click', async () => {
    const existing = bookmarks.find((b) => b.page === comicState.currentPage);
    try {
      if (existing) await api.deleteBookmark(record.id, existing.id);
      else await api.createBookmark(record.id, comicState.currentPage);
      await refreshBookmarks();
    } catch (err) {
      showToast(err.message || 'Bookmark failed');
    }
  });
  refreshBookmarks().catch(() => {});

  // --- Favorite toggle ---
  let isFav = record.favorited === true;
  function updateFavIcon() {
    favBtn.textContent = isFav ? '♥' : '♡';
    favBtn.classList.toggle('active', isFav);
  }
  favBtn.addEventListener('click', async () => {
    try {
      if (isFav) await api.removeFavorite(record.id);
      else await api.addFavorite(record.id);
      isFav = !isFav;
      updateFavIcon();
    } catch (err) {
      showToast(err.message || 'Favorite failed');
    }
  });
  updateFavIcon();

  // Preload image map
  const preloadCache = new Map();

  function loadPageImg(page) {
    if (preloadCache.has(page)) return preloadCache.get(page);
    const p = new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i.src);
      i.onerror = reject;
      i.src = api.pageUrl(record.id, page);
    });
    preloadCache.set(page, p);
    return p;
  }

  async function gotoPage(page, { force = false, animDir = 0 } = {}) {
    page = Math.max(0, Math.min(record.pageCount - 1, page));
    if (!force && page === comicState.currentPage && img.src) return;
    comicState.currentPage = page;
    resetTransform();

    if (prefs.transition === 'slide' && animDir !== 0 && !force) {
      stage.classList.remove('slide-from-left', 'slide-from-right');
      // eslint-disable-next-line no-unused-expressions
      void stage.offsetWidth;
      stage.classList.add(animDir > 0 ? 'slide-from-right' : 'slide-from-left');
    }

    img.classList.add('loading');
    try {
      const src = await loadPageImg(page);
      img.src = src;
      img.classList.remove('loading');
    } catch {
      img.classList.remove('loading');
    }

    if (prefs.spread === 'double' && page + 1 < record.pageCount) {
      img2.hidden = false;
      img2.classList.add('loading');
      loadPageImg(page + 1)
        .then((src) => { img2.src = src; img2.classList.remove('loading'); })
        .catch(() => { img2.classList.remove('loading'); });
    } else {
      img2.hidden = true;
      img2.removeAttribute('src');
    }

    const pageDisplay = prefs.spread === 'double' && page + 1 < record.pageCount
      ? `${page + 1}–${page + 2} / ${record.pageCount}`
      : `${page + 1} / ${record.pageCount}`;

    if (pageLabel) pageLabel.textContent = pageDisplay;
    if (slider) slider.value = page;
    if (hint) {
      hint.textContent = pageDisplay;
      hint.classList.remove('fade');
      clearTimeout(hint._timer);
      hint._timer = setTimeout(() => hint.classList.add('fade'), 1800);
    }

    api.updateProgress(record.id, page).catch(() => {});
    updateBmIcon();

    const ahead = prefs.spread === 'double' ? 2 : 1;
    for (let i = 1; i <= ahead; i++) {
      if (page + i < record.pageCount) loadPageImg(page + i).catch(() => {});
      if (page - i >= 0) loadPageImg(page - i).catch(() => {});
    }
  }

  // --- Pinch-to-zoom + pan on the stage ---
  let gesture = null;
  let lastTap = { t: 0, x: 0, y: 0 };

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const mid = (a, b) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  readerBody.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      gesture = {
        kind: 'pinch',
        d0: dist(e.touches[0], e.touches[1]),
        c0: mid(e.touches[0], e.touches[1]),
        baseScale: pan.scale,
        baseTx: pan.tx,
        baseTy: pan.ty,
      };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (pan.scale > 1.001) {
        gesture = { kind: 'pan', x: t.clientX, y: t.clientY, baseTx: pan.tx, baseTy: pan.ty };
      } else {
        gesture = { kind: 'swipe', x: t.clientX, y: t.clientY, t0: Date.now() };
      }
    }
  }, { passive: false });

  readerBody.addEventListener('touchmove', (e) => {
    if (!gesture) return;
    if (gesture.kind === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const c = mid(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(MAX_SCALE, gesture.baseScale * (d / gesture.d0)));
      pan.scale = newScale;
      pan.tx = gesture.baseTx + (c.x - gesture.c0.x);
      pan.ty = gesture.baseTy + (c.y - gesture.c0.y);
      if (newScale <= 1.001) { pan.tx = 0; pan.ty = 0; }
      applyTransform();
    } else if (gesture.kind === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      pan.tx = gesture.baseTx + (t.clientX - gesture.x);
      pan.ty = gesture.baseTy + (t.clientY - gesture.y);
      applyTransform();
    }
  }, { passive: false });

  readerBody.addEventListener('touchend', (e) => {
    if (!gesture) return;
    if (gesture.kind === 'swipe' && e.changedTouches.length) {
      const tch = e.changedTouches[0];
      const dx = tch.clientX - gesture.x;
      const dy = tch.clientY - gesture.y;
      const duration = Date.now() - gesture.t0;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duration < 300) {
        const now = Date.now();
        if (now - lastTap.t < 300 && Math.hypot(tch.clientX - lastTap.x, tch.clientY - lastTap.y) < 40) {
          if (pan.scale > 1.001) {
            resetTransform();
          } else {
            const rect = readerBody.getBoundingClientRect();
            pan.scale = 2;
            pan.tx = (rect.width / 2 - (tch.clientX - rect.left)) * 1;
            pan.ty = (rect.height / 2 - (tch.clientY - rect.top)) * 1;
            applyTransform();
          }
          lastTap = { t: 0, x: 0, y: 0 };
        } else {
          lastTap = { t: now, x: tch.clientX, y: tch.clientY };
        }
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && pan.scale <= 1.001) {
        const swipeDir = dx < 0 ? 1 : -1;
        const step = prefs.spread === 'double' ? 2 : 1;
        gotoPage(comicState.currentPage + pageDelta(swipeDir) * step, { animDir: swipeDir });
      }
    }
    if (pan.scale < 1.001) resetTransform();
    gesture = null;
  }, { passive: true });

  const onKey = (e) => {
    switch (e.key) {
      case 'ArrowRight': case ' ':    e.preventDefault(); gotoPage(comicState.currentPage + pageStep(), { animDir: 1 }); break;
      case 'ArrowLeft':  case 'Backspace': e.preventDefault(); gotoPage(comicState.currentPage - pageStep(), { animDir: -1 }); break;
      case 'Home': e.preventDefault(); gotoPage(0); break;
      case 'End':  e.preventDefault(); gotoPage(record.pageCount - 1); break;
      case 'f': case 'F': fsBtn.click(); break;
      case 'z': case 'Z': zoomBtn.click(); break;
      case 'b': case 'B': bmBtn.click(); break;
      case 's': case 'S': spreadBtn.click(); break;
      case '+': case '=': pan.scale = Math.min(MAX_SCALE, pan.scale + 0.25); applyTransform(); break;
      case '-': case '_': pan.scale = Math.max(1, pan.scale - 0.25); if (pan.scale <= 1.001) resetTransform(); else applyTransform(); break;
      case '0': resetTransform(); break;
    }
  };
  document.addEventListener('keydown', onKey);
  state.readerEl._cleanupKey = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', updateFsIcon);
    releaseWakeLock();
    if (orientSupported && orientationLocked) {
      try { screen.orientation.unlock(); } catch { /* ignore */ }
      orientationLocked = false;
    }
    api.logHistory(record.id, 'closed', state.comicState?.currentPage ?? null).catch(() => {});
  };

  img.addEventListener('click', () => toolbar.classList.toggle('hidden'));

  acquireWakeLock();
  api.logHistory(record.id, 'opened', startPage).catch(() => {});

  await gotoPage(startPage);
  if (startPage > 0) showToast(`Resuming from page ${startPage + 1}`);
}
