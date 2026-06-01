import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useUiStore } from '@/store/uiStore';
import * as api from '@/lib/api';
import Breadcrumb from '@/components/library/Breadcrumb';
import FilterStrips from '@/components/library/FilterStrips';
import LibraryGrid from '@/components/library/LibraryGrid';
import SelectionBar from '@/components/library/SelectionBar';
import { GROUP_NONE_KEY, itemCountLabel } from '@/lib/utils';

const PAGE_SIZE = 48;

function useBrowseRouteOptions() {
  const {
    mediaType,
    sortBy,
    search,
    fileExt,
    readStatus,
    favoritesOnly,
  } = useUiStore();

  const groupFilters = {
    mediaType: mediaType || undefined,
    search: search || undefined,
    fileExt: fileExt || undefined,
    readStatus: readStatus || undefined,
    favorites: favoritesOnly ? true : undefined,
  };

  const queryOpts = {
    mediaType: mediaType || undefined,
    sortBy: sortBy || 'title',
    sortOrder: (sortBy === 'dateAdded' || sortBy === 'lastRead') ? 'desc' : undefined,
    fileExt: fileExt || undefined,
    readStatus: readStatus || undefined,
    favorites: favoritesOnly ? true : undefined,
  };

  return { groupFilters, queryOpts };
}

// 1. Browse Series Page — renders volumes + unnumbered issues mixed view or flat comics if single unnumbered
export function BrowseSeriesPage() {
  const { k } = useParams<{ k: string }>();
  const seriesKey = k || '';
  const { groupFilters, queryOpts } = useBrowseRouteOptions();

  // Fetch volume groups
  const { data: volumesResponse, isLoading: isLoadingVolumes } = useQuery({
    queryKey: ['browse-volumes', seriesKey, groupFilters],
    queryFn: () => api.fetchBrowseSeriesVolumes(seriesKey, groupFilters),
    enabled: !!seriesKey,
  });

  const allVolumeGroups = volumesResponse?.groups || [];
  const isSingleUnnumbered = allVolumeGroups.length === 1 && allVolumeGroups[0].key === GROUP_NONE_KEY;

  // Query 1a: Infinite flat comics (if single unnumbered)
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['browse-volume-comics-flat', seriesKey, GROUP_NONE_KEY, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchBrowseVolumeComics(seriesKey, GROUP_NONE_KEY, {
        ...queryOpts,
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
    enabled: !!seriesKey && isSingleUnnumbered,
  });

  // Query 1b: Mixed unnumbered issues list (if not single unnumbered volume)
  const { data: unnumberedResponse, isLoading: isLoadingUnnumbered } = useQuery({
    queryKey: ['browse-volume-comics-unnumbered', seriesKey, GROUP_NONE_KEY, queryOpts],
    queryFn: () => api.fetchBrowseVolumeComics(seriesKey, GROUP_NONE_KEY, {
      ...queryOpts,
      limit: 200,
    }),
    enabled: !!seriesKey && !isSingleUnnumbered && allVolumeGroups.some(g => g.key === GROUP_NONE_KEY),
  });

  const flatComics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  const unnumberedComics = unnumberedResponse?.records || [];
  const namedVolumes = allVolumeGroups.filter((g) => g.key !== GROUP_NONE_KEY);

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-4 border-b border-border bg-card/10 select-none flex items-center justify-between">
        <Breadcrumb />
        <span className="text-xs text-muted-foreground">
          {isSingleUnnumbered
            ? itemCountLabel(infiniteQuery.data?.pages[0]?.totalCount || 0)
            : itemCountLabel(namedVolumes.length + unnumberedComics.length)}
        </span>
      </div>

      <FilterStrips />

      <div className="flex-1">
        {isSingleUnnumbered ? (
          <LibraryGrid
            comics={flatComics}
            isLoading={infiniteQuery.isLoading}
            fetchNextPage={infiniteQuery.fetchNextPage}
            hasNextPage={infiniteQuery.hasNextPage}
            isFetchingNextPage={infiniteQuery.isFetchingNextPage}
            emptyMessage="No issues found in this series."
          />
        ) : (
          <LibraryGrid
            groups={namedVolumes}
            comics={unnumberedComics}
            badgeLabel="Volume"
            groupHrefPrefix={`/browse/series/${encodeURIComponent(seriesKey)}/volume/`}
            isLoading={isLoadingVolumes || isLoadingUnnumbered}
            emptyMessage="No volumes or issues found in this series matching the filters."
          />
        )}
      </div>

      <SelectionBar />
    </div>
  );
}

// 2. Browse Volume Page — renders chapters list OR flat comics if shouldShowChapters is false
export function BrowseVolumePage() {
  const { k, v } = useParams<{ k: string; v: string }>();
  const seriesKey = k || '';
  const volumeKey = v || '';
  const { groupFilters, queryOpts } = useBrowseRouteOptions();

  // Fetch chapters
  const { data: chaptersResponse, isLoading: isLoadingChapters } = useQuery({
    queryKey: ['browse-chapters', seriesKey, volumeKey, groupFilters],
    queryFn: () => api.fetchBrowseVolumeChapters(seriesKey, volumeKey, groupFilters),
    enabled: !!seriesKey && !!volumeKey,
  });

  const chapterGroups = chaptersResponse?.groups || [];
  const shouldShowChapters =
    chapterGroups.length > 1 ||
    (chapterGroups.length === 1 && chapterGroups[0].key !== GROUP_NONE_KEY && chapterGroups[0].count > 1);

  // Fetch flat comics if we skip chapters
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['browse-volume-comics-flat', seriesKey, volumeKey, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchBrowseVolumeComics(seriesKey, volumeKey, {
        ...queryOpts,
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
    enabled: !!seriesKey && !!volumeKey && !shouldShowChapters,
  });

  const flatComics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  const chaptersWithHref = chapterGroups.map((g) => ({
    ...g,
    href: g.singleComicId && g.count === 1
      ? `/read/${g.singleComicId}`
      : `/browse/series/${encodeURIComponent(seriesKey)}/volume/${encodeURIComponent(volumeKey)}/chapter/${encodeURIComponent(g.key)}`,
  }));

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-4 border-b border-border bg-card/10 select-none flex items-center justify-between">
        <Breadcrumb />
        <span className="text-xs text-muted-foreground">
          {shouldShowChapters
            ? itemCountLabel(chapterGroups.length)
            : itemCountLabel(infiniteQuery.data?.pages[0]?.totalCount || 0)}
        </span>
      </div>

      <FilterStrips />

      <div className="flex-1">
        {shouldShowChapters ? (
          <LibraryGrid
            groups={chaptersWithHref}
            badgeLabel="Chapter"
            isLoading={isLoadingChapters}
            emptyMessage="No chapters found in this volume."
          />
        ) : (
          <LibraryGrid
            comics={flatComics}
            isLoading={infiniteQuery.isLoading}
            fetchNextPage={infiniteQuery.fetchNextPage}
            hasNextPage={infiniteQuery.hasNextPage}
            isFetchingNextPage={infiniteQuery.isFetchingNextPage}
            emptyMessage="No issues found in this volume matching the current filters."
          />
        )}
      </div>

      <SelectionBar />
    </div>
  );
}

// 3. Browse Chapter Page — renders flat comics inside chapter
export function BrowseChapterPage() {
  const { k, v, c } = useParams<{ k: string; v: string; c: string }>();
  const seriesKey = k || '';
  const volumeKey = v || '';
  const chapterKey = c || '';
  const { queryOpts } = useBrowseRouteOptions();

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['browse-chapter-comics', seriesKey, volumeKey, chapterKey, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchBrowseChapterComics(seriesKey, volumeKey, chapterKey, {
        ...queryOpts,
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
    enabled: !!seriesKey && !!volumeKey && !!chapterKey,
  });

  const comics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-4 border-b border-border bg-card/10 select-none flex items-center justify-between">
        <Breadcrumb />
        <span className="text-xs text-muted-foreground">
          {itemCountLabel(infiniteQuery.data?.pages[0]?.totalCount || 0)}
        </span>
      </div>

      <FilterStrips />

      <div className="flex-1">
        <LibraryGrid
          comics={comics}
          isLoading={infiniteQuery.isLoading}
          fetchNextPage={infiniteQuery.fetchNextPage}
          hasNextPage={infiniteQuery.hasNextPage}
          isFetchingNextPage={infiniteQuery.isFetchingNextPage}
          emptyMessage="No issues found in this chapter matching the current filters."
        />
      </div>

      <SelectionBar />
    </div>
  );
}
