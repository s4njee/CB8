/**
 * Drop validator for drag-and-drop file loading.
 * Accepts CBZ, CBR comic archives and PDF, EPUB, MOBI book files.
 */

const COMIC_EXTENSIONS = new Set(['cbz', 'cbr']);
const BOOK_EXTENSIONS = new Set(['pdf', 'epub', 'mobi']);

/**
 * Check if a filename is a valid comic archive file.
 * Returns true for .cbz and .cbr files (case-insensitive).
 */
export function isComicArchive(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? COMIC_EXTENSIONS.has(ext) : false;
}

/**
 * Check if a filename is a valid book file.
 * Returns true for .pdf, .epub, and .mobi files (case-insensitive).
 */
export function isBookFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? BOOK_EXTENSIONS.has(ext) : false;
}

/**
 * Check if a filename is any supported media file (comic or book).
 */
export function isSupportedFile(filename: string): boolean {
  return isComicArchive(filename) || isBookFile(filename);
}
