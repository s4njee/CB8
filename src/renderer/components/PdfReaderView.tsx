import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { scaleToFit } from '../../shared/scaleFit';
import { generateWindowTitle } from '../../shared/windowTitle';
import { readBookFile, updateReadingProgress, toggleFullscreen } from '../ipcClient';

const DEFAULT_TITLE = 'CB8';

declare global {
  interface Uint8Array {
    toHex?: () => string;
  }
}

function ensureUint8ArrayToHex(): void {
  if (typeof Uint8Array.prototype.toHex === 'function') return;
  Uint8Array.prototype.toHex = function toHex() {
    let hex = '';
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, '0');
    }
    return hex;
  };
}

interface Props {
  filePath: string;
  comicId: number | null;
  initialPage?: number;
  onBack: () => void;
}

export const PdfReaderView: React.FC<Props> = ({ filePath, comicId, initialPage = 0, onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(Math.max(0, initialPage));
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  const filename = useMemo(() => filePath.split('/').pop()?.split('\\').pop() ?? filePath, [filePath]);

  useEffect(() => {
    document.title = generateWindowTitle(filePath);
    return () => { document.title = DEFAULT_TITLE; };
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const bytes = await readBookFile(filePath);
        if (cancelled) return;

        ensureUint8ArrayToHex();
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = pdfjs.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage((prev) => Math.min(Math.max(prev, 0), Math.max(pdf.numPages - 1, 0)));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open PDF.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [filePath]);

  const renderPage = useCallback(async () => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!pdf || !canvas || !container || numPages === 0) return;

    const page = await pdf.getPage(currentPage + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const fit = scaleToFit(baseViewport.width, baseViewport.height, container.clientWidth, container.clientHeight);
    const scale = fit.width > 0 && baseViewport.width > 0 ? fit.width / baseViewport.width : 1;
    const viewportForRender = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    if (!context) return;

    renderTaskRef.current?.cancel();
    canvas.width = Math.max(1, Math.floor(viewportForRender.width * window.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(viewportForRender.height * window.devicePixelRatio));
    canvas.style.width = `${viewportForRender.width}px`;
    canvas.style.height = `${viewportForRender.height}px`;
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    const task = page.render({ canvasContext: context, viewport: viewportForRender, canvas });
    renderTaskRef.current = task;
    await task.promise;
    if (comicId != null) {
      updateReadingProgress(comicId, currentPage).catch(() => {});
    }
  }, [comicId, currentPage, numPages]);

  useEffect(() => {
    if (loading || error || numPages === 0) return;
    void renderPage();
  }, [loading, error, numPages, currentPage, renderPage]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (loading || error || numPages === 0) return;
    void renderPage();
  }, [viewport, loading, error, numPages, renderPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentPage((page) => Math.min(page + 1, Math.max(numPages - 1, 0)));
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        setCurrentPage((page) => Math.max(page - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentPage(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentPage(Math.max(numPages - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, onBack]);

  const navigate = useCallback((direction: 'next' | 'prev') => {
    setCurrentPage((page) => {
      if (direction === 'next') return Math.min(page + 1, Math.max(numPages - 1, 0));
      return Math.max(page - 1, 0);
    });
  }, [numPages]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const third = bounds.width / 3;
    if (x < third) navigate('prev');
    else if (x > third * 2) navigate('next');
  }, [navigate]);

  if (error) {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 18, marginBottom: 12 }}>{error}</div>
          <button onClick={onBack} style={{ backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: 4, padding: '8px 12px', cursor: 'pointer' }}>
            &larr; Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleClick}>
        <canvas ref={canvasRef} onDoubleClick={() => toggleFullscreen()} style={{ display: loading ? 'none' : 'block', maxWidth: '100%', maxHeight: '100%' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
        <div style={{ width: '33.333%', pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => navigate('prev')} />
        <div style={{ flex: 1, pointerEvents: 'none' }} />
        <div style={{ width: '33.333%', pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => navigate('next')} />
      </div>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
        <button onClick={onBack} style={{ backgroundColor: 'rgba(17,24,39,0.9)', color: '#fff', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 4, padding: '6px 10px', cursor: 'pointer' }}>
          &larr; Library
        </button>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 14px', backgroundColor: 'rgba(0,0,0,0.72)', color: '#e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 13, pointerEvents: 'none' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
          {filename}
        </span>
        <span>{numPages > 0 ? `${currentPage + 1} / ${numPages}` : ''}</span>
      </div>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3f4f6', backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }}>
          Loading...
        </div>
      )}
    </div>
  );
};
