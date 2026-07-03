import { create } from 'zustand';

/**
 * @module
 * Global UI State (Zustand)
 *
 * Architecture overview for Junior Devs:
 * Holds app-wide UI state that must persist as the user navigates between pages
 * but isn't server data — the active media-type/sort/read-status filters, the
 * search box text, which side tab panel is open, and the color theme. Server data
 * does NOT belong here; that lives in React Query. Use this only for view state.
 */

export type MediaTypeFilter = '' | 'comic' | 'book';
export type SortByFilter = 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead';
export type ReadStatusFilter = '' | 'unread' | 'in-progress' | 'completed';
export type TabPanelType = null | 'browse';
export type ThemeType = 'red' | 'blue' | 'green' | 'purple' | 'orange' | 'teal';

interface UiState {
  mediaType: MediaTypeFilter;
  sortBy: SortByFilter;
  search: string;
  fileExt: string;
  readStatus: ReadStatusFilter;
  favoritesOnly: boolean;
  tabPanel: TabPanelType;
  theme: ThemeType;
  setMediaType: (type: MediaTypeFilter) => void;
  setSortBy: (sortBy: SortByFilter) => void;
  setSearch: (search: string) => void;
  setFileExt: (fileExt: string) => void;
  setReadStatus: (status: ReadStatusFilter) => void;
  setFavoritesOnly: (favOnly: boolean) => void;
  setTabPanel: (panel: TabPanelType) => void;
  setTheme: (theme: ThemeType) => void;
  resetFilters: () => void;
}

const THEME_KEY = 'cb8.theme';
const DEFAULT_THEME: ThemeType = 'red';

function getInitialTheme(): ThemeType {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    const allowed: ThemeType[] = ['red', 'blue', 'green', 'purple', 'orange', 'teal'];
    if (stored && allowed.includes(stored as ThemeType)) {
      // Ensure attribute is set on mount
      document.documentElement.setAttribute('data-theme', stored);
      return stored as ThemeType;
    }
  } catch {}
  document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
  return DEFAULT_THEME;
}

export const useUiStore = create<UiState>((set) => ({
  mediaType: '',
  sortBy: 'title',
  search: '',
  fileExt: '',
  readStatus: '',
  favoritesOnly: false,
  tabPanel: null,
  theme: getInitialTheme(),

  setMediaType: (mediaType) => set({ mediaType }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSearch: (search) => set({ search }),
  setFileExt: (fileExt) => set({ fileExt }),
  setReadStatus: (readStatus) => set({ readStatus }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
  setTabPanel: (tabPanel) => set({ tabPanel }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  resetFilters: () =>
    set({
      mediaType: '',
      sortBy: 'title',
      search: '',
      fileExt: '',
      readStatus: '',
      favoritesOnly: false,
    }),
}));
