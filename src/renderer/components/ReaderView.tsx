import React, { useEffect, useState, useCallback, useRef } from 'react';
import { scaleToFit } from '../../shared/scaleFit';
import { generateWindowTitle } from '../../shared/windowTitle';
import { archivePage, toggleFullscreen, exitFullscreen } from '../ipcClient';
import { useNavigation } from './useNavigation';
import { StatusBar } from './StatusBar';

const DEFAULT_TITLE = 'CB8';

interface ReaderViewProps {
  filePath: string | null;
  pageCount: number;
}

export const ReaderView: React.FC<ReaderViewProps> = ({ filePath, pageCount }) => {
  const nav = useNavigation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync page count from props into navigation
  useEffect(() => {
    nav.setTotalPages(pageCount);
  }, [pageCount]);

  // Window title
  useEffect(() => {
    document.title = filePath ? generateWindowTitle(filePath) : DEFAULT_TITLE;
    return () => { document.title = DEFAULT_TITLE; };
  }, [filePath]);

  // Fetch page image
  useEffect(() => {
    if (pageCount <= 0) { setImageUrl(null); return; }
    let revoked = false;
    archivePage(nav.currentPage).then((res) => {
      if (revoked) return;
      if ('error' in res) { setImageUrl(null); return; }
      setImageUrl(res.dataUrl);
    });
    return () => { revoked = true; };
  }, [nav.currentPage, pageCount]);

  // Resize listener
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keyboard handling
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight': case ' ':       nav.nextPage(); break;
      case 'ArrowLeft':  case 'Backspace': nav.previousPage(); break;
      case 'Home':  nav.firstPage(); break;
      case 'End':   nav.lastPage(); break;
      case 'F11':   toggleFullscreen(); break;
      case 'Escape': exitFullscreen(); break;
      default: return;
    }
    e.preventDefault();
  }, [nav]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Compute scaled dimensions
  const display = naturalSize
    ? scaleToFit(naturalSize.w, naturalSize.h, viewport.w, viewport.h)
    : null;

  return (
    <div
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          style={display ? { width: display.width, height: display.height } : undefined}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          onDoubleClick={() => toggleFullscreen()}
          alt=""
        />
      )}
      <StatusBar currentPage={nav.currentPage} totalPages={nav.totalPages} />
    </div>
  );
};
