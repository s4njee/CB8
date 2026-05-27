/**
 * app/theme.js — accent-color theme selection.
 *
 * Theme palettes are defined in style.css under `:root[data-theme="..."]`.
 * This module is the JS side: it persists the user's choice in localStorage
 * and toggles `data-theme` on `<html>`.
 *
 * An inline script in index.html applies the stored theme before the
 * stylesheet loads to avoid a flash of the default red. This module is
 * loaded later (via the SPA module bundle) and handles updates from the
 * settings picker.
 */

export const THEMES = [
  { id: 'red',    label: 'Red',    color: '#ef4d4d' },
  { id: 'blue',   label: 'Blue',   color: '#4a9eff' },
  { id: 'green',  label: 'Green',  color: '#34c759' },
  { id: 'purple', label: 'Purple', color: '#a374ff' },
  { id: 'orange', label: 'Orange', color: '#f59342' },
  { id: 'teal',   label: 'Teal',   color: '#2dd4bf' },
];

export const DEFAULT_THEME = 'red';
const STORAGE_KEY = 'cb8.theme';

function isValidTheme(id) {
  return THEMES.some((t) => t.id === id);
}

export function getTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isValidTheme(v)) return v;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_THEME;
}

export function setTheme(name) {
  if (!isValidTheme(name)) return;
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', name);
}

/** Re-apply the persisted theme. Safe to call after the inline boot script. */
export function applyStoredTheme() {
  setTheme(getTheme());
}
