import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useReaderStore } from '@/store/readerStore';
import * as api from '@/lib/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

interface PdfReaderProps {
  record: api.WebComicRecord;
  initialPage: number;
  setExtraControls?: (controls: React.ReactNode) => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export default function PdfReader({
  record,
  initialPage,
  setExtraControls,
}: PdfReaderProps) {
  const { currentPage, setCurrentPage } = useReaderStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Loading States
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pageRendering, setPageRendering] = useState(false);

  // PDF state refs
  const pdfDocRef = useRef<any>(null);
  const touchStartXRef = useRef<number>(0);
  const renderTaskRef = useRef<any>(null);

  // 1. Load PDF.js CDN libs
  useEffect(() => {
    async function loadLibs() {
      try {
        const windowLib = (window as any).pdfjsLib;
        if (!windowLib) {
          await loadScript(PDFJS_CDN);
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        }
        setLibsLoaded(true);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load PDF libraries.');
        setPdfLoading(false);
      }
    }
    loadLibs();
  }, []);

  // 2. Fetch and Load PDF Document
  useEffect(() => {
    if (!libsLoaded) return;

    let active = true;

    async function loadPdf() {
      try {
        setPdfLoading(true);
        const fileUrl = api.fileUrl(record.id);
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching PDF file`);
        const arrayBuffer = await resp.arrayBuffer();

        const windowLib = (window as any).pdfjsLib;
        if (!windowLib) throw new Error('PDFJS library not initialized');

        const pdf = await windowLib.getDocument({ data: arrayBuffer }).promise;
        if (!active) return;

        pdfDocRef.current = pdf;

        // Restore page progress
        const startPage = Math.max(1, Math.min(pdf.numPages, initialPage));
        setCurrentPage(startPage);

        setPdfLoading(false);
      } catch (err: any) {
        if (!active) return;
        toast.error(err.message || 'Failed to load PDF document.');
        setPdfLoading(false);
      }
    }

    loadPdf();

    return () => {
      active = false;
      pdfDocRef.current = null;
    };
  }, [libsLoaded, record.id, initialPage, setCurrentPage]);

  // 3. Render page onto Canvas (high-DPI scale matching device pixels)
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    try {
      setPageRendering(true);

      // Cancel any ongoing rendering tasks
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';

      renderTaskRef.current = page.render({
        canvasContext: ctx,
        viewport,
      });

      await renderTaskRef.current.promise;
      renderTaskRef.current = null;
      setPageRendering(false);
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('PDF rendering failed:', err);
      }
      setPageRendering(false);
    }
  }, []);

  // 4. Page change trigger (renders page, updates progress)
  useEffect(() => {
    if (pdfLoading) return;
    renderPage(currentPage);
    api.updateProgress(record.id, currentPage - 1).catch(() => {});
  }, [currentPage, pdfLoading, renderPage, record.id]);

  // 5. Navigation event handlers
  const handlePrevPage = useCallback(() => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    setCurrentPage(Math.max(1, currentPage - 1));
  }, [currentPage, setCurrentPage]);

  const handleNextPage = useCallback(() => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    setCurrentPage(Math.min(pdf.numPages, currentPage + 1));
  }, [currentPage, setCurrentPage, record.pageCount]);

  // Keypress event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pdfDocRef.current) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        handlePrevPage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevPage, handleNextPage]);

  // Tap-zone inside canvas wrapper
  const handleCanvasClick = (e: React.MouseEvent) => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const x = e.clientX / wrap.clientWidth;
    if (x < 0.33) {
      handlePrevPage();
    } else if (x > 0.67) {
      handleNextPage();
    }
  };

  // Swipes inside canvas wrapper
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) {
        handleNextPage();
      } else {
        handlePrevPage();
      }
    }
  };

  // 6. Log history opened/closed
  useEffect(() => {
    api.logHistory(record.id, 'opened', initialPage - 1).catch(() => {});
    return () => {
      const pageNum = useReaderStore.getState().currentPage;
      api.logHistory(record.id, 'closed', pageNum - 1).catch(() => {});
    };
  }, [record.id, initialPage]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 gap-3">
        <p className="text-sm font-semibold text-red-500">{loadError}</p>
      </div>
    );
  }

  if (pdfLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 select-none">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Opening PDF...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleCanvasClick}
      className="w-full h-full relative overflow-hidden flex items-center justify-center bg-zinc-950/40 p-4"
    >
      <div className="relative max-h-full max-w-full flex items-center justify-center shadow-2xl rounded overflow-hidden select-none border border-zinc-800 bg-[#141414]">
        <canvas
          ref={canvasRef}
          id="pdf-canvas"
          className={cn(
            "object-contain select-none transition-opacity duration-150",
            pageRendering ? "opacity-40" : "opacity-100"
          )}
        />
        {pageRendering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}
      </div>
    </div>
  );
}
