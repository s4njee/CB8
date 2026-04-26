import React, { useEffect, useState, useCallback, useRef } from 'react';
import { formatStatusBar } from '../../shared/statusFormat';
import {
  archiveClose,
  archiveOpen,
  getComicByPath,
  onFileOpened,
  onOpenSettings,
  toggleFullscreen,
} from '../ipcClient';
import { EpubReaderView } from './EpubReaderView';
import { PdfReaderView } from './PdfReaderView';
import { LibraryView } from './LibraryView';
import { LibrarySidebar } from './LibrarySidebar';
import { SettingsDialog } from './SettingsDialog';
import { ErrorBoundary } from './ErrorBoundary';
import { useConfirm } from './useConfirm';
import { useReaderPageCache } from './library/hooks/useReaderPageCache';

type View = 'library' | 'reader' | 'epub-reader' | 'pdf-reader';

export const App: React.FC = () => {
  const { alert, modal: confirmModal } = useConfirm();
  const [view, setView] = useState<View>('library');
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'all' | 'comics' | 'books'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentComicId, setCurrentComicId] = useState<number | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [bookReader, setBookReader] = useState<{
    filePath: string;
    comicId: number | null;
    kind: 'epub-reader' | 'pdf-reader';
    initialLocation?: string | null;
    initialPage?: number;
  } | null>(null);
  const currentComicIdRef = useRef<number | null>(null);
  const sidebarRefreshKey = useRef(0);
  const readerImageRef = useRef<HTMLImageElement>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [, forceUpdate] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Page cache, prefetch, and loadPage orchestration live in the hook.
  // We only feed it the current pageCount + comic-id ref + the display
  // setters (since the loaded page sets imageSrc/currentPage/loading here).
  const { loadPage: loadPageFromCache, clearCache } = useReaderPageCache({
    pageCount,
    currentComicIdRef,
  });
  const loadPage = useCallback((pageIndex: number) =>
    loadPageFromCache(pageIndex, { setImageSrc, setCurrentPage, setLoading }),
    [loadPageFromCache],
  );

  const openFile = useCallback(async (filePath: string, resumePage?: number) => {
    try {
      clearCache();
      const comic = await getComicByPath(filePath);
      const comicId = comic?.id ?? null;
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const mediaType = comic?.mediaType ?? (ext === 'epub' || ext === 'pdf' || ext === 'mobi' ? 'book' : 'comic');

      if (mediaType === 'book') {
        clearCache();
        setBookReader(null);
        setCurrentComicId(null);
        currentComicIdRef.current = null;
        setCurrentFilePath(filePath);
        setFilename(filePath.split('/').pop()?.split('\\').pop() ?? filePath);
        if (ext === 'pdf') {
          setBookReader({
            filePath,
            comicId,
            kind: 'pdf-reader',
            initialPage: resumePage ?? comic?.lastPage ?? 0,
          });
          setView('pdf-reader');
          return;
        }
        if (ext === 'epub') {
          setBookReader({
            filePath,
            comicId,
            kind: 'epub-reader',
            initialLocation: comic?.lastLocation ?? null,
          });
          setView('epub-reader');
          return;
        }
        await alert(`Unsupported book format for in-app reader: ${filePath}`);
        return;
      }

      const result = await archiveOpen(filePath);
      if ('error' in result) { console.error('Failed to open archive:', result.error); return; }
      setBookReader(null);
      setPageCount(result.pageCount);
      setFilename(filePath.split('/').pop()?.split('\\').pop() ?? filePath);
      setCurrentFilePath(filePath);
      setView('reader');

      setCurrentComicId(comicId);
      currentComicIdRef.current = comicId;

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
    setBookReader(null);
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
    const unsub = onFileOpened(openFile);
    return unsub;
  }, [openFile]);

  useEffect(() => {
    const unsub = onOpenSettings(() => setSettingsOpen(true));
    return unsub;
  }, []);

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
        <ErrorBoundary name="LibraryView">
          <LibraryView
            activeLibraryId={activeLibraryId}
            activeFolderId={activeFolderId}
            activeView={activeView}
            onOpenFile={openFile}
            onComicsChanged={handleLibrariesChanged}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            refreshKey={libraryRefreshKey}
          />
        </ErrorBoundary>
        <LibrarySidebar
          key={sidebarRefreshKey.current}
          activeLibraryId={activeLibraryId}
          activeFolderId={activeFolderId}
          activeView={activeView}
          onSelectLibrary={setActiveLibraryId}
          onSelectFolder={setActiveFolderId}
          onSelectView={setActiveView}
          onLibrariesChanged={handleLibrariesChanged}
        />
      </div>

      {view === 'epub-reader' && bookReader?.kind === 'epub-reader' && (
        <ErrorBoundary name="EpubReaderView">
          <EpubReaderView
            filePath={bookReader.filePath}
            comicId={bookReader.comicId}
            initialLocation={bookReader.initialLocation}
            onBack={backToLibrary}
          />
        </ErrorBoundary>
      )}

      {view === 'pdf-reader' && bookReader?.kind === 'pdf-reader' && (
        <ErrorBoundary name="PdfReaderView">
          <PdfReaderView
            filePath={bookReader.filePath}
            comicId={bookReader.comicId}
            initialPage={bookReader.initialPage}
            onBack={backToLibrary}
          />
        </ErrorBoundary>
      )}

      {view === 'reader' && (
        <ErrorBoundary name="ReaderView">
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
        </ErrorBoundary>
      )}

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {confirmModal}
    </>
  );
};
