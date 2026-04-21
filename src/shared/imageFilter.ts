/**
 * Image extension filter for comic book pages.
 * Returns true if the filename has a recognized image extension.
 */

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'jxl',
  'avif',
]);

/**
 * Check if a filename has a recognized image extension.
 * Case-insensitive comparison.
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}
