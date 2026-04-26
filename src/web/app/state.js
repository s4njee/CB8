/**
 * app/state.js — Shared mutable UI state for the web shell.
 *
 * Lives as a single object so every module reads/writes the same
 * instance. Views pick what they need via getState().
 */

export const state = {
  mediaType: '',       // '' | 'comic' | 'book'
  sortBy:    'dateAdded',  // 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead'
  search:    '',
  fileExt:   '',       // '' | 'epub' | 'pdf' | 'cbz' | 'cbr' | 'mobi'
  readStatus: '',      // '' | 'unread' | 'in-progress' | 'completed'
  favoritesOnly: false,
  route:     null,
  tabPanel:  null,     // null | 'collections' | 'folders' | 'tags'
};

// Cached sidebar data (also used to populate the mobile Tab_Panel).
export const sidebarCache = {
  libraries: [],
  folders: [],
  tags: [],
};

export const SORT_LABELS = {
  title: 'Title',
  dateAdded: 'Date added',
  fileSize: 'File size',
  pageCount: 'Pages',
  lastRead: 'Recently Read',
};

export function getState() {
  return state;
}
