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

function effectiveFontFamily() {
  return epubPrefs.googleFont
    ? `'${epubPrefs.googleFont}', serif`
    : epubPrefs.fontFamily;
}

function googleFontUrl(name) {
  return `https://fonts.googleapis.com/css2?family=${name.trim().replace(/ /g, '+')}&display=swap`;
}

function injectGoogleFont(doc, name) {
  if (!doc || !name) return;
  const existing = doc.getElementById('cb8-google-font');
  if (existing) {
    if (existing.dataset.font === name) return;
    existing.remove();
  }
  const link = doc.createElement('link');
  link.id = 'cb8-google-font';
  link.rel = 'stylesheet';
  link.href = googleFontUrl(name);
  link.dataset.font = name;
  (doc.head || doc.documentElement)?.appendChild(link);
}

function preloadGoogleFont(name, onReady) {
  const id = 'cb8-gf-preload';
  const existing = document.getElementById(id);
  if (existing?.dataset.font === name) {
    // Already loaded or loading; if sheet is present the font is ready
    if (existing.sheet) onReady();
    else existing.addEventListener('load', onReady, { once: true });
    return;
  }
  existing?.remove();
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = googleFontUrl(name);
  link.dataset.font = name;
  link.addEventListener('load', onReady, { once: true });
  document.head.appendChild(link);
}

function reapplyTheme() {
  const rendition = state.epubRendition;
  if (!rendition) return;
  const ff = effectiveFontFamily();
  try { rendition.themes.default(buildEpubTheme(epubPrefs.themeMode, ff)); }
  catch (err) { console.warn('[CB8] themes.default failed:', err); }
  try { rendition.themes.font(ff); }
  catch (err) { console.warn('[CB8] themes.font failed:', err); }
  try { rendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize)); }
  catch (err) { console.warn('[CB8] themes.fontSize failed:', err); }
  try {
    const contentsList = rendition.getContents?.() ?? [];
    for (const c of contentsList) {
      try {
        if (epubPrefs.googleFont) injectGoogleFont(c.document, epubPrefs.googleFont);
        forceThemeOnContent(c, epubPrefs.themeMode, ff);
      }
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

/**
 * Reliable tap binding for reader controls stacked above the section iframe.
 * iOS Safari frequently drops the synthesized `click` on elements layered
 * over an <iframe>, so detect the tap from touch events directly (ignoring
 * scroll drags) and keep `click` for mouse/desktop input. The `touchend`
 * preventDefault suppresses the duplicate compatibility click.
 */
function bindTap(el, handler) {
  let live = false;
  let sx = 0;
  let sy = 0;
  el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    live = true; sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) live = false;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!live) return;
    live = false;
    e.preventDefault();
    handler();
  });
  el.addEventListener('click', handler);
}

export async function renderEpubReader(el, record, onBack) {
  const toolbar = buildToolbar(record.title, onBack);
  const slider = toolbar.querySelector('.reader-page-slider');
  if (slider) { slider.min = 0; slider.max = 100; slider.value = 0; }
  const bookContainer = document.createElement('div');
  bookContainer.className = 'book-reader';

  const epubContainer = document.createElement('div');
  epubContainer.className = 'epub-container';
  epubContainer.id = 'epub-container';
  epubContainer.style.cssText = 'flex:1;overflow:hidden;width:100%;';

  // --- Table of contents sidebar -------------------------------------------
  const tocToggleBtn = document.createElement('button');
  tocToggleBtn.type = 'button';
  tocToggleBtn.className = 'epub-toc-toggle';
  tocToggleBtn.title = 'Table of contents';
  tocToggleBtn.setAttribute('aria-label', 'Table of contents');
  tocToggleBtn.textContent = '☰';
  tocToggleBtn.style.display = 'none'; // revealed once we know the book has a TOC
  toolbar.querySelector('.toolbar-back')?.after(tocToggleBtn);

  const tocBackdrop = document.createElement('div');
  tocBackdrop.className = 'epub-toc-backdrop';

  const tocSidebar = document.createElement('aside');
  tocSidebar.className = 'epub-toc-sidebar';
  const tocHeaderRow = document.createElement('div');
  tocHeaderRow.className = 'epub-toc-header';
  const tocHeading = document.createElement('span');
  tocHeading.textContent = 'Contents';
  const tocCloseBtn = document.createElement('button');
  tocCloseBtn.type = 'button';
  tocCloseBtn.className = 'epub-toc-close';
  tocCloseBtn.setAttribute('aria-label', 'Close contents');
  tocCloseBtn.textContent = '✕';
  tocHeaderRow.append(tocHeading, tocCloseBtn);
  const tocListEl = document.createElement('nav');
  tocListEl.className = 'epub-toc-list';
  tocSidebar.append(tocHeaderRow, tocListEl);

  const setTocOpen = (open) => {
    tocSidebar.classList.toggle('open', open);
    tocBackdrop.classList.toggle('open', open);
    tocToggleBtn.classList.toggle('active', open);
  };
  tocToggleBtn.addEventListener('click', () => setTocOpen(!tocSidebar.classList.contains('open')));
  bindTap(tocCloseBtn, () => setTocOpen(false));
  bindTap(tocBackdrop, () => setTocOpen(false));

  // Resolve a TOC href to a real spine section. epub.js stores TOC hrefs
  // verbatim from the nav document's <a href>, and display() only matches an
  // exact spine href — these diverge when the nav doc and the OPF live in
  // different folders. Fall back to matching on the file name.
  const resolveTocHref = (href) => {
    const book = state.epubBook;
    const path = (href || '').split('#')[0];
    if (!path || !book?.spine) return null;
    const items = book.spine.spineItems || [];
    const tail = (s) => {
      const last = (s || '').split('#')[0].split('/').pop() || '';
      try { return decodeURIComponent(last); } catch { return last; }
    };
    const want = tail(path);
    if (!want) return null;
    const hit = items.find((it) => tail(it.href) === want);
    return hit ? hit.href : null;
  };

  // Jump to a TOC target. Try the raw href first, then a filename-resolved
  // spine href if epub.js can't match it.
  const navigateToc = (href) => {
    const rendition = state.epubRendition;
    if (!href || !rendition) return;
    setTocOpen(false);
    const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
    Promise.resolve(rendition.display(href))
      .catch(() => {
        const resolved = resolveTocHref(href);
        if (resolved) return rendition.display(resolved + hash);
        throw new Error('no matching spine section');
      })
      .catch((e) => {
        console.warn('[CB8] TOC navigation failed:', href, e);
        showToast('Could not open that section');
      });
  };

  // Render nested TOC entries; subitems indent one step further.
  const buildTocEntries = (items, container, depth) => {
    for (const item of items) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'epub-toc-entry';
      entry.style.paddingLeft = `${14 + depth * 14}px`;
      entry.textContent = (item.label || '').trim() || 'Untitled';
      entry.dataset.href = item.href || '';
      bindTap(entry, () => navigateToc(item.href));
      container.appendChild(entry);
      if (item.subitems?.length) buildTocEntries(item.subitems, container, depth + 1);
    }
  };

  // Mark the entry for the section currently on screen.
  const highlightCurrentToc = (href) => {
    if (!href) return;
    const base = href.split('#')[0];
    let match = null;
    for (const entry of tocListEl.querySelectorAll('.epub-toc-entry')) {
      entry.classList.remove('current');
      const h = (entry.dataset.href || '').split('#')[0];
      if (!match && h && (h === base || base.endsWith('/' + h) || h.endsWith('/' + base))) {
        match = entry;
      }
    }
    match?.classList.add('current');
  };

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
    if (state.epubRendition) {
      state.epubRendition.spread(epubPrefs.spread ? 'auto' : 'none');
      reapplyTheme();
    }
  });

  // Google Font input with custom scrollable dropdown
  const GOOGLE_FONTS = [
    'Bitter', 'Cormorant Garamond', 'Crimson Pro', 'Crimson Text',
    'EB Garamond', 'Fira Code', 'Fira Sans', 'Frank Ruhl Libre',
    'Inter', 'JetBrains Mono', 'Josefin Sans', 'Lato',
    'Libre Baskerville', 'Libre Franklin', 'Lora',
    'Merriweather', 'Montserrat', 'Noto Sans', 'Noto Serif',
    'Nunito', 'Open Sans', 'Playfair Display', 'PT Sans', 'PT Serif',
    'Raleway', 'Roboto', 'Roboto Mono', 'Roboto Slab',
    'Source Code Pro', 'Source Sans 3', 'Source Serif 4',
    'Spectral', 'Ubuntu', 'Vollkorn', 'Work Sans',
  ];

  const googleFontLabel = document.createElement('label');
  googleFontLabel.style.cssText = 'display:flex;align-items:center;gap:6px;position:relative;';
  const googleFontSpan = document.createElement('span'); googleFontSpan.textContent = 'Google Font';

  const googleFontInput = document.createElement('input');
  googleFontInput.type = 'text';
  googleFontInput.placeholder = 'e.g. Merriweather';
  googleFontInput.value = epubPrefs.googleFont || '';
  googleFontInput.style.cssText =
    'padding:2px 6px;border:1px solid #333;border-radius:4px;color:#ddd;background:#1a1a1a;' +
    'font-size:12px;width:130px;';

  const fontDropdown = document.createElement('div');
  fontDropdown.style.cssText =
    'position:fixed;z-index:9999;background:#1a1a1a;border:1px solid #444;border-radius:6px;' +
    'max-height:220px;overflow-y:auto;min-width:160px;display:none;box-shadow:0 4px 16px rgba(0,0,0,.5);';

  let activeIdx = -1;

  const renderDropdown = (filter) => {
    const q = filter.toLowerCase();
    const matches = q ? GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(q)) : GOOGLE_FONTS;
    fontDropdown.innerHTML = '';
    activeIdx = -1;
    matches.forEach((name, i) => {
      const item = document.createElement('div');
      item.textContent = name;
      item.dataset.font = name;
      item.style.cssText =
        'padding:6px 12px;cursor:pointer;font-size:12px;color:#ddd;white-space:nowrap;';
      item.addEventListener('mouseenter', () => {
        fontDropdown.querySelectorAll('[data-font]').forEach((el) => el.style.background = '');
        item.style.background = '#2a2a2a';
        activeIdx = i;
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectFont(name);
      });
      fontDropdown.appendChild(item);
    });
    return matches;
  };

  const openDropdown = () => {
    const rect = googleFontInput.getBoundingClientRect();
    fontDropdown.style.left = `${rect.left}px`;
    fontDropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    fontDropdown.style.display = 'block';
    renderDropdown(googleFontInput.value);
  };

  const closeDropdown = () => { fontDropdown.style.display = 'none'; };

  const applyAndPreload = (name) => {
    epubPrefs.googleFont = name;
    saveEpubPrefs();
    reapplyTheme();
    if (name) preloadGoogleFont(name, reapplyTheme);
  };

  const selectFont = (name) => {
    googleFontInput.value = name;
    applyAndPreload(name);
    closeDropdown();
  };

  const applyGoogleFont = () => {
    const name = googleFontInput.value.trim();
    if (name !== epubPrefs.googleFont) applyAndPreload(name);
    closeDropdown();
  };

  googleFontInput.addEventListener('focus', openDropdown);
  googleFontInput.addEventListener('input', () => renderDropdown(googleFontInput.value));
  googleFontInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyGoogleFont(); }
    else if (e.key === 'Escape') { closeDropdown(); googleFontInput.blur(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = fontDropdown.querySelectorAll('[data-font]');
      if (!items.length) return;
      items[activeIdx]?.style && (items[activeIdx].style.background = '');
      activeIdx = e.key === 'ArrowDown'
        ? Math.min(activeIdx + 1, items.length - 1)
        : Math.max(activeIdx - 1, 0);
      const active = items[activeIdx];
      if (active) {
        active.style.background = '#2a2a2a';
        active.scrollIntoView({ block: 'nearest' });
        googleFontInput.value = active.dataset.font;
      }
    }
  });
  googleFontInput.addEventListener('blur', () => setTimeout(applyGoogleFont, 150));

  document.body.appendChild(fontDropdown);
  googleFontLabel.append(googleFontSpan, googleFontInput);

  controlsRow.append(fontFamilyLabel, fontSizeLabel, googleFontLabel, themeRow, spreadForm);
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

    try { state.epubRendition.themes.default(buildEpubTheme(epubPrefs.themeMode, effectiveFontFamily())); }
    catch (err) { console.warn('[CB8] themes.default (initial) failed:', err); }
    try { state.epubRendition.themes.font(effectiveFontFamily()); } catch {}
    try { state.epubRendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize)); } catch {}

    // Per-section: force theme colors inline, wire navigation keys (the
    // iframe steals focus on click so document-level keys stop firing).
    const onKey = (e) => {
      if (!state.epubRendition) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape' && tocSidebar.classList.contains('open')) {
        e.preventDefault(); setTocOpen(false); return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); state.epubRendition.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); state.epubRendition.prev(); }
    };
    state.epubRendition.on('rendered', (_section, view) => {
      try {
        const ff = effectiveFontFamily();
        if (view?.contents) {
          if (epubPrefs.googleFont) injectGoogleFont(view.contents.document, epubPrefs.googleFont);
          forceThemeOnContent(view.contents, epubPrefs.themeMode, ff);
        }
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
          // A click on a link / control belongs to the content; epub.js wires
          // each <a> with its own navigation handler — don't also turn the page.
          if (e.target?.closest?.('a[href], button, input, select, textarea, label')) return;
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
      if (slider) slider.value = pct;
      highlightCurrentToc(location.start.href);
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
    // The tap-zone overlay sits above the section iframe, so taps in the side
    // thirds never reach the content's links. Hit-test the iframe at the tap
    // point: if a link is there, click it (epub.js gave every <a> an onclick
    // that performs the navigation); otherwise turn the page.
    const linkUnderTap = (clientX, clientY) => {
      const rendition = state.epubRendition;
      if (!rendition) return null;
      let contentsList = [];
      try { contentsList = rendition.getContents?.() ?? []; } catch { return null; }
      for (const c of contentsList) {
        const iframe = c?.window?.frameElement;
        const doc = c?.document;
        if (!iframe || !doc) continue;
        const r = iframe.getBoundingClientRect();
        if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) continue;
        const hit = doc.elementFromPoint(clientX - r.left, clientY - r.top);
        const link = hit?.closest?.('a[href]');
        if (link) return link;
      }
      return null;
    };
    const zoneTap = (e, turnPage) => {
      const link = linkUnderTap(e.clientX, e.clientY);
      if (link) { link.click(); return; }
      turnPage();
    };
    leftZone.addEventListener('click', (e) => zoneTap(e, () => state.epubRendition?.prev()));
    rightZone.addEventListener('click', (e) => zoneTap(e, () => state.epubRendition?.next()));
    overlay.append(leftZone, midZone, rightZone);
    // epubContainer needs to be positioned so the absolute overlay anchors.
    if (getComputedStyle(epubContainer).position === 'static') {
      epubContainer.style.position = 'relative';
    }
    epubContainer.appendChild(overlay);
    epubContainer.append(tocBackdrop, tocSidebar);

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

    // Populate the table of contents from the EPUB navigation document.
    try {
      const nav = await state.epubBook.loaded.navigation;
      const toc = nav?.toc ?? [];
      if (toc.length) {
        buildTocEntries(toc, tocListEl, 0);
        tocToggleBtn.style.display = '';
        const here = state.epubRendition?.currentLocation?.()?.start?.href;
        if (here) highlightCurrentToc(here);
      }
    } catch (navErr) {
      console.warn('[CB8] EPUB navigation unavailable:', navErr);
    }
  } catch (err) {
    console.error('[CB8] EPUB render error:', err);
    epubContainer.innerHTML = `<div class="empty-state"><p>Failed to render EPUB: ${err?.message ?? err}</p></div>`;
  }
}
