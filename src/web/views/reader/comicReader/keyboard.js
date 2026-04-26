/**
 * views/reader/comicReader/keyboard.js — keyboard shortcuts for the reader.
 *
 * Returns an unmount function that unregisters the listener.
 */

import { MAX_SCALE } from './gestures.js';

export function wireKeyboard({
  comicState, pan,
  applyTransform, resetTransform,
  pageStep, gotoPage, pageCount,
  zoomBtn, fsBtn, bmBtn, spreadBtn,
}) {
  const onKey = (e) => {
    switch (e.key) {
      case 'ArrowRight': case ' ':
        e.preventDefault();
        gotoPage(comicState.currentPage + pageStep(), { animDir: 1 });
        break;
      case 'ArrowLeft': case 'Backspace':
        e.preventDefault();
        gotoPage(comicState.currentPage - pageStep(), { animDir: -1 });
        break;
      case 'Home': e.preventDefault(); gotoPage(0); break;
      case 'End':  e.preventDefault(); gotoPage(pageCount - 1); break;
      case 'f': case 'F': fsBtn.click(); break;
      case 'z': case 'Z': zoomBtn.click(); break;
      case 'b': case 'B': bmBtn.click(); break;
      case 's': case 'S': spreadBtn.click(); break;
      case '+': case '=':
        pan.scale = Math.min(MAX_SCALE, pan.scale + 0.25);
        applyTransform();
        break;
      case '-': case '_':
        pan.scale = Math.max(1, pan.scale - 0.25);
        if (pan.scale <= 1.001) resetTransform();
        else applyTransform();
        break;
      case '0': resetTransform(); break;
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
