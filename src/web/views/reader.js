/**
 * views/reader.js — Public entry for the unified reader view.
 *
 * Dispatches to the comic/epub/pdf submodules under views/reader/ based on
 * the item's media type and extension. Keeps the module surface small:
 * only `renderReader` and `destroyReader` are exported.
 */

import * as api from '../api.js';
import { state } from './reader/state.js';
import { guessExtension } from './reader/utils.js';
import { renderComicReader } from './reader/comicReader.js';
import { renderEpubReader } from './reader/epubReader.js';
import { renderPdfReader } from './reader/pdfReader.js';

export async function renderReader(el, comicId, initialPage, onBack, backHref = '#/') {
  state.readerEl = el;
  el.innerHTML = '';

  let record;
  try {
    record = await api.fetchComic(comicId);
  } catch (err) {
    console.error('[CB8] Failed to fetch comic record:', err);
    el.innerHTML = '<div class="empty-state"><p>Failed to load item.</p></div>';
    return;
  }

  let ext = record.fileExt;
  if (!ext) {
    ext = guessExtension(record);
  }

  if (record.mediaType === 'comic') {
    await renderComicReader(el, record, initialPage, onBack, backHref);
  } else if (ext === 'epub') {
    await renderEpubReader(el, record, onBack, backHref);
  } else if (ext === 'pdf') {
    await renderPdfReader(el, record, initialPage, onBack, backHref);
  } else {
    el.innerHTML = `<div class="empty-state"><p>The .${ext || 'unknown'} format cannot be read in the browser.</p></div>`;
  }
}

export function destroyReader() {
  if (state.readerEl?._cleanupKey) { state.readerEl._cleanupKey(); state.readerEl._cleanupKey = null; }
  if (state.epubRendition) { try { state.epubRendition.destroy(); } catch {} state.epubRendition = null; }
  if (state.epubBook) { try { state.epubBook.destroy(); } catch {} state.epubBook = null; }
  state.pdfDoc = null;
  state.comicState = null;
  if (state.readerEl) state.readerEl.innerHTML = '';
}
