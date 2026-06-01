import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore, SortByFilter, ReadStatusFilter } from '@/store/uiStore';
import * as api from '@/lib/api';
import LibraryGrid from '@/components/library/LibraryGrid';
import FilterStrips from '@/components/library/FilterStrips';
import SelectionBar from '@/components/library/SelectionBar';
import Breadcrumb from '@/components/library/Breadcrumb';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { invalidateLibraryQueries } from '@/lib/queryClient';
import { useSelectionStore } from '@/store/selectionStore';
import { Pencil, Trash2, XCircle } from 'lucide-react';

const PAGE_SIZE = 48;

export default function LibraryPage() {
  const { id } = useParams<{ id: string }>();
  const libraryId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const {
    mediaType,
    sortBy,
    fileExt,
    readStatus,
    favoritesOnly,
  } = useUiStore();

  // Query to find library details
  const { data: libraries = [] } = useQuery<api.Library[]>({
    queryKey: ['libraries'],
    queryFn: () => api.fetchLibraries(),
  });

  const activeLibrary = libraries.find((l) => l.id === libraryId);

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.renameLibrary(libraryId, name),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success('Collection renamed');
    },
    onError: (err) => toast.error(`Rename failed: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteLibrary(libraryId),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success('Collection deleted');
      navigate('/', { replace: true });
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const removeSelectedMutation = useMutation({
    mutationFn: () => api.removeComicsFromLibrary(libraryId, selectedIds),
    onSuccess: async () => {
      await invalidateLibraryQueries(queryClient);
      toast.success(`Removed ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'} from collection`);
      clearSelection();
    },
    onError: (err) => toast.error(`Remove failed: ${err.message}`),
  });

  const handleRename = () => {
    if (!activeLibrary) return;
    const nextName = window.prompt('Rename collection', activeLibrary.name)?.trim();
    if (!nextName || nextName === activeLibrary.name) return;
    renameMutation.mutate(nextName);
  };

  const handleDelete = () => {
    if (!activeLibrary) return;
    const confirmed = window.confirm(
      `Delete collection "${activeLibrary.name}"? Items stay in the library.`
    );
    if (confirmed) deleteMutation.mutate();
  };

  // Map 'favoritesOnly' boolean to 'favorites' (context.md §4)
  const filters: Record<string, any> = {
    mediaType: mediaType || undefined,
    sortBy: sortBy || undefined,
    sortOrder: (sortBy === 'dateAdded' || sortBy === 'lastRead') ? 'desc' : undefined,
    fileExt: fileExt || undefined,
    readStatus: readStatus || undefined,
  };
  if (favoritesOnly) {
    filters.favorites = true;
  }

  // Infinite query for library comics list
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['library-comics', libraryId, filters],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam * PAGE_SIZE;
      return api.fetchLibraryComics(libraryId, {
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
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {activeLibrary ? `${activeLibrary.comicCount} total items` : ''}
          </p>
          {activeLibrary && (
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
          emptyMessage="No items found matching the current filters in this collection."
        />
      </div>

      <SelectionBar />
    </div>
  );
}
