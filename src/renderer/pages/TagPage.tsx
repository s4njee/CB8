import React from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useUiStore } from '@/store/uiStore';
import * as api from '@/lib/api';
import LibraryGrid from '@/components/library/LibraryGrid';
import FilterStrips from '@/components/library/FilterStrips';
import SelectionBar from '@/components/library/SelectionBar';
import Breadcrumb from '@/components/library/Breadcrumb';
import { itemCountLabel } from '@/lib/utils';

const PAGE_SIZE = 48;

export default function TagPage() {
  const { name } = useParams<{ name: string }>();

  const {
    mediaType,
    sortBy,
    fileExt,
    readStatus,
    favoritesOnly,
  } = useUiStore();

  const filters: Record<string, any> = {
    tag: name,
    mediaType: mediaType || undefined,
    sortBy: sortBy || undefined,
    sortOrder: (sortBy === 'dateAdded' || sortBy === 'lastRead') ? 'desc' : undefined,
    fileExt: fileExt || undefined,
    readStatus: readStatus || undefined,
  };
  if (favoritesOnly) {
    filters.favorites = true;
  }

  // Infinite query for tag filtered list
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['tag-comics', name, filters],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchComics({
        ...filters,
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

  const comics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header section */}
      <div className="p-4 border-b border-border bg-card/10 select-none flex items-center justify-between">
        <Breadcrumb />
        <span className="text-xs text-muted-foreground">
          {itemCountLabel(infiniteQuery.data?.pages[0]?.totalCount || 0)}
        </span>
      </div>

      {/* Filter controls */}
      <FilterStrips />

      {/* Infinite Grid */}
      <div className="flex-1">
        <LibraryGrid
          comics={comics}
          isLoading={infiniteQuery.isLoading}
          fetchNextPage={infiniteQuery.fetchNextPage}
          hasNextPage={infiniteQuery.hasNextPage}
          isFetchingNextPage={infiniteQuery.isFetchingNextPage}
          emptyMessage="No items found with this tag matching the current filters."
        />
      </div>

      <SelectionBar />
    </div>
  );
}
