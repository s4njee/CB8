import React, { useEffect, useState, useCallback, useRef } from 'react';
import { formatStatusBar } from '../../shared/statusFormat';
import {
  archiveClose,
  archiveOpen,
  archivePage,
  getComicByPath,
  onFileOpened,
  toggleFullscreen,
  updateReadingProgress,
} from '../ipcClient';
import { LibraryView } from './LibraryView';
import { LibrarySidebar } from './LibrarySidebar';

type View = 'library' | 'reader';

const PAGE_CACHE_MAX = 10;
const PREFETCH_AHEAD = 3;

export const App: React.FC = () => {
  const [view, setView] = useState<View>('library');
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'comics' | 'books'>('comics');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentComicId, setCurrentComicId] = useState<number | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const currentComicIdRef = useRef<number | null>(null);
  const sidebarRefreshKey = useRef(0);
  const readerImageRef = useRef<HTMLImageElement>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [, forceUpdate] = useState(0);

  // LRU page cache: Map preserves insertion order, most recent at end
  const pageCache = useRef<Map<number, string>>(new Map());
  const prefetchInFlight = useRef<Set<number>>(new Set());

  const cacheGet = useCallback((index: number): string | undefined => {
    const cache = pageCache.current;
    const val = cache.get(index);
    if (val !== undefined) {
      // Move to end (most recently used)
      cache.delete(index);
      cache.set(index, val);
    }
    return val;
  }, []);

  const cacheSet = useCallback((index: number, dataUrl: string) => {
    const cache = pageCache.current;
    cache.delete(index); // remove if exists to re-insert at end
    cache.set(index, dataUrl);
    // Evict oldest if over limit
    while (cache.size > PAGE_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }, []);

  const clearCache = useCallback(() => {
    pageCache.current.clear();
    prefetchInFlight.current.clear();
  }, []);

  const fetchPageData = useCallback(async (pageIndex: number): Promise<string | null> => {
    const cached = cacheGet(pageIndex);
    if (cached) return cached;
    try {
      const result = await archivePage(pageIndex);
      if ('error' in result) return null;
      cacheSet(pageIndex, result.dataUrl);
      return result.dataUrl;
    } catch {
      return null;
    }
  }, [cacheGet, cacheSet]);

  const prefetch = useCallback((fromPage: number, total: number) => {
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const idx = fromPage + i;
      if (idx >= total) break;
      if (pageCache.current.has(idx) || prefetchInFlight.current.has(idx)) continue;
      prefetchInFlight.current.add(idx);
      fetchPageData(idx).finally(() => prefetchInFlight.current.delete(idx));
    }
  }, [fetchPageData]);

  const loadPage = useCallback(async (pageIndex: number) => {
    // Try cache first
    const cached = cacheGet(pageIndex);
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
      const dataUrl = await fetchPageData(pageIndex);
      if (!dataUrl) { console.error('Failed to load page:', pageIndex); return; }
      setImageSrc(dataUrl);
      setCurrentPage(pageIndex);
      prefetch(pageIndex, pageCount);
      if (currentComicIdRef.current != null) {
        updateReadingProgress(currentComicIdRef.current, pageIndex).catch(() => {});
      }
    } catch (err) { console.error('Failed to load page:', err); }
    finally { setLoading(false); }
  }, [cacheGet, fetchPageData, prefetch, pageCount]);

  const openArchive = useCallback(async (filePath: string, resumePage?: number) => {
    try {
      clearCache();
      const result = await archiveOpen(filePath);
      if ('error' in result) { console.error('Failed to open archive:', result.error); return; }
      setPageCount(result.pageCount);
      setFilename(filePath.split('/').pop()?.split('\\').pop() ?? filePath);
      setCurrentFilePath(filePath);
      setView('reader');

      // Look up comic in DB for ID and reading progress
      const comic = await getComicByPath(filePath);
      const comicId = comic?.id ?? null;
      setCurrentComicId(comicId);
      currentComicIdRef.current = comicId;

      // Determine start page: explicit resume > saved progress > 0
      let startPage = 0;
      if (resumePage != null && resumePage >= 0 && resumePage < result.pageCount) {
        startPage = resumePage;
      } else if (comic?.lastPage != null && comic.lastPage > 0 && comic.lastPage < result.pageCount) {
        startPage = comic.lastPage;
      }
      await loadPage(startPage);
    } catch (err) { console.error('Failed to open archive:', err); }
  }, [loadPage, clearCache]);

  const backToLibrary = useCallback(async () => {
    await archiveClose();
    clearCache();
    setView('library');
    setPageCount(0); setCurrentPage(0); setImageSrc(null); setFilename(null);
    setCurrentComicId(null); setCurrentFilePath(null); currentComicIdRef.current = null;
    setLibraryRefreshKey((k) => k + 1);
  }, [clearCache]);

  const previousPage = useCallback(() => {
    const prev = Math.max(currentPage - 1, 0);
    if (prev !== currentPage) void loadPage(prev);
  }, [currentPage, loadPage]);

  const nextPage = useCallback(() => {
    const next = Math.min(currentPage + 1, pageCount - 1);
    if (next !== currentPage) void loadPage(next);
  }, [currentPage, pageCount, loadPage]);

  const handleReaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const image = readerImageRef.current;
    if (!image) return;

    const bounds = image.getBoundingClientRect();
    if (e.clientX < bounds.left) previousPage();
    else if (e.clientX > bounds.right) nextPage();
  }, [nextPage, previousPage]);

  useEffect(() => {
    const unsub = onFileOpened(openArchive);
    return unsub;
  }, [openArchive]);

  // Global F11 fullscreen toggle (works in both views)
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    if (view !== 'reader' || pageCount === 0) return;
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case ' ':
          e.preventDefault();
          nextPage();
          break;
        case 'ArrowLeft': case 'Backspace':
          e.preventDefault();
          previousPage();
          break;
        case 'Home': e.preventDefault(); loadPage(0); break;
        case 'End': e.preventDefault(); loadPage(pageCount - 1); break;
        case 'Escape': e.preventDefault(); void backToLibrary(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, pageCount, loadPage, backToLibrary, nextPage, previousPage]);

  const handleLibrariesChanged = useCallback(() => {
    sidebarRefreshKey.current++;
    forceUpdate((n) => n + 1);
  }, []);

  return (
    <>
      <div style={{ display: view === 'library' ? 'flex' : 'none', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <LibraryView
          activeLibraryId={activeLibraryId}
          activeView={activeView}
          onOpenComic={openArchive}
          onComicsChanged={handleLibrariesChanged}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          refreshKey={libraryRefreshKey}
        />
        <LibrarySidebar
          key={sidebarRefreshKey.current}
          activeLibraryId={activeLibraryId}
          activeView={activeView}
          onSelectLibrary={setActiveLibraryId}
          onSelectView={setActiveView}
          onLibrariesChanged={handleLibrariesChanged}
        />
      </div>

      {view === 'reader' && (
        <div style={{ backgroundColor: '#000', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div onClick={handleReaderClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'default' }}>
            {imageSrc && <img ref={readerImageRef} src={imageSrc} alt={`Page ${currentPage + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
            {loading && <div style={{ position: 'absolute', color: '#fff' }}>Loading...</div>}
          </div>
          <div style={{ height: 28, backgroundColor: '#222', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, flexShrink: 0, padding: '0 12px' }}>
            <button onClick={backToLibrary} style={{ background: 'none', border: 'none', color: '#88f', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Library</button>
            <span>
              {filename && <span style={{ marginRight: 16 }}>{filename}</span>}
              {formatStatusBar(currentPage, pageCount)}
            </span>
          </div>
        </div>
      )}
    </>
  );
};
