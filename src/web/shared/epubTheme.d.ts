/**
 * Type declarations for epubTheme.js — co-located so TS importers (the
 * Electron renderer's EpubReaderView) can call into the shared module.
 */

export type ThemeMode = 'black' | 'white';

export interface FontFamilyOption {
  label: string;
  value: string;
}

export const FONT_FAMILIES: FontFamilyOption[];
export const FONT_SIZES: number[];
export const EPUB_BASE_FONT_SCALE: number;

export interface ThemeColors {
  background: string;
  text: string;
  link: string;
}

export function getThemeColors(mode: ThemeMode): ThemeColors;

export function buildEpubTheme(
  mode: ThemeMode,
  fontFamily: string,
): Record<string, Record<string, string>>;

export function toEpubFontSizePercent(fontSize: number): string;

/**
 * Force theme colors (and optional font-family) onto every element in a
 * rendered section's iframe document, inline with !important.
 *
 * The first argument is loosely typed as `{ document?: Document }` so that
 * both epubjs's `Contents` (Electron) and the dynamically-imported epubjs
 * shape (web UI) satisfy it without a hard cross-module dependency.
 */
export function forceThemeOnContent(
  contents: { document?: Document } | null | undefined,
  mode: ThemeMode,
  fontFamily?: string,
): void;
