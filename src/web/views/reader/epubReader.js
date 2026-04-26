/**
 * views/reader/epubReader.js — EPUB rendering via epub.js (loaded from CDN).
 *
 * Controls mirror the Electron EpubReaderView: font family dropdown, font
 * size dropdown (70–130%), and black/white theme toggle. Colors are applied
 * as inline !important styles on every element in the section iframe so
 * author stylesheets with class-scoped !important rules can't outrank them.
 */

import * as api from '../../api.js';
import { showToast } from '../../app.js';
import { state } from './state.js';
import { epubPrefs, saveEpubPrefs } from './prefs.js';
import { buildToolbar, loadScript } from './utils.js';
import {
  FONT_FAMILIES, FONT_SIZES,
  getThemeColors, buildEpubTheme, toEpubFontSizePercent, forceThemeOnContent,
} from '../../shared/epubTheme.js';

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const EPUBJS_CDN = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';

function reapplyTheme() {
  const rendition = state.epubRendition;
  if (!rendition) return;
  try { rendition.themes.default(buildEpubTheme(epubPrefs.themeMode, epubPrefs.fontFamily)); }
  catch (err) { console.warn('[CB8] themes.default failed:', err); }
  try { rendition.themes.font(epubPrefs.fontFamily); }
  catch (err) { console.warn('[CB8] themes.font failed:', err); }
  try { rendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize)); }
  catch (err) { console.warn('[CB8] themes.fontSize failed:', err); }
  try {
    const contentsList = rendition.getContents?.() ?? [];
    for (const c of contentsList) {
      try { forceThemeOnContent(c, epubPrefs.themeMode, epubPrefs.fontFamily); }
      catch (err) { console.warn('[CB8] forceTheme failed on view:', err); }
    }
  } catch (err) { console.warn('[CB8] getContents failed (non-fatal):', err); }
}

function makeSelect(options, value, onChange) {
  const select = document.createElement('select');
  select.style.cssText = 'padding:2px 6px;border:1px solid #333;border-radius:4px;color:#ddd;background:#1a1a1a;cursor:pointer;font-size:12px;';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = String(opt.value);
    o.textContent = opt.label;
    if (String(opt.value) === String(value)) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', (e) => onChange(e.target.value));
  return select;
}

function makeToggleButton(label, isActive, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  const apply = (active) => {
    btn.style.cssText =
      `padding:2px 10px;border-radius:4px;cursor:pointer;font-size:12px;` +
      (active
        ? 'background:#2563eb;color:#fff;border:1px solid #3b82f6;'
        : 'background:transparent;color:#aaa;border:1px solid #6b7280;');
  };
  apply(isActive);
  btn._setActive = apply;
  btn.addEventListener('click', onClick);
  return btn;
}

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
  controlsRow.style.cssText = 'display:flex;align-items:center;gap:14px;';

  // Font family dropdown
  const fontFamilyLabel = document.createElement('label');
  fontFamilyLabel.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const fontFamilySpan = document.createElement('span'); fontFamilySpan.textContent = 'Font';
  const fontFamilySelect = makeSelect(
    FONT_FAMILIES.map((f) => ({ label: f.label, value: f.value })),
    epubPrefs.fontFamily,
    (value) => {
      epubPrefs.fontFamily = value;
      saveEpubPrefs();
      reapplyTheme();
    },
  );
  fontFamilyLabel.append(fontFamilySpan, fontFamilySelect);

  // Font size dropdown (70–130%)
  const fontSizeLabel = document.createElement('label');
  fontSizeLabel.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const fontSizeSpan = document.createElement('span'); fontSizeSpan.textContent = 'Size';
  const fontSizeSelect = makeSelect(
    FONT_SIZES.map((s) => ({ label: `${s}%`, value: s })),
    epubPrefs.fontSize,
    (value) => {
      epubPrefs.fontSize = Number(value);
      saveEpubPrefs();
      reapplyTheme();
    },
  );
  fontSizeLabel.append(fontSizeSpan, fontSizeSelect);

  // Theme toggle (Black / White)
  const themeRow = document.createElement('div');
  themeRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
  const blackBtn = makeToggleButton('Black', epubPrefs.themeMode === 'black', () => {
    if (epubPrefs.themeMode === 'black') return;
    epubPrefs.themeMode = 'black'; saveEpubPrefs();
    blackBtn._setActive(true); whiteBtn._setActive(false);
    reapplyTheme();
  });
  const whiteBtn = makeToggleButton('White', epubPrefs.themeMode === 'white', () => {
    if (epubPrefs.themeMode === 'white') return;
    epubPrefs.themeMode = 'white'; saveEpubPrefs();
    whiteBtn._setActive(true); blackBtn._setActive(false);
    reapplyTheme();
  });
  themeRow.append(blackBtn, whiteBtn);

  // Spread radios (existing behavior preserved)
  const spreadForm = document.createElement('form');
  spreadForm.style.cssText = 'display:flex;gap:10px;';
  const r1 = document.createElement('label');
  r1.style.cssText = 'display:flex;gap:4px;cursor:pointer;align-items:center;';
  const i1 = document.createElement('input');
  i1.type = 'radio'; i1.name = 'spread'; i1.value = 'none'; i1.checked = !epubPrefs.spread;
  r1.append(i1, ' 1-Page');
  const r2 = document.createElement('label');
  r2.style.cssText = 'display:flex;gap:4px;cursor:pointer;align-items:center;';
  const i2 = document.createElement('input');
  i2.type = 'radio'; i2.name = 'spread'; i2.value = 'auto'; i2.checked = epubPrefs.spread;
  r2.append(i2, ' 2-Page');
  spreadForm.append(r1, r2);
  spreadForm.addEventListener('change', (e) => {
    epubPrefs.spread = (e.target.value === 'auto');
    saveEpubPrefs();
    if (state.epubRendition) state.epubRendition.spread(epubPrefs.spread ? 'auto' : 'none');
  });

  controlsRow.append(fontFamilyLabel, fontSizeLabel, themeRow, spreadForm);
  statusBar.append(statusPct, controlsRow);

  bookContainer.appendChild(epubContainer);
  bookContainer.style.paddingBottom = '44px';
  bookContainer.style.paddingTop = '62px';
  // Background of every wrapper up to the reader overlay tracks the theme so
  // the stylesheet-defined .epub-container {#1a1a1a} doesn't bleed through in
  // white mode. Set via setProperty with 'important' to win over the CSS file.
  const applyContainerBg = () => {
    const colors = getThemeColors(epubPrefs.themeMode);
    bookContainer.style.setProperty('background-color', colors.background, 'important');
    epubContainer.style.setProperty('background-color', colors.background, 'important');
    // Re-paint each already-rendered iframe element + content so switching
    // to white mode on an already-open book immediately takes effect.
    const rendition = state.epubRendition;
    if (rendition) {
      try {
        const contentsList = rendition.getContents?.() ?? [];
        for (const c of contentsList) {
          try { forceThemeOnContent(c, epubPrefs.themeMode, epubPrefs.fontFamily); } catch {}
        }
      } catch {}
      try {
        const manager = rendition.manager;
        const views = manager?.views?._views ?? [];
        for (const v of views) {
          try { v.iframe?.style.setProperty('background-color', colors.background, 'important'); } catch {}
        }
      } catch {}
    }
  };
  applyContainerBg();

  el.appendChild(toolbar);
  el.appendChild(bookContainer);
  el.appendChild(statusBar);

  try {
    if (!window.JSZip) await loadScript(JSZIP_CDN);
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

    try { state.epubRendition.themes.default(buildEpubTheme(epubPrefs.themeMode, epubPrefs.fontFamily)); }
    catch (err) { console.warn('[CB8] themes.default (initial) failed:', err); }
    try { state.epubRendition.themes.font(epubPrefs.fontFamily); } catch {}
    try { state.epubRendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize)); } catch {}

    // Per-section: force theme colors inline, wire navigation keys (the
    // iframe steals focus on click so document-level keys stop firing).
    const onKey = (e) => {
      if (!state.epubRendition) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); state.epubRendition.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); state.epubRendition.prev(); }
    };
    state.epubRendition.on('rendered', (_section, view) => {
      try {
        if (view?.contents) forceThemeOnContent(view.contents, epubPrefs.themeMode, epubPrefs.fontFamily);
        // Paint the iframe element itself so the padding epubjs adds around
        // the page column doesn't show through the grey .epub-container bg.
        try {
          if (view?.iframe) {
            view.iframe.style.setProperty('background-color', getThemeColors(epubPrefs.themeMode).background, 'important');
          }
        } catch {}
      } catch (err) { console.warn('[CB8] forceTheme (rendered) failed:', err); }
      // The section renders inside an iframe; keyboard + pointer events fired
      // within it don't bubble up to the outer document/container. Attach
      // navigation listeners directly to the iframe document so keys, taps,
      // and swipes all work once the reader has focus.
      try {
        const iframeDoc = view?.document || view?.contents?.document;
        if (!iframeDoc) return;
        iframeDoc.addEventListener('keydown', onKey);

        // Tap-on-thirds inside the iframe.
        iframeDoc.addEventListener('click', (e) => {
          if (!state.epubRendition) return;
          const w = iframeDoc.documentElement?.clientWidth || iframeDoc.body?.clientWidth || 0;
          if (!w) return;
          const x = e.clientX;
          const third = w / 3;
          if (x < third) state.epubRendition.prev();
          else if (x > third * 2) state.epubRendition.next();
        });

        // Swipe inside the iframe.
        let sx = 0;
        iframeDoc.addEventListener('touchstart', (e) => {
          sx = e.touches[0].clientX;
        }, { passive: true });
        iframeDoc.addEventListener('touchend', (e) => {
          if (!state.epubRendition) return;
          const dx = e.changedTouches[0].clientX - sx;
          if (Math.abs(dx) > 50) {
            if (dx < 0) state.epubRendition.next();
            else        state.epubRendition.prev();
          }
        }, { passive: true });
      } catch {}
    });

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

    document.addEventListener('keydown', onKey);
    state.readerEl._cleanupKey = () => document.removeEventListener('keydown', onKey);

    // Transparent overlay with left/right tap zones. Touch events inside the
    // section iframe don't bubble reliably on iPadOS Safari, so we intercept
    // taps *above* the iframe. The middle third has pointer-events:none so
    // users can still tap links / select text in the book content.
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:flex;pointer-events:none;z-index:10;';
    const leftZone = document.createElement('div');
    leftZone.style.cssText = 'width:33.333%;pointer-events:auto;cursor:pointer;';
    const midZone = document.createElement('div');
    midZone.style.cssText = 'flex:1;pointer-events:none;';
    const rightZone = document.createElement('div');
    rightZone.style.cssText = 'width:33.333%;pointer-events:auto;cursor:pointer;';
    leftZone.addEventListener('click', () => state.epubRendition?.prev());
    rightZone.addEventListener('click', () => state.epubRendition?.next());
    overlay.append(leftZone, midZone, rightZone);
    // epubContainer needs to be positioned so the absolute overlay anchors.
    if (getComputedStyle(epubContainer).position === 'static') {
      epubContainer.style.position = 'relative';
    }
    epubContainer.appendChild(overlay);

    // Horizontal swipe on the overlay zones (iPadOS: treats taps reliably).
    const attachSwipe = (zone) => {
      let sx = 0;
      zone.addEventListener('touchstart', (e) => {
        sx = e.touches[0].clientX;
      }, { passive: true });
      zone.addEventListener('touchend', (e) => {
        if (!state.epubRendition) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 40) {
          if (dx < 0) state.epubRendition.next();
          else        state.epubRendition.prev();
        }
      }, { passive: true });
    };
    attachSwipe(leftZone);
    attachSwipe(rightZone);

    // Keep the outer container background in sync with the theme toggle.
    blackBtn.addEventListener('click', applyContainerBg);
    whiteBtn.addEventListener('click', applyContainerBg);
  } catch (err) {
    console.error('[CB8] EPUB render error:', err);
    epubContainer.innerHTML = `<div class="empty-state"><p>Failed to render EPUB: ${err?.message ?? err}</p></div>`;
  }
}
