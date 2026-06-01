import { useEffect } from 'react';

const MAX_SCALE = 5;

interface UseComicKeyboardOptions {
  onPrevPage: () => void;
  onNextPage: () => void;
  onFirstPage: () => void;
  onLastPage: () => void;
  onToggleFullscreen: () => void;
  onCycleZoom: () => void;
  onToggleBookmark: () => void;
  onToggleSpread: () => void;
  panRef: React.MutableRefObject<{ scale: number; tx: number; ty: number }>;
  applyTransform: () => void;
  resetTransform: () => void;
}

export default function useComicKeyboard({
  onPrevPage,
  onNextPage,
  onFirstPage,
  onLastPage,
  onToggleFullscreen,
  onCycleZoom,
  onToggleBookmark,
  onToggleSpread,
  panRef,
  applyTransform,
  resetTransform,
}: UseComicKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const pan = panRef.current;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          onNextPage();
          break;
        case 'ArrowLeft':
        case 'Backspace':
          e.preventDefault();
          onPrevPage();
          break;
        case 'Home':
          e.preventDefault();
          onFirstPage();
          break;
        case 'End':
          e.preventDefault();
          onLastPage();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          onToggleFullscreen();
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          onCycleZoom();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          onToggleBookmark();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          onToggleSpread();
          break;
        case '+':
        case '=':
          e.preventDefault();
          pan.scale = Math.min(MAX_SCALE, pan.scale + 0.25);
          applyTransform();
          break;
        case '-':
        case '_':
          e.preventDefault();
          pan.scale = Math.max(1, pan.scale - 0.25);
          if (pan.scale <= 1.001) {
            resetTransform();
          } else {
            applyTransform();
          }
          break;
        case '0':
          e.preventDefault();
          resetTransform();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    onPrevPage,
    onNextPage,
    onFirstPage,
    onLastPage,
    onToggleFullscreen,
    onCycleZoom,
    onToggleBookmark,
    onToggleSpread,
    panRef,
    applyTransform,
    resetTransform,
  ]);
}
