// Sets WITHOUT leading dots (matches filename.split('.').pop() pattern)
export const COMIC_EXTENSIONS = new Set(['cbz', 'cbr']);
export const BOOK_EXTENSIONS = new Set(['pdf', 'epub', 'mobi']);
export const ALL_EXTENSIONS = new Set([...COMIC_EXTENSIONS, ...BOOK_EXTENSIONS]);

export const ALL_EXTENSIONS_ARRAY = Array.from(ALL_EXTENSIONS);

export const EXTENSION_LABELS: Record<string, string> = {
  cbz: 'Comic Archive (CBZ)',
  cbr: 'Comic Archive (CBR)',
  pdf: 'PDF Document',
  epub: 'EPUB Book',
  mobi: 'MOBI Book',
};

export function detectMediaType(filename: string): 'comic' | 'book' | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (COMIC_EXTENSIONS.has(ext)) return 'comic';
  if (BOOK_EXTENSIONS.has(ext)) return 'book';
  return null;
}

export function isSupportedFile(filename: string): boolean {
  return detectMediaType(filename) !== null;
}

export function hasSupported(filenames: string[]): boolean {
  return filenames.some(isSupportedFile);
}
