import { useRef, useCallback } from 'react';
import { LruByCount } from '../../../../shared/lru';
import { archivePage, updateReadingProgress } from '../../../ipcClient';

const PAGE_CACHE_MAX = 10;
const PREFETCH_AHEAD = 3;

interface Params {
  /** Total pages in the currently-open archive (used to clamp prefetch). */
  pageCount: number;
  /** Comic id whose progress to write through on each load (or null). */
  currentComicIdRef: React.MutableRefObject<number | null>;
}

interface ReaderPageCacheApi {
  /** Synchronously read a cached page (bumping it to MRU). */
  cacheGet: (index: number) => string | undefined;
  /**
   * Fetch + cache a page's blob URL. Returns null on archive errors.
   * Uses the cache when possible.
   */
  fetchPageData: (pageIndex: number) => Promise<string | null>;
  /**
   * Load + display a page: fast cache path with progress write-through and
   * neighbor prefetch on hit, slower archive read on miss.
   *
   * The display side-effects (`setImageSrc`, `setCurrentPage`, `setLoading`)
   * are passed in so the hook stays decoupled from the host's render state.
   */
  loadPage: (pageIndex: number, setters: PageSetters) => Promise<void>;
  /** Drop the cache + revoke any outstanding blob URLs. */
  clearCache: () => void;
}

interface PageSetters {
  setImageSrc: (src: string) => void;
  setCurrentPage: (n: number) => void;
  setLoading: (b: boolean) => void;
}

/**
 * useReaderPageCache — owns the LRU blob-URL cache for the comic reader's
 * page-at-a-time view, plus the prefetch + load-page orchestration that
 * was inline in App.tsx.
 *
 * Behavior preserved verbatim from the original App.tsx implementation:
 *  - LRU bumps on hit via shared LruByCount.
 *  - On eviction the blob URL is revoked so we don't leak object URLs.
 *  - PREFETCH_AHEAD pages ahead of `fromPage` are fetched in the
 *    background, deduped via an `in-flight` set.
 */
export function useReaderPageCache({ pageCount, currentComicIdRef }: Params): ReaderPageCacheApi {
  const pageCache = useRef<LruByCount<number, string>>(
    new LruByCount<number, string>({
      capacity: PAGE_CACHE_MAX,
      onEvict: (_idx, url) => URL.revokeObjectURL(url),
    }),
  );
  const prefetchInFlight = useRef<Set<number>>(new Set());

  const cacheGet = useCallback((index: number) => pageCache.current.get(index), []);

  const clearCache = useCallback(() => {
    pageCache.current.clear();
    prefetchInFlight.current.clear();
  }, []);

  const fetchPageData = useCallback(async (pageIndex: number): Promise<string | null> => {
    const cached = pageCache.current.get(pageIndex);
    if (cached) return cached;
    try {
      const result = await archivePage(pageIndex);
      if ('error' in result) return null;
      const blob = new Blob([result.buffer], { type: result.mime });
      const blobUrl = URL.createObjectURL(blob);
      pageCache.current.set(pageIndex, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }, []);

  const prefetch = useCallback((fromPage: number, total: number) => {
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const idx = fromPage + i;
      if (idx >= total) break;
      if (pageCache.current.has(idx) || prefetchInFlight.current.has(idx)) continue;
      prefetchInFlight.current.add(idx);
      fetchPageData(idx).finally(() => prefetchInFlight.current.delete(idx));
    }
  }, [fetchPageData]);

  const loadPage = useCallback(async (pageIndex: number, setters: PageSetters) => {
    const { setImageSrc, setCurrentPage, setLoading } = setters;
    // Try cache first.
    const cached = pageCache.current.get(pageIndex);
    if (cached) {
      setImageSrc(cached);
      setCurrentPage(pageIndex);
      prefetch(pageIndex, pageCount);
      if (currentComicIdRef.current != null) {
        updateReadingProgress(currentComicIdRef.current, pageIndex).catch(() => {});
      }
      return;
    }
    setLoading(true);
    try {
      const url = await fetchPageData(pageIndex);
      if (!url) { console.error('Failed to load page:', pageIndex); return; }
      setImageSrc(url);
      setCurrentPage(pageIndex);
      prefetch(pageIndex, pageCount);
      if (currentComicIdRef.current != null) {
        updateReadingProgress(currentComicIdRef.current, pageIndex).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load page:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchPageData, prefetch, pageCount, currentComicIdRef]);

  return { cacheGet, fetchPageData, loadPage, clearCache };
}
