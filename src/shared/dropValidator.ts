/**
 * Drop validator for drag-and-drop file loading.
 * Accepts only CBZ and CBR comic archive files.
 */

const COMIC_EXTENSIONS = new Set(['cbz', 'cbr']);

/**
 * Check if a filename is a valid comic archive file.
 * Returns true for .cbz and .cbr files (case-insensitive).
 */
export function isComicArchive(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? COMIC_EXTENSIONS.has(ext) : false;
}
