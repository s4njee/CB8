/**
 * views/reader/prefs.js — Persistent comic-reader prefs + in-memory EPUB prefs.
 */

const PREFS_KEY = 'cb8.reader.prefs.v1';

export const DEFAULT_PREFS = {
  zoomMode: 'fit-height',   // 'fit-width' | 'fit-height' | 'original'
  direction: 'ltr',         // 'ltr' | 'rtl'
  transition: 'slide',      // 'none' | 'slide' | 'fade'
  spread: 'single',         // 'single' | 'double'
};

export function loadReaderPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function saveReaderPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const EPUB_PREFS_KEY = 'cb8.epub.prefs.v1';

const DEFAULT_EPUB_PREFS = {
  spread: true,
  fontSize: 100,
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  themeMode: 'black', // 'black' | 'white'
};

function loadEpubPrefs() {
  try {
    const raw = localStorage.getItem(EPUB_PREFS_KEY);
    if (!raw) return { ...DEFAULT_EPUB_PREFS };
    return { ...DEFAULT_EPUB_PREFS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_EPUB_PREFS }; }
}

export function saveEpubPrefs() {
  try { localStorage.setItem(EPUB_PREFS_KEY, JSON.stringify(epubPrefs)); } catch { /* ignore */ }
}

export const epubPrefs = loadEpubPrefs();
