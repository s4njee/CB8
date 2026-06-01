import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bookmark, Heart, Maximize, Minimize, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReaderStore } from '@/store/readerStore';
import * as api from '@/lib/api';
import useComicGestures from '@/hooks/useComicGestures';
import useComicKeyboard from '@/hooks/useComicKeyboard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ComicReaderProps {
  record: api.WebComicRecord;
  initialPage: number;
  setExtraControls?: (controls: React.ReactNode) => void;
}

export default function ComicReader({
  record,
  initialPage,
  setExtraControls,
}: ComicReaderProps) {
  const { prefs, setPrefs, currentPage, setCurrentPage } = useReaderStore();

  const readerBodyRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const prevPageRef = useRef<number>(initialPage);

  // States for images
  const [imgSrc, setImgSrc] = useState<string>('');
  const [img2Src, setImg2Src] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [img2Loading, setImg2Loading] = useState(false);

  // States for page hint
  const [hintText, setHintText] = useState('');
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State for bookmarks & favorites
  const [bookmarks, setBookmarks] = useState<api.Bookmark[]>([]);
  const [isFavorite, setIsFavorite] = useState(record.favorited);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [orientationLocked, setOrientationLocked] = useState(false);

  // Zoom / Pan local DOM manipulation state
  const panRef = useRef({ scale: 1, tx: 0, ty: 0 });

  // 1. DOM Transform helpers (for maximum performance)
  const applyTransform = useCallback(() => {
    const stage = stageRef.current;
    const body = readerBodyRef.current;
    if (stage) {
      stage.style.transform = `translate(${panRef.current.tx}px, ${panRef.current.ty}px) scale(${panRef.current.scale})`;
    }
    if (body) {
      body.classList.toggle('is-zoomed', panRef.current.scale > 1.001);
    }
  }, []);

  const resetTransform = useCallback(() => {
    panRef.current = { scale: 1, tx: 0, ty: 0 };
    const stage = stageRef.current;
    const body = readerBodyRef.current;
    if (stage) {
      stage.style.transform = '';
    }
    if (body) {
      body.classList.remove('is-zoomed');
    }
  }, []);

  // 2. Fetch Bookmarks
  const loadBookmarks = useCallback(async () => {
    try {
      const list = await api.getBookmarks(record.id);
      setBookmarks(list);
    } catch {}
  }, [record.id]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const isBookmarked = bookmarks.some((b) => b.page === currentPage - 1);

  // 3. Preload Cache map
  const preloadCache = useRef<Map<number, Promise<string>>>(new Map());

  const loadPageImg = useCallback((pageIdx: number) => {
    if (preloadCache.current.has(pageIdx)) {
      return preloadCache.current.get(pageIdx)!;
    }
    const p = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img.src);
      img.onerror = (err) => reject(err);
      img.src = api.pageUrl(record.id, pageIdx);
    });
    preloadCache.current.set(pageIdx, p);
    return p;
  }, [record.id]);

  // 4. Directional paging logic
  const pageDelta = useCallback((dir: number) => (prefs.direction === 'rtl' ? -dir : dir), [prefs.direction]);
  const pageStep = useCallback(() => (prefs.spread === 'double' ? 2 : 1), [prefs.spread]);

  const handlePrevPage = useCallback(() => {
    const step = pageStep();
    const delta = pageDelta(-1);
    const next = currentPage + delta * step;
    setCurrentPage(Math.max(1, Math.min(record.pageCount, next)));
  }, [currentPage, record.pageCount, pageStep, pageDelta, setCurrentPage]);

  const handleNextPage = useCallback(() => {
    const step = pageStep();
    const delta = pageDelta(1);
    const next = currentPage + delta * step;
    setCurrentPage(Math.max(1, Math.min(record.pageCount, next)));
  }, [currentPage, record.pageCount, pageStep, pageDelta, setCurrentPage]);

  const handleFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, [setCurrentPage]);

  const handleLastPage = useCallback(() => {
    setCurrentPage(record.pageCount);
  }, [setCurrentPage, record.pageCount]);

  // 5. Actions / Toggles
  const handleCycleZoom = useCallback(() => {
    const ZOOM_MODES: Array<'fit-height' | 'fit-width' | 'original'> = ['fit-height', 'fit-width', 'original'];
    const idx = ZOOM_MODES.indexOf(prefs.zoomMode);
    const nextZoom = ZOOM_MODES[(idx + 1) % ZOOM_MODES.length];
    setPrefs({ zoomMode: nextZoom });
    resetTransform();
  }, [prefs.zoomMode, setPrefs, resetTransform]);

  const handleToggleDirection = useCallback(() => {
    setPrefs({ direction: prefs.direction === 'ltr' ? 'rtl' : 'ltr' });
  }, [prefs.direction, setPrefs]);

  const handleToggleSpread = useCallback(() => {
    const nextSpread = prefs.spread === 'double' ? 'single' : 'double';
    const updates: Partial<typeof prefs> = { spread: nextSpread };
    if (nextSpread === 'double' && prefs.zoomMode !== 'fit-height') {
      updates.zoomMode = 'fit-height';
    }
    setPrefs(updates);
    resetTransform();
  }, [prefs.spread, prefs.zoomMode, setPrefs, resetTransform]);

  const handleToggleBookmark = useCallback(async () => {
    const pageIndex = currentPage - 1;
    const existing = bookmarks.find((b) => b.page === pageIndex);
    try {
      if (existing) {
        await api.deleteBookmark(record.id, existing.id);
        toast.success('Bookmark removed');
      } else {
        await api.createBookmark(record.id, pageIndex);
        toast.success('Page bookmarked');
      }
      loadBookmarks();
    } catch (err: any) {
      toast.error(err.message || 'Bookmark toggle failed');
    }
  }, [currentPage, bookmarks, record.id, loadBookmarks]);

  const handleToggleFavorite = useCallback(async () => {
    try {
      if (isFavorite) {
        await api.removeFavorite(record.id);
        setIsFavorite(false);
        toast.success('Removed from favorites');
      } else {
        await api.addFavorite(record.id);
        setIsFavorite(true);
        toast.success('Added to favorites');
      }
    } catch (err: any) {
      toast.error(err.message || 'Favorite toggle failed');
    }
  }, [isFavorite, record.id]);

  const handleToggleFullscreen = useCallback(() => {
    const target = document.getElementById('reader-overlay') || document.documentElement;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
    unlock?: () => void;
  };
  const orientSupported = typeof orientation !== 'undefined' && typeof orientation.lock === 'function';

  const handleToggleOrientation = useCallback(async () => {
    if (!orientSupported) return;
    try {
      if (orientationLocked) {
        orientation.unlock?.();
        setOrientationLocked(false);
      } else {
        if (!document.fullscreenElement) {
          const target = document.getElementById('reader-overlay') || document.documentElement;
          await target.requestFullscreen?.().catch(() => {});
        }
        await orientation.lock?.('landscape');
        setOrientationLocked(true);
      }
    } catch {
      toast.error('Orientation lock not available');
    }
  }, [orientationLocked, orientSupported]);

  // Sync fullscreen change states
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Sync extra controls back up to ReaderPage toolbar
  useEffect(() => {
    if (!setExtraControls) return;

    setExtraControls(
      <div className="flex items-center gap-1">
        {/* Zoom */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCycleZoom}
          title={`Cycle Zoom Mode (Current: ${prefs.zoomMode})`}
          className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          <span className="font-bold text-xs uppercase">
            {prefs.zoomMode === 'fit-height' ? '↕' : prefs.zoomMode === 'fit-width' ? '↔' : '1:1'}
          </span>
        </Button>

        {/* Direction */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleDirection}
          title={`Toggle Reading Direction (Current: ${prefs.direction.toUpperCase()})`}
          className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          <span className="font-bold text-xs">
            {prefs.direction === 'rtl' ? '→←' : '←→'}
          </span>
        </Button>

        {/* Spread */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleSpread}
          title={`Toggle Spread Mode (Current: ${prefs.spread})`}
          className={cn(
            "h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
            prefs.spread === 'double' && "text-primary hover:text-primary"
          )}
        >
          <span className="font-bold text-sm">
            {prefs.spread === 'double' ? '▥' : '▯'}
          </span>
        </Button>

        {/* Orientation Lock */}
        {orientSupported && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleOrientation}
            title={orientationLocked ? 'Unlock Orientation' : 'Lock to Landscape'}
            className={cn(
              "h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
              orientationLocked && "text-primary hover:text-primary"
            )}
          >
            <span className="text-sm font-semibold">{orientationLocked ? '🔒' : '⟳'}</span>
          </Button>
        )}

        {/* Bookmark */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleBookmark}
          title="Bookmark current page"
          className={cn(
            "h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
            isBookmarked && "text-yellow-500 hover:text-yellow-400"
          )}
        >
          <Bookmark className={cn("h-4.5 w-4.5", isBookmarked && "fill-current")} />
        </Button>

        {/* Favorite */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleFavorite}
          title="Toggle favorite"
          className={cn(
            "h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
            isFavorite && "text-red-500 hover:text-red-400"
          )}
        >
          <Heart className={cn("h-4.5 w-4.5", isFavorite && "fill-current")} />
        </Button>

        {/* Fullscreen */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          {isFullscreen ? <Minimize className="h-4.5 w-4.5" /> : <Maximize className="h-4.5 w-4.5" />}
        </Button>
      </div>
    );
  }, [
    setExtraControls,
    prefs,
    isBookmarked,
    isFavorite,
    isFullscreen,
    orientationLocked,
    orientSupported,
    handleCycleZoom,
    handleToggleDirection,
    handleToggleSpread,
    handleToggleOrientation,
    handleToggleBookmark,
    handleToggleFavorite,
    handleToggleFullscreen,
  ]);

  // 6. Log history & cleanups
  useEffect(() => {
    const pageIndex = initialPage - 1;
    api.logHistory(record.id, 'opened', pageIndex).catch(() => {});

    return () => {
      // Fetch latest page number from Zustand store for accurate logging on unmount
      const currentPageNum = useReaderStore.getState().currentPage;
      api.logHistory(record.id, 'closed', currentPageNum - 1).catch(() => {});
      if (orientSupported) {
        try {
          orientation.unlock?.();
        } catch {}
      }
    };
  }, [record.id, initialPage, orientSupported]);

  // 7. Page Change Effect (Preload, transitions, progress save)
  useEffect(() => {
    let cancelled = false;
    const pageIndex = currentPage - 1;
    setImgLoading(true);

    // Apply slide transition classes
    const stage = stageRef.current;
    if (prefs.transition === 'slide' && stage) {
      stage.classList.remove('slide-from-left', 'slide-from-right');
      void stage.offsetWidth; // Trigger reflow to restart CSS animation

      const prevPage = prevPageRef.current;
      if (prevPage !== currentPage) {
        const animDir = currentPage > prevPage ? 1 : -1;
        stage.classList.add(animDir > 0 ? 'slide-from-right' : 'slide-from-left');
      }
    }
    prevPageRef.current = currentPage;

    resetTransform();

    // Load both pages of the spread together and commit them atomically. Loading
    // each image independently lets the left/right <img> update out of step, and
    // (without the `cancelled` guard) lets a slow/stale resolution from a previous
    // page land after a newer one — both of which show mismatched or flickering
    // pages when navigating, most visibly in double-page mode on slower devices
    // like iPad where decode timing is less predictable.
    const hasSecond = prefs.spread === 'double' && pageIndex + 1 < record.pageCount;
    setImg2Loading(hasSecond);

    Promise.all([
      loadPageImg(pageIndex),
      hasSecond ? loadPageImg(pageIndex + 1).catch(() => '') : Promise.resolve(''),
    ])
      .then(([leftSrc, rightSrc]) => {
        if (cancelled) return;
        setImgSrc(leftSrc);
        setImg2Src(rightSrc);
        setImgLoading(false);
        setImg2Loading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setImgLoading(false);
        setImg2Loading(false);
      });

    // Trigger page hint
    const displayLabel =
      prefs.spread === 'double' && pageIndex + 1 < record.pageCount
        ? `${currentPage}–${currentPage + 1} / ${record.pageCount}`
        : `${currentPage} / ${record.pageCount}`;

    setHintText(displayLabel);
    setHintVisible(true);

    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = setTimeout(() => {
      setHintVisible(false);
    }, 1800);

    // Save reading progress to database
    api.updateProgress(record.id, pageIndex).catch(() => {});

    // Preload neighbors
    const ahead = prefs.spread === 'double' ? 2 : 1;
    for (let i = 1; i <= ahead; i++) {
      if (pageIndex + i < record.pageCount) loadPageImg(pageIndex + i).catch(() => {});
      if (pageIndex - i >= 0) loadPageImg(pageIndex - i).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    prefs.spread,
    prefs.transition,
    loadPageImg,
    record.pageCount,
    record.id,
    resetTransform,
  ]);

  // Clean up hint timers on unmount
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  // 8. Attach gesture hooks
  useComicGestures({
    readerBodyRef,
    stageRef,
    panRef,
    applyTransform,
    resetTransform,
    onSwipe: (dir) => {
      if (dir === 1) handleNextPage();
      else handlePrevPage();
    },
    prefs,
  });

  // 9. Attach keyboard hooks
  useComicKeyboard({
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
    onFirstPage: handleFirstPage,
    onLastPage: handleLastPage,
    onToggleFullscreen: handleToggleFullscreen,
    onCycleZoom: handleCycleZoom,
    onToggleBookmark: handleToggleBookmark,
    onToggleSpread: handleToggleSpread,
    panRef,
    applyTransform,
    resetTransform,
  });

  return (
    <div
      ref={readerBodyRef}
      id="comic-reader"
      className="comic-reader w-full h-full relative overflow-hidden bg-black flex items-center justify-center"
      data-zoom={prefs.zoomMode}
      data-direction={prefs.direction}
      data-spread={prefs.spread}
      data-transition={prefs.transition}
    >
      {/* Zoomable Stage Container */}
      <div
        ref={stageRef}
        className="comic-stage flex items-center justify-center w-full h-full transition-transform duration-75 select-none"
      >
        <img
          src={imgSrc}
          alt="Comic Page Left"
          id="comic-page-img"
          className={cn(
            "comic-page-img object-contain select-none max-w-full max-h-full transition-opacity duration-150",
            imgLoading ? "opacity-30 loading" : "opacity-100"
          )}
          data-zoom={prefs.zoomMode}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        />

        {prefs.spread === 'double' && img2Src && (
          <img
            src={img2Src}
            alt="Comic Page Right"
            className={cn(
              "comic-page-img comic-page-img-secondary object-contain select-none max-w-full max-h-full transition-opacity duration-150",
              img2Loading ? "opacity-30 loading" : "opacity-100"
            )}
            data-zoom={prefs.zoomMode}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          />
        )}
      </div>

      {/* Tap Zones for mouse page-turns */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          handlePrevPage();
        }}
        className="reader-tap-zone tap-prev cursor-w-resize"
      />
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleNextPage();
        }}
        className="reader-tap-zone tap-next cursor-e-resize"
      />

      {/* Central HUD Page indicator hint */}
      <div id="page-hint" className={cn("page-hint z-40 select-none", !hintVisible && "fade")}>
        {hintText}
      </div>
    </div>
  );
}
