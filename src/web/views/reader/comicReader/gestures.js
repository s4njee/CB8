/**
 * views/reader/comicReader/gestures.js — pinch-zoom / pan / swipe / dbltap.
 *
 * Mounted on the reader body. The pan object is mutated in place; callers
 * call applyTransform() / resetTransform() to flush state to the DOM.
 */

const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const mid = (a, b) => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});

const MAX_SCALE = 5;

export function wirePinchPanSwipe({
  readerBody, pan, applyTransform, resetTransform,
  prefs, comicState, gotoPage, pageDelta,
}) {
  let gesture = null;
  let lastTap = { t: 0, x: 0, y: 0 };

  readerBody.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      gesture = {
        kind: 'pinch',
        d0: dist(e.touches[0], e.touches[1]),
        c0: mid(e.touches[0], e.touches[1]),
        baseScale: pan.scale,
        baseTx: pan.tx,
        baseTy: pan.ty,
      };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (pan.scale > 1.001) {
        gesture = { kind: 'pan', x: t.clientX, y: t.clientY, baseTx: pan.tx, baseTy: pan.ty };
      } else {
        gesture = { kind: 'swipe', x: t.clientX, y: t.clientY, t0: Date.now() };
      }
    }
  }, { passive: false });

  readerBody.addEventListener('touchmove', (e) => {
    if (!gesture) return;
    if (gesture.kind === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const c = mid(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(MAX_SCALE, gesture.baseScale * (d / gesture.d0)));
      pan.scale = newScale;
      pan.tx = gesture.baseTx + (c.x - gesture.c0.x);
      pan.ty = gesture.baseTy + (c.y - gesture.c0.y);
      if (newScale <= 1.001) { pan.tx = 0; pan.ty = 0; }
      applyTransform();
    } else if (gesture.kind === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      pan.tx = gesture.baseTx + (t.clientX - gesture.x);
      pan.ty = gesture.baseTy + (t.clientY - gesture.y);
      applyTransform();
    }
  }, { passive: false });

  readerBody.addEventListener('touchend', (e) => {
    if (!gesture) return;
    if (gesture.kind === 'swipe' && e.changedTouches.length) {
      const tch = e.changedTouches[0];
      const dx = tch.clientX - gesture.x;
      const dy = tch.clientY - gesture.y;
      const duration = Date.now() - gesture.t0;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duration < 300) {
        const now = Date.now();
        if (now - lastTap.t < 300 && Math.hypot(tch.clientX - lastTap.x, tch.clientY - lastTap.y) < 40) {
          if (pan.scale > 1.001) {
            resetTransform();
          } else {
            const rect = readerBody.getBoundingClientRect();
            pan.scale = 2;
            pan.tx = (rect.width / 2 - (tch.clientX - rect.left));
            pan.ty = (rect.height / 2 - (tch.clientY - rect.top));
            applyTransform();
          }
          lastTap = { t: 0, x: 0, y: 0 };
        } else {
          lastTap = { t: now, x: tch.clientX, y: tch.clientY };
        }
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && pan.scale <= 1.001) {
        const swipeDir = dx < 0 ? 1 : -1;
        const step = prefs.spread === 'double' ? 2 : 1;
        gotoPage(comicState.currentPage + pageDelta(swipeDir) * step, { animDir: swipeDir });
      }
    }
    if (pan.scale < 1.001) resetTransform();
    gesture = null;
  }, { passive: true });
}

export { MAX_SCALE };
