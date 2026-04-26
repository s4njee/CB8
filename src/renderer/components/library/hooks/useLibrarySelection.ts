import { useRef, useCallback } from 'react';
import type { ComicEntry } from '../types';

interface UseLibrarySelectionParams {
  comics: ComicEntry[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
}

interface UseLibrarySelectionResult {
  handleComicClick: (e: React.MouseEvent, index: number) => void;
  handleCheckboxClick: (e: React.MouseEvent, comicId: number) => void;
  handleComicDragStart: (e: React.DragEvent, comicId: number) => void;
}

export function useLibrarySelection({
  comics,
  selectedIds,
  onSelectionChange,
}: UseLibrarySelectionParams): UseLibrarySelectionResult {
  const lastClickedIndex = useRef<number | null>(null);
  // Keep stable refs so callbacks don't need to re-close over changing state
  const comicsRef = useRef<ComicEntry[]>(comics);
  const selectedIdsRef = useRef<Set<number>>(selectedIds);
  comicsRef.current = comics;
  selectedIdsRef.current = selectedIds;

  const handleComicClick = useCallback((e: React.MouseEvent, index: number) => {
    const currentComics = comicsRef.current;
    const currentSelectedIds = selectedIdsRef.current;
    const comic = currentComics[index];
    if (!comic) return;

    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, index);
      const end = Math.max(lastClickedIndex.current, index);
      const next = new Set(currentSelectedIds);
      for (let i = start; i <= end; i++) next.add(currentComics[i].id);
      onSelectionChange(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(currentSelectedIds);
      if (next.has(comic.id)) next.delete(comic.id); else next.add(comic.id);
      onSelectionChange(next);
      lastClickedIndex.current = index;
    } else {
      // Plain click is select-only. Deselect via cmd/ctrl-click, the
      // selection-bar Cancel button, or by clicking empty grid space.
      // Toggling on the second click broke double-click-to-open: the
      // dblclick handler fired after the click had already deselected
      // the card, leaving the user with no selection and no reader.
      onSelectionChange(new Set([comic.id]));
      lastClickedIndex.current = index;
    }
  }, [onSelectionChange]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent, comicId: number) => {
    e.stopPropagation();
    const next = new Set(selectedIdsRef.current);
    if (next.has(comicId)) next.delete(comicId); else next.add(comicId);
    onSelectionChange(next);
  }, [onSelectionChange]);

  const handleComicDragStart = useCallback((e: React.DragEvent, comicId: number) => {
    let ids = selectedIdsRef.current;
    if (!ids.has(comicId)) { ids = new Set([comicId]); onSelectionChange(ids); }
    e.dataTransfer.setData('application/comic-ids', JSON.stringify(Array.from(ids)));
    e.dataTransfer.effectAllowed = 'link';
  }, [onSelectionChange]);

  return {
    handleComicClick,
    handleCheckboxClick,
    handleComicDragStart,
  };
}
