/**
 * imageResizer.ts — resize comic page/thumbnail images on demand via sharp.
 *
 * Results are cached on disk under <userData>/image-cache/ keyed by
 * (comicId, page, width). Uses the `sharp` library for efficient resizing.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { app } from 'electron';

let sharp: typeof import('sharp') | null = null;
function getSharp(): typeof import('sharp') {
  if (!sharp) {
    // Lazy require so the module doesn't explode at import time in envs
    // where the native binding hasn't been built.
    sharp = require('sharp');
  }
  return sharp!;
}

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 4000;

export function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return MIN_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(w)));
}

function cacheRoot(): string {
  try {
    return path.join(app.getPath('userData'), 'image-cache');
  } catch {
    // Fallback during tests when app is unavailable
    return path.join(require('node:os').tmpdir(), 'cb8-image-cache');
  }
}

function cachePath(comicId: number, page: number, width: number, ext: string): string {
  const root = cacheRoot();
  const hash = crypto.createHash('sha1').update(`${comicId}:${page}:${width}`).digest('hex').slice(0, 16);
  return path.join(root, `${comicId}`, `${hash}-${width}${ext}`);
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function resizeImage(input: Buffer, width: number): Promise<Buffer> {
  const w = clampWidth(width);
  return await getSharp()(input).resize({ width: w, withoutEnlargement: true }).toBuffer();
}

export async function getCachedOrResize(
  comicId: number,
  page: number,
  width: number,
  getOriginal: () => Promise<{ buffer: Buffer; ext: string }>,
): Promise<{ buffer: Buffer; ext: string }> {
  const w = clampWidth(width);
  // Check cache (we try a few common extensions)
  for (const ext of ['.webp', '.jpg', '.png']) {
    const p = cachePath(comicId, page, w, ext);
    try {
      const buf = await fsp.readFile(p);
      return { buffer: buf, ext: ext.slice(1) };
    } catch { /* miss */ }
  }
  const orig = await getOriginal();
  const resized = await resizeImage(orig.buffer, w);
  const outExt = '.webp';
  const outPath = cachePath(comicId, page, w, outExt);
  try {
    await ensureDir(path.dirname(outPath));
    // Re-encode to webp for space if not already; sharp default preserves format.
    // We used resize without setting format, so use webp explicitly.
    const webpBuf = await getSharp()(orig.buffer).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await fsp.writeFile(outPath, webpBuf);
    return { buffer: webpBuf, ext: 'webp' };
  } catch {
    // If caching failed, still return the resized buffer
    return { buffer: resized, ext: orig.ext };
  }
}

export function invalidateCacheForComic(comicId: number): void {
  const dir = path.join(cacheRoot(), String(comicId));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
