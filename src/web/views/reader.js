/**
 * views/reader.js — Unified reader view for CBZ/CBR comics, EPUBs, and PDFs.
 *
 * Comic reader: image-based page-at-a-time with preload, swipe, tap-zone nav.
 * Book reader:  delegates to epub.js (EPUB) or pdf.js (PDF), loaded from CDN.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';

// ---------------------------------------------------------------------------
// Module-level reader state
// ---------------------------------------------------------------------------

let readerEl = null;
let comicState = null;
let epubBook = null;
let epubRendition = null;
let pdfDoc = null;
let pdfCurrentPage = 1;
let touchStartX = 0;
let touchStartY = 0;

// Shared preferences for EPUB
let epubPrefs = {
  spread: true,
  fontSize: 85,
};

// Persistent comic-reader preferences (localStorage)
const PREFS_KEY = 'cb8.reader.prefs.v1';
const DEFAULT_PREFS = {
  zoomMode: 'fit-height',   // 'fit-width' | 'fit-height' | 'original'
  direction: 'ltr',         // 'ltr' | 'rtl'
  transition: 'slide',      // 'none' | 'slide' | 'fade'
  spread: 'single',         // 'single' | 'double'
};
function loadReaderPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_PREFS }; }
}
function saveReaderPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Wake lock (Screen Wake Lock API)
let wakeLockSentinel = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener?.('release', () => { wakeLockSentinel = null; });
  } catch { /* user may have denied, or tab not active */ }
}
function releaseWakeLock() {
  if (wakeLockSentinel) {
    try { wakeLockSentinel.release(); } catch { /* ignore */ }
    wakeLockSentinel = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && comicState && !wakeLockSentinel) {
    acquireWakeLock();
  }
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function renderReader(el, comicId, initialPage, onBack) {
  readerEl = el;
  el.innerHTML = '';

  let record;
  try {
    record = await api.fetchComic(comicId);
  } catch (err) {
    console.error('[CB8] Failed to fetch comic record:', err);
    el.innerHTML = '<div class="empty-state"><p>Failed to load item.</p></div>';
    return;
  }

  let ext = record.fileExt;
  if (!ext) {
    ext = guessExtension(record);
  }

  if (record.mediaType === 'comic') {
    await renderComicReader(el, record, initialPage, onBack);
  } else {
    if (ext === 'epub') {
      await renderEpubReader(el, record, onBack);
    } else if (ext === 'pdf') {
      await renderPdfReader(el, record, initialPage, onBack);
    } else {
      // mobi or unknown — show a friendly message
      el.innerHTML = `<div class="empty-state"><p>The .${ext || 'unknown'} format cannot be read in the browser.</p></div>`;
    }
  }
}

export function destroyReader() {
  if (readerEl?._cleanupKey) { readerEl._cleanupKey(); readerEl._cleanupKey = null; }
  if (epubRendition) { try { epubRendition.destroy(); } catch {} epubRendition = null; }
  if (epubBook) { try { epubBook.destroy(); } catch {} epubBook = null; }
  pdfDoc = null;
  comicState = null;
  if (readerEl) readerEl.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Comic reader (CBZ / CBR)
// ---------------------------------------------------------------------------

async function renderComicReader(el, record, initialPage, onBack) {
  const startPage = initialPage ?? record.lastPage ?? 0;
  const prefs = loadReaderPrefs();

  comicState = {
    id: record.id,
    pageCount: record.pageCount,
    currentPage: startPage,
    title: record.title,
    onBack,
    prefs,
  };

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

  // `stage` holds the page image(s) and receives the pinch-zoom transform.
  const stage = document.createElement('div');
  stage.className = 'comic-stage';

  const img = document.createElement('img');
  img.className = 'comic-page-img';
  img.alt = 'Comic page';
  img.id = 'comic-page-img';
  img.dataset.zoom = prefs.zoomMode;
  stage.appendChild(img);

  // Secondary image for spread (two-page) mode. Hidden by CSS when single.
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

  // direction-aware nav: in RTL, tap-prev goes forward, tap-next goes back
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

  // --- Pinch-zoom / pan state (applied as CSS transform on stage) ----------
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
    // Spread works best with fit-height; nudge the mode if user picks spread.
    if (prefs.spread === 'double' && prefs.zoomMode !== 'fit-height') {
      prefs.zoomMode = 'fit-height';
      applyZoom();
    }
  }
  spreadBtn.addEventListener('click', () => {
    prefs.spread = prefs.spread === 'double' ? 'single' : 'double';
    saveReaderPrefs(prefs);
    applySpread();
    // Re-render current page to load/clear secondary image.
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
        // Must be in fullscreen on most browsers.
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
    const prevPage = comicState.currentPage;
    comicState.currentPage = page;
    resetTransform();

    // Slide transition
    if (prefs.transition === 'slide' && animDir !== 0 && !force) {
      stage.classList.remove('slide-from-left', 'slide-from-right');
      // eslint-disable-next-line no-unused-expressions
      void stage.offsetWidth; // force reflow
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

    // Spread mode: load page+1 into the secondary image slot if available
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

    // Preload neighbours (2 ahead/back in spread mode)
    const ahead = prefs.spread === 'double' ? 2 : 1;
    for (let i = 1; i <= ahead; i++) {
      if (page + i < record.pageCount) loadPageImg(page + i).catch(() => {});
      if (page - i >= 0) loadPageImg(page - i).catch(() => {});
    }
  }

  // --- Pinch-to-zoom + pan on the stage -------------------------------------
  // Single finger: swipe (when not zoomed) or pan (when zoomed).
  // Two fingers: pinch zoom with midpoint tracking.
  let gesture = null; // { kind: 'swipe' | 'pan' | 'pinch', ... }
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
        // Tap — check for double-tap
        const now = Date.now();
        if (now - lastTap.t < 300 && Math.hypot(tch.clientX - lastTap.x, tch.clientY - lastTap.y) < 40) {
          // Double-tap: toggle 1x <-> 2x centered on tap point
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
        const pageStep = prefs.spread === 'double' ? 2 : 1;
        gotoPage(comicState.currentPage + pageDelta(swipeDir) * pageStep, { animDir: swipeDir });
      }
    }
    // Clamp scale when lifting second finger
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
  readerEl._cleanupKey = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', updateFsIcon);
    releaseWakeLock();
    if (orientSupported && orientationLocked) {
      try { screen.orientation.unlock(); } catch { /* ignore */ }
      orientationLocked = false;
    }
    api.logHistory(record.id, 'closed', comicState?.currentPage ?? null).catch(() => {});
  };

  img.addEventListener('click', () => toolbar.classList.toggle('hidden'));

  acquireWakeLock();
  api.logHistory(record.id, 'opened', startPage).catch(() => {});

  await gotoPage(startPage);
  if (startPage > 0) showToast(`Resuming from page ${startPage + 1}`);
}

// Pinned to known-good builds
const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const EPUBJS_CDN = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';

async function renderEpubReader(el, record, onBack) {
  const toolbar = buildToolbar(record.title, onBack);
  const bookContainer = document.createElement('div');
  bookContainer.className = 'book-reader';

  const epubContainer = document.createElement('div');
  epubContainer.className = 'epub-container';
  epubContainer.id = 'epub-container';
  // epub.js needs explicit dimensions to render correctly
  epubContainer.style.cssText = 'flex:1;overflow:hidden;width:100%;';

  const statusBar = document.createElement('div');
  statusBar.className = 'reader-toolbar';
  statusBar.style.cssText =
    'position:absolute;bottom:0;top:auto;left:0;right:0;' +
    'justify-content:space-between;font-size:0.8rem;color:var(--text-muted);height:44px;flex-shrink:0;padding: 0 16px;z-index:50;';

  const statusPct = document.createElement('div');
  statusPct.textContent = 'Loading…';

  const controlsRow = document.createElement('div');
  controlsRow.style.display = 'flex';
  controlsRow.style.alignItems = 'center';
  controlsRow.style.gap = '14px';

  // Font Size
  const fontRow = document.createElement('div');
  fontRow.style.display = 'flex';
  fontRow.style.alignItems = 'center';
  fontRow.style.gap = '4px';

  const btnMinus = document.createElement('button');
  btnMinus.style.cssText = 'padding:2px 8px;border:1px solid #333;border-radius:4px;color:#aaa;background:#1a1a1a;cursor:pointer;';
  btnMinus.textContent = 'A-';
  btnMinus.addEventListener('click', () => {
    epubPrefs.fontSize = Math.max(50, epubPrefs.fontSize - 10);
    if (epubRendition) epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);
  });

  const btnPlus = document.createElement('button');
  btnPlus.style.cssText = 'padding:2px 8px;border:1px solid #333;border-radius:4px;color:#aaa;background:#1a1a1a;cursor:pointer;';
  btnPlus.textContent = 'A+';
  btnPlus.addEventListener('click', () => {
    epubPrefs.fontSize = Math.min(150, epubPrefs.fontSize + 10);
    if (epubRendition) epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);
  });

  fontRow.appendChild(btnMinus);
  fontRow.appendChild(btnPlus);

  // Spread Radios
  const spreadForm = document.createElement('form');
  spreadForm.style.display = 'flex';
  spreadForm.style.gap = '10px';

  const r1 = document.createElement('label');
  r1.style.display = 'flex'; r1.style.gap = '4px'; r1.style.cursor = 'pointer'; r1.style.alignItems = 'center';
  const i1 = document.createElement('input');
  i1.type = 'radio'; i1.name = 'spread'; i1.value = 'none';
  i1.checked = !epubPrefs.spread;
  r1.append(i1, ' 1-Page');

  const r2 = document.createElement('label');
  r2.style.display = 'flex'; r2.style.gap = '4px'; r2.style.cursor = 'pointer'; r2.style.alignItems = 'center';
  const i2 = document.createElement('input');
  i2.type = 'radio'; i2.name = 'spread'; i2.value = 'auto';
  i2.checked = epubPrefs.spread;
  r2.append(i2, ' 2-Page');

  spreadForm.append(r1, r2);

  spreadForm.addEventListener('change', (e) => {
    epubPrefs.spread = (e.target.value === 'auto');
    if (epubRendition) epubRendition.spread(epubPrefs.spread ? 'auto' : 'none');
  });

  controlsRow.append(fontRow, spreadForm);
  statusBar.append(statusPct, controlsRow);

  bookContainer.appendChild(epubContainer);
  
  // Pad the book container so text doesn't hide under the absolute bottom bar
  bookContainer.style.paddingBottom = '44px';
  bookContainer.style.paddingTop = '62px'; // toolbar height (52px) + 10px breathing room

  el.appendChild(toolbar);
  el.appendChild(bookContainer);
  el.appendChild(statusBar);

  // Load dependencies (JSZip is strictly required by epub.js to parse zipped EPUBs!)
  try {
    if (!window.JSZip) {
      await loadScript(JSZIP_CDN);
    }
    await loadScript(EPUBJS_CDN);
  } catch (loadErr) {
    console.error('[CB8] CDN failed:', loadErr);
    epubContainer.innerHTML = '<div class="empty-state"><p>Could not load EPUB libraries. Check internet connection.</p></div>';
    return;
  }

  if (!window.ePub) {
    epubContainer.innerHTML = '<div class="empty-state"><p>epub.js did not initialise correctly.</p></div>';
    return;
  }

  try {
    // We must fetch the ArrayBuffer directly. Handing the URL to epub.js can result
    // in it thinking the endpoint is an unpacked directory if it lacks an .epub extension.
    const fileResp = await fetch(api.fileUrl(record.id));
    if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status} fetching EPUB`);
    const arrayBuffer = await fileResp.arrayBuffer();

    epubBook = window.ePub(arrayBuffer);

    epubRendition = epubBook.renderTo(epubContainer, {
      width: '100%',
      height: '100%',
      spread: epubPrefs.spread ? 'auto' : 'none',
      flow: 'paginated',
    });

    // Compressive dark theme rules (publishers often hardcode black text!)
    const textRule = { color: '#d8d8d8 !important', 'background-color': 'transparent !important' };
    epubRendition.themes.register('dark', {
      'html': { background: '#1a1a1a !important', 'background-color': '#1a1a1a !important' },
      'body': { 
        background: '#1a1a1a !important', 
        'background-color': '#1a1a1a !important', 
        color: '#d8d8d8 !important', 
        'font-family': 'serif',
        padding: '2rem 2% !important',
      },
      'body *': textRule,
      'p, div, span, section, article, h1, h2, h3, h4, h5, h6, li, blockquote': textRule,
      'a': { color: '#4a9eff !important', 'background-color': 'transparent !important' },
      'img': { 'max-width': '100% !important', 'height': 'auto !important' }
    });
    epubRendition.themes.select('dark');
    epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);

    const startCfi = record.lastLocation || undefined;
    try {
      await epubRendition.display(startCfi);
      if (startCfi) showToast('Resuming from saved position');
    } catch (displayErr) {
      console.warn('[CB8] Failed to resume CFI, rendering default.', displayErr);
      await epubRendition.display();
    }

    epubRendition.on('relocated', (location) => {
      if (!location?.start) return;
      const pct = Math.round((location.start.percentage ?? 0) * 100);
      statusPct.textContent = `${pct}%`;
      if (location.start.cfi) {
        api.updateLocation(record.id, location.start.cfi).catch(() => {});
      }
    });

    const onKey = (e) => {
      if (!epubRendition) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); epubRendition.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); epubRendition.prev(); }
    };
    document.addEventListener('keydown', onKey);
    readerEl._cleanupKey = () => document.removeEventListener('keydown', onKey);

    epubContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    epubContainer.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) epubRendition.next();
        else         epubRendition.prev();
      }
    }, { passive: true });

  } catch (err) {
    console.error('[CB8] EPUB render error:', err);
    epubContainer.innerHTML = `<div class="empty-state"><p>Failed to render EPUB: ${err?.message ?? err}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// PDF reader  (pdf.js loaded from CDN)
// ---------------------------------------------------------------------------

const PDFJS_CDN        = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

async function renderPdfReader(el, record, initialPage, onBack) {
  const toolbar = buildToolbar(record.title, onBack);
  const bookContainer = document.createElement('div');
  bookContainer.className = 'book-reader';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'pdf-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.id = 'pdf-canvas';

  const pageLabel = toolbar.querySelector('.toolbar-pages');
  const slider = toolbar.querySelector('.reader-page-slider');

  canvasWrap.appendChild(canvas);
  bookContainer.appendChild(canvasWrap);
  el.appendChild(toolbar);
  el.appendChild(bookContainer);

  try {
    if (!window.pdfjsLib) {
      await loadScript(PDFJS_CDN);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }

    const fileResp = await fetch(api.fileUrl(record.id));
    if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status} fetching PDF`);
    const arrayBuffer = await fileResp.arrayBuffer();

    pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfCurrentPage = Math.max(1, Math.min(pdfDoc.numPages, (initialPage ?? record.lastPage ?? 0) + 1));

    if (slider) {
      slider.min = 1;
      slider.max = pdfDoc.numPages;
      slider.addEventListener('input', () => {
        pdfCurrentPage = parseInt(slider.value, 10);
        renderPage();
      });
    }

    async function renderPage() {
      const page = await pdfDoc.getPage(pdfCurrentPage);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: dpr });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      if (pageLabel) pageLabel.textContent = `${pdfCurrentPage} / ${pdfDoc.numPages}`;
      if (slider) slider.value = pdfCurrentPage;
      api.updateProgress(record.id, pdfCurrentPage - 1).catch(() => {});
    }

    const onKey = (e) => {
      if (!pdfDoc) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        pdfCurrentPage = Math.min(pdfDoc.numPages, pdfCurrentPage + 1);
        renderPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        pdfCurrentPage = Math.max(1, pdfCurrentPage - 1);
        renderPage();
      }
    };
    document.addEventListener('keydown', onKey);
    readerEl._cleanupKey = () => document.removeEventListener('keydown', onKey);

    canvasWrap.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    canvasWrap.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        pdfCurrentPage = Math.min(pdfDoc.numPages, Math.max(1, pdfCurrentPage + (dx < 0 ? 1 : -1)));
        renderPage();
      }
    }, { passive: true });

    canvasWrap.addEventListener('click', (e) => {
      const x = e.clientX / canvasWrap.clientWidth;
      if (x < 0.33)      pdfCurrentPage = Math.max(1, pdfCurrentPage - 1);
      else if (x > 0.67) pdfCurrentPage = Math.min(pdfDoc.numPages, pdfCurrentPage + 1);
      renderPage();
    });

    await renderPage();
    if ((initialPage ?? record.lastPage ?? 0) > 0) showToast(`Resuming from page ${pdfCurrentPage}`);

  } catch (err) {
    console.error('[CB8] PDF render error:', err);
    canvasWrap.innerHTML = `<div class="empty-state"><p>Failed to render PDF: ${err?.message ?? err}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// Shared toolbar builder
// ---------------------------------------------------------------------------

function buildToolbar(title, onBack) {
  const toolbar = document.createElement('div');
  toolbar.className = 'reader-toolbar';
  toolbar.style.zIndex = '50';

  const backBtn = document.createElement('a');
  backBtn.className = 'toolbar-back';
  backBtn.href = '#/';
  backBtn.innerHTML = '← Back';
  backBtn.addEventListener('click', (e) => { e.preventDefault(); onBack(); });

  const titleEl = document.createElement('div');
  titleEl.className = 'toolbar-title';
  titleEl.textContent = title;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'reader-page-slider';
  slider.value = 0;

  const pagesEl = document.createElement('div');
  pagesEl.className = 'toolbar-pages';

  toolbar.appendChild(backBtn);
  toolbar.appendChild(titleEl);
  toolbar.appendChild(slider);
  toolbar.appendChild(pagesEl);

  return toolbar;
}

// ---------------------------------------------------------------------------
// Script loader & heuristic helpers
// ---------------------------------------------------------------------------

function guessExtension(record) {
  if (record.pageCount === 0 && !record.lastPage) return 'epub';
  if (record.lastLocation && record.lastLocation.includes('epubcfi')) return 'epub';
  if (record.pageCount > 0 && !record.lastLocation) return 'pdf';
  return 'epub'; // default for books
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Already loaded
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}
