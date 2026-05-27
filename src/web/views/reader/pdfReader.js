/**
 * views/reader/pdfReader.js — PDF rendering via pdf.js (loaded from CDN).
 */

import * as api from '../../api.js';
import { showToast } from '../../app.js';
import { state } from './state.js';
import { buildToolbar, loadScript } from './utils.js';

const PDFJS_CDN        = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

export async function renderPdfReader(el, record, initialPage, onBack, backHref = '#/') {
  const toolbar = buildToolbar(record.title, onBack, backHref);
  const bookContainer = document.createElement('div');
  bookContainer.className = 'book-reader';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'pdf-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.id = 'pdf-canvas';

  const pageLabel = toolbar.querySelector('.toolbar-pages');
  const slider = toolbar.querySelector('.reader-page-slider');

  canvasWrap.appendChild(canvas);
  bookContainer.appendChild(canvasWrap);
  el.appendChild(toolbar);
  el.appendChild(bookContainer);

  try {
    if (!window.pdfjsLib) {
      await loadScript(PDFJS_CDN);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }

    const fileResp = await fetch(api.fileUrl(record.id));
    if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status} fetching PDF`);
    const arrayBuffer = await fileResp.arrayBuffer();

    state.pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    state.pdfCurrentPage = Math.max(1, Math.min(state.pdfDoc.numPages, (initialPage ?? record.lastPage ?? 0) + 1));

    if (slider) {
      slider.min = 1;
      slider.max = state.pdfDoc.numPages;
      slider.addEventListener('input', () => {
        state.pdfCurrentPage = parseInt(slider.value, 10);
        renderPage();
      });
    }

    async function renderPage() {
      const page = await state.pdfDoc.getPage(state.pdfCurrentPage);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: dpr });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      if (pageLabel) pageLabel.textContent = `${state.pdfCurrentPage} / ${state.pdfDoc.numPages}`;
      if (slider) slider.value = state.pdfCurrentPage;
      api.updateProgress(record.id, state.pdfCurrentPage - 1).catch(() => {});
    }

    const onKey = (e) => {
      if (!state.pdfDoc) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        state.pdfCurrentPage = Math.min(state.pdfDoc.numPages, state.pdfCurrentPage + 1);
        renderPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        state.pdfCurrentPage = Math.max(1, state.pdfCurrentPage - 1);
        renderPage();
      }
    };
    document.addEventListener('keydown', onKey);
    state.readerEl._cleanupKey = () => document.removeEventListener('keydown', onKey);

    canvasWrap.addEventListener('touchstart', (e) => {
      state.touchStartX = e.touches[0].clientX;
    }, { passive: true });
    canvasWrap.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - state.touchStartX;
      if (Math.abs(dx) > 50) {
        state.pdfCurrentPage = Math.min(state.pdfDoc.numPages, Math.max(1, state.pdfCurrentPage + (dx < 0 ? 1 : -1)));
        renderPage();
      }
    }, { passive: true });

    canvasWrap.addEventListener('click', (e) => {
      const x = e.clientX / canvasWrap.clientWidth;
      if (x < 0.33)      state.pdfCurrentPage = Math.max(1, state.pdfCurrentPage - 1);
      else if (x > 0.67) state.pdfCurrentPage = Math.min(state.pdfDoc.numPages, state.pdfCurrentPage + 1);
      renderPage();
    });

    await renderPage();
    if ((initialPage ?? record.lastPage ?? 0) > 0) showToast(`Resuming from page ${state.pdfCurrentPage}`);

  } catch (err) {
    console.error('[CB8] PDF render error:', err);
    canvasWrap.innerHTML = `<div class="empty-state"><p>Failed to render PDF: ${err?.message ?? err}</p></div>`;
  }
}
