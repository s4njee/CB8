import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useSelectionStore } from '@/store/selectionStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Trash2, FolderPlus, Library as LibraryIcon, X, Plus } from 'lucide-react';

export default function SelectionBar() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const count = selectedIds.length;
  const isVisible = count > 0;

  // Libraries and Folders list queries
  const { data: libraries = [] } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.fetchLibraries(),
    enabled: isVisible,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
    enabled: isVisible,
  });

  // Mutator: Delete Selection
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(selectedIds.map((id) => api.deleteComic(id)));
    },
    onSuccess: () => {
      toast.success(`Removed ${count} item${count === 1 ? '' : 's'} from library database.`);
      queryClient.invalidateQueries();
      clearSelection();
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  // Mutator: Add to Collection
  const addToCollectionMutation = useMutation({
    mutationFn: async ({ libraryId }: { libraryId: number }) => {
      await api.addComicsToLibrary(libraryId, selectedIds);
    },
    onSuccess: (_, variables) => {
      const libName = libraries.find((l) => l.id === variables.libraryId)?.name || 'Collection';
      toast.success(`Added ${count} item${count === 1 ? '' : 's'} to "${libName}".`);
      queryClient.invalidateQueries();
      clearSelection();
    },
    onError: (err) => {
      toast.error(`Add failed: ${err.message}`);
    },
  });

  // Mutator: Add to Folder
  const addToFolderMutation = useMutation({
    mutationFn: async ({ folderId }: { folderId: number }) => {
      await api.addComicsToFolder(folderId, selectedIds);
    },
    onSuccess: (_, variables) => {
      const folderName = folders.find((f) => f.id === variables.folderId)?.name || 'Folder';
      toast.success(`Added ${count} item${count === 1 ? '' : 's'} to folder "${folderName}".`);
      queryClient.invalidateQueries();
      clearSelection();
    },
    onError: (err) => {
      toast.error(`Add failed: ${err.message}`);
    },
  });

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-card/90 backdrop-blur-md border border-border shadow-2xl rounded-full select-none max-w-[90vw] md:max-w-2xl">
      {/* 1. Selection Info count */}
      <div className="flex items-center gap-2 pr-2 border-r border-border shrink-0">
        <span className="text-xs font-semibold text-primary">{count} selected</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={clearSelection}
          className="h-5 w-5 hover:bg-muted p-0 text-muted-foreground hover:text-foreground rounded-full"
          aria-label="Clear selection"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* 2. Actions List */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {/* Add to Collection */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-secondary border-border gap-1.5 text-xs rounded-full font-medium"
            >
              <LibraryIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add to Collection</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="bg-card border-border min-w-40 max-h-56 overflow-y-auto">
            {libraries.map((lib) => (
              <DropdownMenuItem
                key={lib.id}
                onClick={() => addToCollectionMutation.mutate({ libraryId: lib.id })}
                className="cursor-pointer focus:bg-muted"
              >
                {lib.name}
              </DropdownMenuItem>
            ))}
            {libraries.length === 0 && (
              <DropdownMenuItem disabled className="text-muted-foreground/60 italic text-xs">
                No collections
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Add to Folder */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-secondary border-border gap-1.5 text-xs rounded-full font-medium"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add to Folder</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="bg-card border-border min-w-40 max-h-56 overflow-y-auto">
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onClick={() => addToFolderMutation.mutate({ folderId: folder.id })}
                className="cursor-pointer focus:bg-muted"
              >
                {folder.name}
              </DropdownMenuItem>
            ))}
            {folders.length === 0 && (
              <DropdownMenuItem disabled className="text-muted-foreground/60 italic text-xs">
                No folders
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Bulk Delete */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm(`Are you sure you want to remove these ${count} database entries? (Underlying files on disk will NOT be deleted).`)) {
              deleteMutation.mutate();
            }
          }}
          className="h-8 bg-secondary border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 gap-1.5 text-xs text-destructive rounded-full font-medium"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Remove Entries</span>
        </Button>
      </div>
    </div>
  );
}
