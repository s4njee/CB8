<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    logHistory,
    pageUrl,
    fileUrl,
    updateProgress,
    addFavorite,
    removeFavorite,
    createBookmark,
    deleteBookmark,
  } from '$lib/api';
  import { showErrorToast, showToast } from '$lib/ui/toast';
  import type { Bookmark, ComicListRecord } from '$lib/api';

  let { data } = $props<{
    data: {
      comic: ComicListRecord;
      initialPageIndex: number;
      bookmarks: Bookmark[];
      session?: {
        authenticated: boolean;
        user: { id: number; username: string; isAdmin: boolean } | null;
      } | null;
    };
  }>();

  const isAuthenticated = $derived(Boolean(data.session?.authenticated && data.session?.user));
  const isComic = $derived(data.comic.mediaType === 'comic' && !['epub', 'pdf', 'mobi'].includes(data.comic.fileExt ?? ''));
  const isEpub = $derived(data.comic.fileExt === 'epub');
  const isPdf = $derived(data.comic.fileExt === 'pdf');

  // --- Comic reader state ---
  let currentPageIndex = $state(0);
  let imageError = $state<string | null>(null);
  let imageLoading = $state(true);
  let toolbarVisible = $state(true);
  let bookmarks = $state<Bookmark[]>([...data.bookmarks]);
  let favoritedState = $state(Boolean(data.comic.favorited));
  let bookmarkPanelOpen = $state(false);
  let favBusy = $state(false);

  // --- Zoom & pan ---
  type ZoomMode = 'fit-width' | 'fit-height' | 'original';
  let zoomMode = $state<ZoomMode>('fit-width');
  let pinchScale = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  // --- Fullscreen ---
  let isFullscreen = $state(false);
  let readerRouteEl = $state<HTMLElement | null>(null);

  const maxPageIndex = $derived(Math.max(0, data.comic.pageCount - 1));
  const currentImageUrl = $derived(isComic ? pageUrl(data.comic.id, currentPageIndex) : null);
  const previousPageHref = $derived(`/read/${data.comic.id}/${Math.max(0, currentPageIndex - 1)}`);
  const nextPageHref = $derived(`/read/${data.comic.id}/${Math.min(maxPageIndex, currentPageIndex + 1)}`);
  const canGoPrevious = $derived(currentPageIndex > 0);
  const canGoNext = $derived(currentPageIndex < maxPageIndex);
  const currentBookmark = $derived(bookmarks.find((b) => b.page === currentPageIndex) ?? null);

  const preloadCache = new Map<string, Promise<void>>();

  // --- Pinch-zoom + swipe internals (not reactive) ---
  const activePointers = new Map<number, PointerEvent>();
  let initialPinchDist = 0;
  let initialPinchScale = 1;
  let isPinching = false;
  let lastSingleTapTime = 0;
  let gestureStart: { x: number; y: number; time: number } | null = null;

  function getPointerDist(a: PointerEvent, b: PointerEvent): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function resetZoom(): void {
    pinchScale = 1;
    panX = 0;
    panY = 0;
  }

  function setZoomMode(mode: ZoomMode): void {
    zoomMode = mode;
    resetZoom();
    try { localStorage.setItem('reader-zoom', mode); } catch { /* ignore */ }
  }

  function onCanvasPointerDown(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, e);

    if (activePointers.size === 1) {
      gestureStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      const now = Date.now();
      if (now - lastSingleTapTime < 320 && pinchScale > 1) resetZoom();
      lastSingleTapTime = now;
    } else if (activePointers.size === 2) {
      gestureStart = null; // multi-touch cancels swipe/tap
      const vals = [...activePointers.values()];
      initialPinchDist = getPointerDist(vals[0], vals[1]);
      initialPinchScale = pinchScale;
      isPinching = true;
    }
  }

  function onCanvasPointerMove(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) return;
    const prev = activePointers.get(e.pointerId)!;
    activePointers.set(e.pointerId, e);

    if (activePointers.size >= 2) {
      const vals = [...activePointers.values()];
      const dist = getPointerDist(vals[0], vals[1]);
      if (initialPinchDist > 0) {
        pinchScale = Math.max(0.5, Math.min(8, initialPinchScale * (dist / initialPinchDist)));
      }
    } else if (activePointers.size === 1 && pinchScale > 1.05) {
      panX += e.clientX - prev.clientX;
      panY += e.clientY - prev.clientY;
    }
  }

  function onCanvasPointerUp(e: PointerEvent): void {
    const start = gestureStart;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) isPinching = false;

    // Only resolve gesture when all fingers are lifted
    if (activePointers.size === 0 && start && !isPinching) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const dt = Date.now() - start.time;

      if (pinchScale <= 1.05 && adx > 40 && adx > ady * 1.5 && dt < 500) {
        // Horizontal swipe → navigate pages
        if (dx < 0) void navigateToPage(currentPageIndex + 1);
        else void navigateToPage(currentPageIndex - 1);
      } else if (adx < 14 && ady < 14 && dt < 250) {
        // Tap → toggle toolbar
        toolbarVisible = !toolbarVisible;
      }
      gestureStart = null;
    }
  }

  function onCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    pinchScale = Math.max(0.5, Math.min(8, pinchScale * factor));
    if (pinchScale <= 1.05) { pinchScale = 1; panX = 0; panY = 0; }
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await readerRouteEl?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch { /* browser may deny */ }
  }

  function clampPageIndex(index: number): number {
    if (!Number.isFinite(index)) return 0;
    return Math.max(0, Math.min(maxPageIndex, index));
  }

  function preloadImage(url: string | null): void {
    if (!url || preloadCache.has(url)) return;
    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    preloadCache.set(url, promise);
  }

  async function navigateToPage(targetIndex: number, replaceState = false): Promise<void> {
    const nextIndex = clampPageIndex(targetIndex);
    if (nextIndex === currentPageIndex && targetIndex === nextIndex) return;
    imageLoading = true;
    imageError = null;
    currentPageIndex = nextIndex;
    await goto(`/read/${data.comic.id}/${nextIndex}`, { replaceState, noScroll: true, keepFocus: true, invalidateAll: false });
  }

  function primeAdjacent(index: number): void {
    preloadImage(pageUrl(data.comic.id, index));
    if (index > 0) preloadImage(pageUrl(data.comic.id, index - 1));
    if (index < maxPageIndex) preloadImage(pageUrl(data.comic.id, index + 1));
  }

  $effect(() => {
    const resolved = clampPageIndex(data.initialPageIndex);
    imageError = null;
    imageLoading = true;
    currentPageIndex = resolved;
    bookmarks = [...data.bookmarks];
    favoritedState = Boolean(data.comic.favorited);
    if (isComic) primeAdjacent(resolved);
    if (resolved !== data.initialPageIndex) {
      void goto(`/read/${data.comic.id}/${resolved}`, { replaceState: true, noScroll: true, keepFocus: true, invalidateAll: false });
    }
  });

  $effect(() => {
    if (!isComic) return;
    primeAdjacent(currentPageIndex);
    if (isAuthenticated) void updateProgress(data.comic.id, currentPageIndex).catch(() => {});
  });

  // --- Favorites ---
  async function toggleFavorite(): Promise<void> {
    if (favBusy) return;
    favBusy = true;
    const prev = favoritedState;
    favoritedState = !prev;
    try {
      if (prev) await removeFavorite(data.comic.id);
      else await addFavorite(data.comic.id);
      showToast(prev ? 'Removed from favorites' : 'Added to favorites');
    } catch {
      favoritedState = prev;
      showErrorToast('Failed to update favorite');
    } finally {
      favBusy = false;
    }
  }

  // --- Bookmarks ---
  async function toggleBookmark(): Promise<void> {
    if (currentBookmark) {
      try {
        await deleteBookmark(data.comic.id, currentBookmark.id);
        bookmarks = bookmarks.filter((b) => b.id !== currentBookmark.id);
        showToast('Bookmark removed');
      } catch {
        showErrorToast('Failed to remove bookmark');
      }
    } else {
      try {
        const bm = await createBookmark(data.comic.id, currentPageIndex);
        bookmarks = [...bookmarks, bm];
        showToast(`Bookmark added at page ${currentPageIndex + 1}`);
      } catch {
        showErrorToast('Failed to create bookmark');
      }
    }
  }

  onMount(() => {
    // Restore saved zoom mode
    try {
      const saved = localStorage.getItem('reader-zoom');
      if (saved === 'fit-height' || saved === 'original') zoomMode = saved;
    } catch { /* ignore */ }

    // Hide toolbar by default on touch/narrow screens
    if (window.matchMedia('(max-width: 900px)').matches) toolbarVisible = false;

    if (isAuthenticated) void logHistory(data.comic.id, 'opened', currentPageIndex).catch(() => {});

    // Wake lock
    let wakeLock: { release(): Promise<void> } | null = null;
    if (isComic && 'wakeLock' in navigator) {
      (navigator as { wakeLock: { request(type: string): Promise<{ release(): Promise<void> }> } })
        .wakeLock.request('screen').then((s) => { wakeLock = s; }).catch(() => {});
    }

    // Fullscreen change listener
    const onFullscreenChange = (): void => { isFullscreen = Boolean(document.fullscreenElement); };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (event.key) {
        case 'ArrowRight': case ' ':
          event.preventDefault();
          if (!isPinching) void navigateToPage(currentPageIndex + 1);
          break;
        case 'ArrowLeft': case 'Backspace':
          event.preventDefault();
          if (!isPinching) void navigateToPage(currentPageIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          void navigateToPage(0);
          break;
        case 'End':
          event.preventDefault();
          void navigateToPage(maxPageIndex);
          break;
        case 'b': case 'B':
          void toggleBookmark();
          break;
        case 'h': case 'H':
          toolbarVisible = !toolbarVisible;
          break;
        case 'f': case 'F':
          if (isAuthenticated) void toggleFavorite();
          break;
        case 'Escape':
          if (pinchScale > 1) resetZoom();
          break;
        case '1':
          setZoomMode('fit-width');
          break;
        case '2':
          setZoomMode('fit-height');
          break;
        case '3':
          setZoomMode('original');
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      wakeLock?.release().catch(() => {});
      if (isAuthenticated) void logHistory(data.comic.id, 'closed', currentPageIndex).catch(() => {});
    };
  });
</script>

<section class="reader-route" bind:this={readerRouteEl}>
  <!-- Toolbar -->
  <header class={`reader-toolbar ${toolbarVisible ? '' : 'hidden'}`}>
    <div class="reader-title-group">
      <a class="reader-toolbar-button ghost" href="/">← Library</a>
      <div class="reader-title-copy">
        <div class="reader-kicker">
          {isComic ? 'Comic' : isEpub ? 'EPUB' : isPdf ? 'PDF' : 'Reader'}
        </div>
        <h1>{data.comic.title}</h1>
      </div>
    </div>

    {#if isComic}
      <div class="reader-slider-wrap">
        <input
          class="reader-slider"
          type="range"
          min="0"
          max={maxPageIndex}
          value={currentPageIndex}
          oninput={(e) => void navigateToPage(Number((e.target as HTMLInputElement).value))}
          title="Jump to page"
        />
        <div class="reader-page-pill">{currentPageIndex + 1} / {data.comic.pageCount}</div>
      </div>

      <div class="reader-toolbar-actions">
        <button class="reader-toolbar-button" onclick={() => navigateToPage(currentPageIndex - 1)} disabled={!canGoPrevious} title="Previous (←)">‹</button>
        <button class="reader-toolbar-button" onclick={() => navigateToPage(currentPageIndex + 1)} disabled={!canGoNext} title="Next (→)">›</button>

        <!-- Zoom mode controls -->
        <div class="zoom-controls" role="group" aria-label="Zoom mode">
          <button
            class={`reader-toolbar-button zoom-btn ${zoomMode === 'fit-width' ? 'active-zoom' : ''}`}
            onclick={() => setZoomMode('fit-width')}
            title="Fit width (1)"
          >↔</button>
          <button
            class={`reader-toolbar-button zoom-btn ${zoomMode === 'fit-height' ? 'active-zoom' : ''}`}
            onclick={() => setZoomMode('fit-height')}
            title="Fit height (2)"
          >↕</button>
          <button
            class={`reader-toolbar-button zoom-btn ${zoomMode === 'original' ? 'active-zoom' : ''}`}
            onclick={() => setZoomMode('original')}
            title="Original size (3)"
          >1:1</button>
        </div>

        {#if pinchScale !== 1 || panX !== 0 || panY !== 0}
          <button class="reader-toolbar-button" onclick={resetZoom} title="Reset zoom (Esc)">
            {Math.round(pinchScale * 100)}%
          </button>
        {/if}

        <button
          class={`reader-toolbar-button ${isFullscreen ? 'active-zoom' : ''}`}
          onclick={toggleFullscreen}
          title="Toggle fullscreen"
        >{isFullscreen ? '⛶' : '⛶'}</button>

        {#if isAuthenticated}
          <button
            class={`reader-toolbar-button ${currentBookmark ? 'active-bm' : ''}`}
            onclick={toggleBookmark}
            title={currentBookmark ? 'Remove bookmark (B)' : 'Add bookmark (B)'}
          >🔖</button>
          <button
            class={`reader-toolbar-button ${favoritedState ? 'active-fav' : ''}`}
            onclick={toggleFavorite}
            disabled={favBusy}
            title="Toggle favorite (F)"
          >♥</button>
          {#if bookmarks.length > 0}
            <button
              class={`reader-toolbar-button ${bookmarkPanelOpen ? 'active-bm' : ''}`}
              onclick={() => { bookmarkPanelOpen = !bookmarkPanelOpen; }}
              title="Bookmarks"
            >≡ {bookmarks.length}</button>
          {/if}
        {/if}

        <button class="reader-toolbar-button" onclick={() => { toolbarVisible = false; }} title="Hide toolbar (H)">✕</button>
      </div>
    {/if}
  </header>

  <!-- Re-show toolbar button -->
  {#if !toolbarVisible}
    <button class="toolbar-reveal" onclick={() => { toolbarVisible = true; }} title="Show toolbar (H)">▼</button>
  {/if}

  <!-- Bookmark panel -->
  {#if bookmarkPanelOpen && bookmarks.length > 0}
    <div class="bookmark-panel surface-card">
      <div class="bookmark-panel-head">
        <span>Bookmarks</span>
        <button onclick={() => { bookmarkPanelOpen = false; }}>✕</button>
      </div>
      {#each bookmarks.sort((a, b) => a.page - b.page) as bm (bm.id)}
        <button
          class={`bookmark-item ${bm.page === currentPageIndex ? 'active' : ''}`}
          onclick={() => { void navigateToPage(bm.page); bookmarkPanelOpen = false; }}
        >
          <span class="bookmark-page">Page {bm.page + 1}</span>
          {#if bm.note}<span class="bookmark-note">{bm.note}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Comic reader -->
  {#if isComic}
    <div class="reader-stage">
      <button
        class={`reader-edge reader-edge-prev ${!canGoPrevious ? 'is-disabled' : ''}`}
        onclick={() => { if (!isPinching) void navigateToPage(currentPageIndex - 1); }}
        aria-label="Previous page"
        disabled={!canGoPrevious}
      ></button>

      <div
        class="reader-canvas"
        onpointerdown={onCanvasPointerDown}
        onpointermove={onCanvasPointerMove}
        onpointerup={onCanvasPointerUp}
        onpointercancel={onCanvasPointerUp}
        onwheel={onCanvasWheel}
      >
        <div
          class="zoom-layer"
          style="transform: translate({panX}px, {panY}px) scale({pinchScale}); transform-origin: center center;"
        >
          {#if imageError}
            <div class="reader-image-error" role="alert">
              <h2>Page failed to load</h2>
              <p>{imageError}</p>
            </div>
          {:else}
            <img
              class:loading={imageLoading}
              class={`reader-image zoom-${zoomMode}`}
              src={currentImageUrl ?? undefined}
              alt={`Page ${currentPageIndex + 1} of ${data.comic.title}`}
              onload={() => { imageLoading = false; imageError = null; }}
              onerror={() => { imageLoading = false; imageError = `Could not load page ${currentPageIndex + 1}.`; }}
              draggable="false"
            />
          {/if}
        </div>
      </div>

      <button
        class={`reader-edge reader-edge-next ${!canGoNext ? 'is-disabled' : ''}`}
        onclick={() => { if (!isPinching) void navigateToPage(currentPageIndex + 1); }}
        aria-label="Next page"
        disabled={!canGoNext}
      ></button>
    </div>

  <!-- EPUB reader -->
  {:else if isEpub}
    <div class="ebook-frame-wrap">
      <iframe
        class="ebook-frame"
        src={fileUrl(data.comic.id)}
        title={data.comic.title}
        sandbox="allow-same-origin allow-scripts"
      ></iframe>
      <div class="ebook-notice">
        <p>Displaying embedded EPUB via iframe. For full EPUB.js rendering, use the legacy reader at <a href="http://localhost:8008" target="_blank" rel="noopener">:8008</a>.</p>
      </div>
    </div>

  <!-- PDF reader -->
  {:else if isPdf}
    <div class="ebook-frame-wrap">
      <iframe
        class="ebook-frame"
        src={fileUrl(data.comic.id)}
        title={data.comic.title}
      ></iframe>
    </div>

  <!-- Unsupported -->
  {:else}
    <section class="reader-message-card surface-card">
      <h2>Format not yet supported in the web reader.</h2>
      <p>
        <code>.{data.comic.fileExt ?? 'unknown'}</code> files cannot be rendered here.
        Download the file or use the legacy reader.
      </p>
      <a class="auth-button secondary" href={fileUrl(data.comic.id)} download>Download file</a>
    </section>
  {/if}
</section>

<style>
  .reader-route {
    display: grid;
    gap: 0.6rem;
    min-height: calc(100svh - 5.5rem);
  }

  .reader-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(22, 22, 22, 0.98), rgba(12, 12, 12, 0.98));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
    flex-wrap: wrap;
  }

  .reader-toolbar.hidden {
    display: none;
  }

  .toolbar-reveal {
    position: fixed;
    top: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    padding: 0.4rem 1.2rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.9);
    color: var(--text-muted);
    font-size: 0.82rem;
    cursor: pointer;
    backdrop-filter: blur(8px);
  }

  .reader-title-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .reader-title-copy {
    min-width: 0;
  }

  .reader-title-copy h1 {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 22ch;
  }

  .reader-kicker {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .reader-slider-wrap {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1 1 200px;
    min-width: 120px;
    max-width: 400px;
  }

  .reader-slider {
    flex: 1;
    height: 0.35rem;
    border-radius: 999px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .reader-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
  }

  .zoom-controls .zoom-btn {
    border: 0;
    border-radius: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 2.1rem;
    font-size: 0.78rem;
    padding: 0.45rem 0.55rem;
  }

  .zoom-controls .zoom-btn:last-child {
    border-right: 0;
  }

  .reader-toolbar-button,
  .reader-page-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.1rem;
    padding: 0.45rem 0.72rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .reader-toolbar-button.ghost {
    background: rgba(74, 158, 255, 0.1);
    border-color: rgba(74, 158, 255, 0.18);
    color: #cfe4ff;
  }

  .reader-toolbar-button.active-bm {
    background: rgba(74, 158, 255, 0.15);
    border-color: rgba(74, 158, 255, 0.3);
    color: #93c5fd;
  }

  .reader-toolbar-button.active-fav {
    background: rgba(248, 113, 113, 0.15);
    border-color: rgba(248, 113, 113, 0.3);
    color: #f87171;
  }

  .reader-toolbar-button.active-zoom {
    background: rgba(74, 158, 255, 0.18);
    border-color: rgba(74, 158, 255, 0.35);
    color: #93c5fd;
  }

  .reader-toolbar-button:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .reader-page-pill {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Bookmark panel */
  .bookmark-panel {
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 240px;
    overflow-y: auto;
  }

  .bookmark-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.2rem;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .bookmark-panel-head button {
    background: transparent;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.2rem 0.4rem;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 140ms ease;
  }

  .bookmark-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .bookmark-item.active {
    background: rgba(74, 158, 255, 0.1);
    color: #cfe4ff;
  }

  .bookmark-page {
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .bookmark-note {
    color: var(--text-muted);
    font-size: 0.84rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Reader stage */
  .reader-stage {
    position: relative;
    display: grid;
    grid-template-columns: minmax(3rem, 6vw) minmax(0, 1fr) minmax(3rem, 6vw);
    align-items: stretch;
    min-height: calc(100svh - 11rem);
    border-radius: 18px;
    overflow: hidden;
    background: radial-gradient(circle at top, rgba(74, 158, 255, 0.06), transparent 35%), #040404;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .reader-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0.75rem;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }

  .reader-canvas:active {
    cursor: grabbing;
  }

  .zoom-layer {
    display: flex;
    align-items: center;
    justify-content: center;
    will-change: transform;
  }

  .reader-image {
    display: block;
    max-width: 100%;
    max-height: calc(100svh - 13rem);
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    transition: opacity 140ms ease;
    pointer-events: none;
  }

  .reader-image.zoom-fit-height {
    max-width: none;
    width: auto;
    max-height: calc(100svh - 13rem);
    height: calc(100svh - 13rem);
  }

  .reader-image.zoom-original {
    max-width: none;
    max-height: none;
    width: auto;
    height: auto;
  }

  .reader-image.loading {
    opacity: 0.65;
  }

  .reader-edge {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: background 140ms ease;
  }

  .reader-edge:hover {
    background: rgba(74, 158, 255, 0.06);
  }

  .reader-edge.is-disabled,
  .reader-edge:disabled {
    cursor: default;
    pointer-events: none;
    opacity: 0.15;
  }

  /* EPUB/PDF */
  .ebook-frame-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: calc(100svh - 10rem);
  }

  .ebook-frame {
    flex: 1;
    width: 100%;
    min-height: calc(100svh - 12rem);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    background: #fff;
  }

  .ebook-notice {
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  .ebook-notice a {
    color: var(--accent);
  }

  /* Unsupported */
  .reader-message-card {
    padding: 1.5rem;
  }

  .reader-message-card h2 {
    margin: 0 0 0.5rem;
  }

  .reader-message-card p {
    margin: 0 0 1rem;
    color: var(--text-muted);
  }

  .auth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.62rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .auth-button.secondary {
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }

  @media (max-width: 900px) {
    /* Full-bleed layout: stage fills the viewport, toolbar overlays */
    .reader-route {
      position: relative;
      display: block;
      height: calc(100svh - var(--nav-h, 52px));
      overflow: hidden;
    }

    .reader-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      border-radius: 0;
      border-left: 0;
      border-right: 0;
      border-top: 0;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      backdrop-filter: blur(20px);
      background: linear-gradient(180deg, rgba(10,10,10,0.96), rgba(10,10,10,0.88));
    }

    .reader-title-copy h1 {
      max-width: 16ch;
    }

    .reader-stage {
      position: absolute;
      inset: 0;
      min-height: unset;
      border-radius: 0;
      border: none;
      grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem;
    }

    .reader-canvas {
      padding: 0;
      height: 100%;
    }

    .reader-image {
      max-height: 100%;
    }

    .reader-image.zoom-fit-height {
      max-height: 100%;
      height: 100%;
    }

    .toolbar-reveal {
      top: 0.75rem;
    }

    .reader-slider-wrap {
      order: 10;
      width: 100%;
      flex-basis: 100%;
      max-width: 100%;
    }

    .zoom-controls {
      display: none;
    }
  }
</style>
