/**
 * views/reader/epubReader.js — EPUB rendering via epub.js (loaded from CDN).
 */

import * as api from '../../api.js';
import { showToast } from '../../app.js';
import { state } from './state.js';
import { epubPrefs } from './prefs.js';
import { buildToolbar, loadScript } from './utils.js';

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const EPUBJS_CDN = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';

export async function renderEpubReader(el, record, onBack) {
  const toolbar = buildToolbar(record.title, onBack);
  const bookContainer = document.createElement('div');
  bookContainer.className = 'book-reader';

  const epubContainer = document.createElement('div');
  epubContainer.className = 'epub-container';
  epubContainer.id = 'epub-container';
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
    if (state.epubRendition) state.epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);
  });

  const btnPlus = document.createElement('button');
  btnPlus.style.cssText = 'padding:2px 8px;border:1px solid #333;border-radius:4px;color:#aaa;background:#1a1a1a;cursor:pointer;';
  btnPlus.textContent = 'A+';
  btnPlus.addEventListener('click', () => {
    epubPrefs.fontSize = Math.min(150, epubPrefs.fontSize + 10);
    if (state.epubRendition) state.epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);
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
    if (state.epubRendition) state.epubRendition.spread(epubPrefs.spread ? 'auto' : 'none');
  });

  controlsRow.append(fontRow, spreadForm);
  statusBar.append(statusPct, controlsRow);

  bookContainer.appendChild(epubContainer);
  bookContainer.style.paddingBottom = '44px';
  bookContainer.style.paddingTop = '62px';

  el.appendChild(toolbar);
  el.appendChild(bookContainer);
  el.appendChild(statusBar);

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
    const fileResp = await fetch(api.fileUrl(record.id));
    if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status} fetching EPUB`);
    const arrayBuffer = await fileResp.arrayBuffer();

    state.epubBook = window.ePub(arrayBuffer);

    state.epubRendition = state.epubBook.renderTo(epubContainer, {
      width: '100%',
      height: '100%',
      spread: epubPrefs.spread ? 'auto' : 'none',
      flow: 'paginated',
    });

    const textRule = { color: '#d8d8d8 !important', 'background-color': 'transparent !important' };
    state.epubRendition.themes.register('dark', {
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
    state.epubRendition.themes.select('dark');
    state.epubRendition.themes.fontSize(`${epubPrefs.fontSize}%`);

    const startCfi = record.lastLocation || undefined;
    try {
      await state.epubRendition.display(startCfi);
      if (startCfi) showToast('Resuming from saved position');
    } catch (displayErr) {
      console.warn('[CB8] Failed to resume CFI, rendering default.', displayErr);
      await state.epubRendition.display();
    }

    state.epubRendition.on('relocated', (location) => {
      if (!location?.start) return;
      const pct = Math.round((location.start.percentage ?? 0) * 100);
      statusPct.textContent = `${pct}%`;
      if (location.start.cfi) {
        api.updateLocation(record.id, location.start.cfi).catch(() => {});
      }
    });

    const onKey = (e) => {
      if (!state.epubRendition) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); state.epubRendition.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); state.epubRendition.prev(); }
    };
    document.addEventListener('keydown', onKey);
    state.readerEl._cleanupKey = () => document.removeEventListener('keydown', onKey);

    epubContainer.addEventListener('touchstart', (e) => {
      state.touchStartX = e.touches[0].clientX;
    }, { passive: true });
    epubContainer.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - state.touchStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) state.epubRendition.next();
        else         state.epubRendition.prev();
      }
    }, { passive: true });

  } catch (err) {
    console.error('[CB8] EPUB render error:', err);
    epubContainer.innerHTML = `<div class="empty-state"><p>Failed to render EPUB: ${err?.message ?? err}</p></div>`;
  }
}
