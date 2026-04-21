import { useState, useCallback } from 'react';

export interface UseNavigationResult {
  currentPage: number;
  totalPages: number;
  setTotalPages: (n: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToPage: (index: number) => void;
}

export function useNavigation(): UseNavigationResult {
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPagesRaw] = useState(0);

  const setTotalPages = useCallback((n: number) => {
    setTotalPagesRaw(n);
    setCurrentPage(0);
  }, []);

  const nextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, Math.max(totalPages - 1, 0)));
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  const firstPage = useCallback(() => setCurrentPage(0), []);

  const lastPage = useCallback(() => {
    setCurrentPage(Math.max(totalPages - 1, 0));
  }, [totalPages]);

  const goToPage = useCallback((index: number) => {
    setCurrentPage(Math.max(0, Math.min(index, Math.max(totalPages - 1, 0))));
  }, [totalPages]);

  return { currentPage, totalPages, setTotalPages, nextPage, previousPage, firstPage, lastPage, goToPage };
}
