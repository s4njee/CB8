import type { ThemeType } from '@/store/uiStore';

/**
 * @module
 * Settings Panel Constants & Validation Helpers
 *
 * Architecture overview for Junior Devs:
 * The settings panel offers theme swatches and a few numeric inputs (auto-rescan
 * interval, web-server port) plus some confirmation messages. The static option
 * list, input validation, and message wording are factored out here so the React
 * component stays declarative and the parsing/range rules can be unit tested.
 */

/** A selectable theme option: its id, display label, and accent colour. */
export type ThemeSwatch = { id: ThemeType; label: string; color: string };

/** The accent themes offered in the settings panel. */
export const THEME_LIST: ThemeSwatch[] = [
  { id: 'red', label: 'Red', color: '#e15b47' },
  { id: 'blue', label: 'Blue', color: '#5b93c7' },
  { id: 'green', label: 'Green', color: '#6fa368' },
  { id: 'purple', label: 'Purple', color: '#9b7bc0' },
  { id: 'orange', label: 'Orange', color: '#d98a4b' },
  { id: 'teal', label: 'Teal', color: '#5ba79c' },
];

/**
 * Parse and validate the auto-rescan interval input.
 * @param raw The raw text from the input field.
 * @returns The number of minutes (0 disables), or `null` if invalid/negative.
 */
export function parseAutoRescanMinutes(raw: string): number | null {
  const minutes = parseInt(raw, 10);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

/**
 * Build the confirmation message after saving the auto-rescan interval.
 * @param minutes The saved interval in minutes (0 means disabled).
 * @returns A message describing the rescan cadence, pluralised correctly.
 */
export function autoRescanSavedMessage(minutes: number): string {
  return minutes > 0
    ? `Folders will rescan every ${minutes} minute${minutes === 1 ? '' : 's'}.`
    : 'Auto-rescan disabled.';
}

/**
 * Parse and validate the web-server port input.
 * Accepts only non-privileged ports in the 1024–65535 range.
 * @param raw The raw text from the input field.
 * @returns The port number, or `null` if out of range/invalid.
 */
export function parseWebServerPort(raw: string): number | null {
  const port = parseInt(raw, 10);
  return Number.isFinite(port) && port >= 1024 && port <= 65535 ? port : null;
}

/**
 * Build the confirmation message after clearing the library.
 * @param removedComics How many items were removed.
 * @returns A message with a locale-formatted, correctly pluralised count.
 */
export function clearLibraryRemovedMessage(removedComics: number): string {
  return `Library cleared (${removedComics.toLocaleString()} item${removedComics === 1 ? '' : 's'} removed).`;
}
