/**
 * Status bar formatter for displaying page position.
 * Formats as "X / Y" where X is the one-based current page and Y is the total page count.
 */

/**
 * Format the status bar text showing current page and total pages.
 * @param currentPage - Zero-based current page index
 * @param totalPages - Total number of pages
 * @returns Formatted string "X / Y"
 */
export function formatStatusBar(currentPage: number, totalPages: number): string {
  return `${currentPage + 1} / ${totalPages}`;
}
