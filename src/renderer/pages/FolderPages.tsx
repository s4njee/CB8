import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/uiStore';
import * as api from '@/lib/api';
import Breadcrumb from '@/components/library/Breadcrumb';
import FilterStrips from '@/components/library/FilterStrips';
import LibraryGrid from '@/components/library/LibraryGrid';
import SelectionBar from '@/components/library/SelectionBar';
import { GROUP_NONE_KEY, itemCountLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { useSelectionStore } from '@/store/selectionStore';
import { Pencil, Trash2, XCircle } from 'lucide-react';

const PAGE_SIZE = 48;

function useFolderRouteOptions() {
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

// 1. Folder Page — renders series grouped cards inside folder
export function FolderPage() {
  const { id } = useParams<{ id: string }>();
  const folderId = Number(id);
  const { groupFilters } = useFolderRouteOptions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
  });
  const activeFolder = folders.find((folder) => folder.id === folderId);

  const { data: folderSeriesResponse, isLoading } = useQuery({
    queryKey: ['folder-series', folderId, groupFilters],
    queryFn: () => api.fetchFolderSeries(folderId, groupFilters),
    enabled: !isNaN(folderId),
  });

  const groups = folderSeriesResponse?.groups || [];

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.renameFolder(folderId, name),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success('Folder renamed');
    },
    onError: (err) => toast.error(`Rename failed: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFolder(folderId),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success('Folder deleted');
      navigate('/', { replace: true });
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const removeSelectedMutation = useMutation({
    mutationFn: () => api.removeComicsFromFolder(folderId, selectedIds),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success(`Removed ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'} from folder`);
      clearSelection();
    },
    onError: (err) => toast.error(`Remove failed: ${err.message}`),
  });

  const handleRename = () => {
    if (!activeFolder) return;
    const nextName = window.prompt('Rename folder', activeFolder.name)?.trim();
    if (!nextName || nextName === activeFolder.name) return;
    renameMutation.mutate(nextName);
  };

  const handleDelete = () => {
    if (!activeFolder) return;
    const confirmed = window.confirm(
      `Delete folder "${activeFolder.name}"? Items stay in the library.`
    );
    if (confirmed) deleteMutation.mutate();
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-4 border-b border-border bg-card/10 select-none flex items-center justify-between">
        <Breadcrumb />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {itemCountLabel(groups.length)}
          </span>
          {activeFolder && (
            <>
              {selectedIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeSelectedMutation.mutate()}
                  className="h-8 border-border bg-secondary text-foreground gap-1.5"
                  disabled={removeSelectedMutation.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Remove Selected</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRename}
                className="h-8 border-border bg-secondary text-foreground gap-1.5"
                disabled={renameMutation.isPending || deleteMutation.isPending}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rename</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="h-8 border-border bg-secondary text-destructive hover:text-destructive gap-1.5"
                disabled={renameMutation.isPending || deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <FilterStrips />

      <div className="flex-1">
        <LibraryGrid
          groups={groups}
          badgeLabel="Series"
          groupHrefPrefix={`/folder/${folderId}/series/`}
          isLoading={isLoading}
          emptyMessage="No series found in this folder matching the current filters."
        />
      </div>

      <SelectionBar />
    </div>
  );
}

// 2. Folder Series Page — renders volumes + unnumbered issues mixed view or flat comics if single unnumbered
export function FolderSeriesPage() {
  const { id, k } = useParams<{ id: string; k: string }>();
  const folderId = Number(id);
  const seriesKey = k || '';
  const { groupFilters, queryOpts } = useFolderRouteOptions();

  // Fetch volume groups
  const { data: volumesResponse, isLoading: isLoadingVolumes } = useQuery({
    queryKey: ['folder-volumes', folderId, seriesKey, groupFilters],
    queryFn: () => api.fetchFolderSeriesVolumes(folderId, seriesKey, groupFilters),
    enabled: !isNaN(folderId) && !!seriesKey,
  });

  const allVolumeGroups = volumesResponse?.groups || [];
  const isSingleUnnumbered = allVolumeGroups.length === 1 && allVolumeGroups[0].key === GROUP_NONE_KEY;

  // Query 2a: Infinite flat comics (if single unnumbered)
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['folder-volume-comics-flat', folderId, seriesKey, GROUP_NONE_KEY, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchFolderVolumeComics(folderId, seriesKey, GROUP_NONE_KEY, {
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
    enabled: !isNaN(folderId) && !!seriesKey && isSingleUnnumbered,
  });

  // Query 2b: Mixed unnumbered issues list (if not single unnumbered volume)
  const { data: unnumberedResponse, isLoading: isLoadingUnnumbered } = useQuery({
    queryKey: ['folder-volume-comics-unnumbered', folderId, seriesKey, GROUP_NONE_KEY, queryOpts],
    queryFn: () => api.fetchFolderVolumeComics(folderId, seriesKey, GROUP_NONE_KEY, {
      ...queryOpts,
      limit: 200,
    }),
    enabled: !isNaN(folderId) && !!seriesKey && !isSingleUnnumbered && allVolumeGroups.some(g => g.key === GROUP_NONE_KEY),
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
            groupHrefPrefix={`/folder/${folderId}/series/${encodeURIComponent(seriesKey)}/volume/`}
            isLoading={isLoadingVolumes || isLoadingUnnumbered}
            emptyMessage="No volumes or issues found in this series matching the filters."
          />
        )}
      </div>

      <SelectionBar />
    </div>
  );
}

// 3. Folder Volume Page — renders chapters list OR flat comics if shouldShowChapters is false
export function FolderVolumePage() {
  const { id, k, v } = useParams<{ id: string; k: string; v: string }>();
  const folderId = Number(id);
  const seriesKey = k || '';
  const volumeKey = v || '';
  const { groupFilters, queryOpts } = useFolderRouteOptions();

  // Fetch chapters
  const { data: chaptersResponse, isLoading: isLoadingChapters } = useQuery({
    queryKey: ['folder-chapters', folderId, seriesKey, volumeKey, groupFilters],
    queryFn: () => api.fetchFolderVolumeChapters(folderId, seriesKey, volumeKey, groupFilters),
    enabled: !isNaN(folderId) && !!seriesKey && !!volumeKey,
  });

  const chapterGroups = chaptersResponse?.groups || [];
  const shouldShowChapters =
    chapterGroups.length > 1 ||
    (chapterGroups.length === 1 && chapterGroups[0].key !== GROUP_NONE_KEY && chapterGroups[0].count > 1);

  // Fetch flat comics if we skip chapters
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['folder-volume-comics-flat', folderId, seriesKey, volumeKey, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchFolderVolumeComics(folderId, seriesKey, volumeKey, {
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
    enabled: !isNaN(folderId) && !!seriesKey && !!volumeKey && !shouldShowChapters,
  });

  const flatComics = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.records)
    : [];

  const chaptersWithHref = chapterGroups.map((g) => ({
    ...g,
    href: g.singleComicId && g.count === 1
      ? `/read/${g.singleComicId}`
      : `/folder/${folderId}/series/${encodeURIComponent(seriesKey)}/volume/${encodeURIComponent(volumeKey)}/chapter/${encodeURIComponent(g.key)}`,
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

// 4. Folder Chapter Page — renders flat comics inside chapter
export function FolderChapterPage() {
  const { id, k, v, c } = useParams<{ id: string; k: string; v: string; c: string }>();
  const folderId = Number(id);
  const seriesKey = k || '';
  const volumeKey = v || '';
  const chapterKey = c || '';
  const { queryOpts } = useFolderRouteOptions();

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['folder-chapter-comics', folderId, seriesKey, volumeKey, chapterKey, queryOpts],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchFolderChapterComics(folderId, seriesKey, volumeKey, chapterKey, {
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
    enabled: !isNaN(folderId) && !!seriesKey && !!volumeKey && !!chapterKey,
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
