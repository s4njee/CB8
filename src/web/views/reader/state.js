/**
 * views/reader/state.js — Shared mutable state + wake-lock helpers.
 *
 * The reader submodules all mutate a single session object so destroyReader
 * can tear down the right things regardless of which format was loaded.
 */

export const state = {
  readerEl: null,
  comicState: null,
  epubBook: null,
  epubRendition: null,
  pdfDoc: null,
  pdfCurrentPage: 1,
  touchStartX: 0,
  touchStartY: 0,
};

let wakeLockSentinel = null;

export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener?.('release', () => { wakeLockSentinel = null; });
  } catch { /* user may have denied, or tab not active */ }
}

export function releaseWakeLock() {
  if (wakeLockSentinel) {
    try { wakeLockSentinel.release(); } catch { /* ignore */ }
    wakeLockSentinel = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.comicState && !wakeLockSentinel) {
    acquireWakeLock();
  }
});
