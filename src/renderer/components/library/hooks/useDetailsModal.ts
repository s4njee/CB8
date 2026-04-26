import { useState, useCallback } from 'react';
import type { ComicEntry } from '../types';

/**
 * useDetailsModal — owns the comic-details modal state.
 *
 * The actual open/refresh flow stays in the component because it touches
 * the comics-list state owned by useLibraryQuery; this hook just keeps
 * the modal-specific state out of the main component body.
 */
export function useDetailsModal() {
  const [detailsComic, setDetailsComic] = useState<ComicEntry | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const closeDetails = useCallback(() => setDetailsComic(null), []);
  return { detailsComic, setDetailsComic, detailsLoading, setDetailsLoading, closeDetails };
}
