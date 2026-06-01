import { create } from 'zustand';

export interface ReaderPrefs {
  zoomMode: 'fit-height' | 'fit-width' | 'original';
  direction: 'ltr' | 'rtl';
  transition: 'none' | 'slide' | 'fade';
  spread: 'single' | 'double';
}

export interface EpubPrefs {
  spread: boolean;
  fontSize: number;
  fontFamily: string;
  themeMode: 'black' | 'white';
  googleFont: string;
}

interface ReaderState {
  prefs: ReaderPrefs;
  epubPrefs: EpubPrefs;
  currentPage: number;
  setPrefs: (prefs: Partial<ReaderPrefs>) => void;
  setEpubPrefs: (epubPrefs: Partial<EpubPrefs>) => void;
  setCurrentPage: (page: number) => void;
  resetReader: () => void;
}

const PREFS_KEY = 'cb8.reader.prefs.v2';
const EPUB_PREFS_KEY = 'cb8.epub.prefs.v1';

const DEFAULT_PREFS: ReaderPrefs = {
  zoomMode: 'fit-height',
  direction: 'ltr',
  transition: 'slide',
  spread: 'double',
};

const DEFAULT_EPUB_PREFS: EpubPrefs = {
  spread: true,
  fontSize: 100,
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  themeMode: 'black',
  googleFont: '',
};

function loadPrefs<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  prefs: loadPrefs<ReaderPrefs>(PREFS_KEY, DEFAULT_PREFS),
  epubPrefs: loadPrefs<EpubPrefs>(EPUB_PREFS_KEY, DEFAULT_EPUB_PREFS),
  currentPage: 1,

  setPrefs: (newPrefs) => {
    set((state) => {
      const updated = { ...state.prefs, ...newPrefs };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
      } catch {}
      return { prefs: updated };
    });
  },

  setEpubPrefs: (newEpubPrefs) => {
    set((state) => {
      const updated = { ...state.epubPrefs, ...newEpubPrefs };
      try {
        localStorage.setItem(EPUB_PREFS_KEY, JSON.stringify(updated));
      } catch {}
      return { epubPrefs: updated };
    });
  },

  setCurrentPage: (currentPage) => set({ currentPage }),
  resetReader: () => set({ currentPage: 1 }),
}));
