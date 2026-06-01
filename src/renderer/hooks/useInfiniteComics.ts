import { useInfiniteQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

export const PAGE_SIZE = 48;

export function useInfiniteComics(filters: Record<string, any> = {}) {
  // Map 'favoritesOnly' boolean to the backend's expected query parameter 'favorites' (context.md §4)
  const queryParams: Record<string, any> = { ...filters };
  if (queryParams.favoritesOnly) {
    queryParams.favorites = true;
    delete queryParams.favoritesOnly;
  }
  // dateAdded and lastRead default to descending (context.md §16)
  if ((queryParams.sortBy === 'dateAdded' || queryParams.sortBy === 'lastRead') && !queryParams.sortOrder) {
    queryParams.sortOrder = 'desc';
  }

  return useInfiniteQuery({
    queryKey: ['comics', queryParams],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchComics({
        ...queryParams,
        limit: PAGE_SIZE,
        offset,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.length * PAGE_SIZE;
      if (loadedCount < lastPage.totalCount) {
        return allPages.length;
      }
      return undefined;
    },
  });
}
