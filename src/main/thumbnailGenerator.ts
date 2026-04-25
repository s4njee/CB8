/**
 * thumbnailGenerator.ts — async thumbnail encoder. Delegates to a Thumbnailer
 * set at startup; defaults to the sharp-based encoder.
 */
import { sharpThumbnailer } from '../server/thumbnail-sharp';
import type { Thumbnailer } from '../server/config';

let activeThumbnailer: Thumbnailer = sharpThumbnailer;

export function setThumbnailer(t: Thumbnailer): void {
  activeThumbnailer = t;
}

export async function generateThumbnail(source: Buffer | null | undefined): Promise<Buffer> {
  return Promise.resolve(activeThumbnailer(source));
}
