import * as ArchiveLoader from '../archiveLoader';
import type { ArchiveHandle } from '../archiveLoader';

const CACHE_CAPACITY = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  handle: Promise<ArchiveHandle>;
  filePath: string;
  lastUsed: number;
}

const handleCache = new Map<number, CacheEntry>();

/**
 * The cache stores the open *promise* (not the resolved handle) so that two
 * concurrent requests for the same uncached comic share a single open() call.
 * Storing the resolved handle would let both callers invoke ArchiveLoader.open
 * in parallel; one handle would end up in the map, the other would leak.
 */
export async function getArchiveHandle(comicId: number, filePath: string): Promise<ArchiveHandle> {
  const now = Date.now();

  // Evict expired entries
  for (const [id, entry] of handleCache) {
    if (now - entry.lastUsed > CACHE_TTL_MS) {
      entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
      handleCache.delete(id);
    }
  }

  // Evict oldest entry if at capacity
  if (!handleCache.has(comicId) && handleCache.size >= CACHE_CAPACITY) {
    let oldestId = -1;
    let oldestTime = Infinity;
    for (const [id, entry] of handleCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId !== -1) {
      const evicted = handleCache.get(oldestId)!;
      evicted.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
      handleCache.delete(oldestId);
    }
  }

  const existing = handleCache.get(comicId);
  if (existing) {
    existing.lastUsed = now;
    return existing.handle;
  }

  const handlePromise = ArchiveLoader.open(filePath);
  handleCache.set(comicId, { handle: handlePromise, filePath, lastUsed: now });
  handlePromise.catch(() => {
    const entry = handleCache.get(comicId);
    if (entry && entry.handle === handlePromise) handleCache.delete(comicId);
  });
  return handlePromise;
}

export async function evictFromCache(comicId: number): Promise<void> {
  const entry = handleCache.get(comicId);
  if (!entry) return;
  handleCache.delete(comicId);
  await entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
}

export async function closeAllHandles(): Promise<void> {
  const entries = Array.from(handleCache.values());
  handleCache.clear();
  for (const entry of entries) {
    await entry.handle.then((h) => ArchiveLoader.close(h)).catch(() => {});
  }
}
