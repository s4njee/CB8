import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '@/store/uiStore';
import { useInfiniteComics } from '@/hooks/useInfiniteComics';
import * as api from '@/lib/api';
import ContinueShelf from '@/components/library/ContinueShelf';
import FilterStrips from '@/components/library/FilterStrips';
import LibraryGrid from '@/components/library/LibraryGrid';
import SelectionBar from '@/components/library/SelectionBar';

export default function AllPage() {
  const {
    mediaType,
    sortBy,
    search,
    fileExt,
    readStatus,
    favoritesOnly,
  } = useUiStore();

  const isSearchActive = search.trim() !== '';

  // 1. Query for standard infinite comics list (when search is empty)
  const infiniteQuery = useInfiniteComics({
    mediaType: mediaType || undefined,
    sortBy: sortBy || undefined,
    fileExt: fileExt || undefined,
    readStatus: readStatus || undefined,
    favoritesOnly: favoritesOnly || undefined,
  });

  // Flatten the infinite query pages into a single flat array of WebComicRecord
  const comics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  // 2. Query for global series-grouped browse list (when search is active)
  const { data: searchGroupsResponse, isLoading: searchLoading } = useQuery({
    queryKey: ['browse', 'series', { search }],
    queryFn: () => api.fetchBrowseSeries({ search }),
    enabled: isSearchActive,
    staleTime: 5000, // Refresh search results reasonably fast
  });

  const searchGroups = searchGroupsResponse?.groups || [];

  return (
    <div className="flex flex-col min-h-full">
      {isSearchActive ? (
        // Search View: Series-grouped Browse list
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-border bg-card/10 select-none">
            <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
              Search Results for: <span className="text-primary italic lowercase font-normal">"{search}"</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Found {searchGroupsResponse?.totalCount ?? 0} series match{searchGroupsResponse?.totalCount === 1 ? '' : 'es'}.
            </p>
          </div>
          <div className="flex-1">
            <LibraryGrid
              groups={searchGroups}
              badgeLabel="Series"
              groupHrefPrefix="/browse/series/"
              isLoading={searchLoading}
              emptyMessage="No matching series found for your query."
            />
          </div>
        </div>
      ) : (
        // Standard View: Shelf + Filter Strips + Paginated Grid
        <div className="flex-1 flex flex-col">
          {/* Continue reading shelf */}
          <ContinueShelf />

          {/* Core filters bar */}
          <FilterStrips />

          {/* Paginated Infinite Scroll grid */}
          <div className="flex-1">
            <LibraryGrid
              comics={comics}
              isLoading={infiniteQuery.isLoading}
              fetchNextPage={infiniteQuery.fetchNextPage}
              hasNextPage={infiniteQuery.hasNextPage}
              isFetchingNextPage={infiniteQuery.isFetchingNextPage}
              emptyMessage="No comics or books found matching the selected filters."
            />
          </div>
        </div>
      )}

      {/* Floating bulk selection actions bar */}
      <SelectionBar />
    </div>
  );
}
