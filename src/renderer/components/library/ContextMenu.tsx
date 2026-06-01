import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useSelectionStore } from '@/store/selectionStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen, CheckCircle, Search, Trash2, FolderPlus, Library as LibraryIcon, EyeOff, Tag } from 'lucide-react';

interface MetadataCandidate {
  source: 'comicvine' | 'anilist' | 'mangadex';
  externalId: string;
  title: string;
  author?: string | null;
  artist?: string | null;
  year?: number | null;
  genre?: string | null;
  summary?: string | null;
  coverUrl?: string | null;
}

interface ContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  x: number;
  y: number;
  targetComic: api.WebComicRecord | null;
}

export default function ContextMenu({
  open,
  onOpenChange,
  x,
  y,
  targetComic,
}: ContextMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagText, setTagText] = useState('');
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataQuery, setMetadataQuery] = useState('');
  const [metadataResults, setMetadataResults] = useState<MetadataCandidate[]>([]);
  const [metadataWarnings, setMetadataWarnings] = useState<string[]>([]);

  // Determine if we are acting on selection or a single comic
  const isTargetInSelection = targetComic ? selectedIds.includes(targetComic.id) : false;
  const activeIds = isTargetInSelection
    ? selectedIds
    : targetComic
    ? [targetComic.id]
    : [];

  const count = activeIds.length;

  useEffect(() => {
    if (!targetComic || tagDialogOpen) return;
    setTagText(targetComic.tags.join(', '));
  }, [targetComic, tagDialogOpen]);

  // Libraries and Folders list queries
  const { data: libraries = [] } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.fetchLibraries(),
    enabled: open,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
    enabled: open,
  });

  const saveTagsMutation = useMutation({
    mutationFn: async () => {
      const tags = tagText
        .split(',')
        .map((tagName) => tagName.trim())
        .filter(Boolean);
      await Promise.all(activeIds.map((id) => api.setComicTags(id, tags)));
    },
    onSuccess: () => {
      toast.success(`Updated tags for ${count} item${count === 1 ? '' : 's'}.`);
      queryClient.invalidateQueries();
      clearSelection();
      setTagDialogOpen(false);
    },
    onError: (err) => {
      toast.error(`Tag update failed: ${err.message}`);
    },
  });

  const searchMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!targetComic) return { results: [], warnings: [] };
      return api.searchMetadata(targetComic.id, metadataQuery || targetComic.title);
    },
    onSuccess: (result) => {
      setMetadataResults(result.results ?? []);
      setMetadataWarnings(result.warnings ?? []);
      if ((result.results ?? []).length === 0) {
        toast.info('No metadata matches found.');
      }
    },
    onError: (err) => toast.error(`Metadata search failed: ${err.message}`),
  });

  const applyMetadataMutation = useMutation({
    mutationFn: async (candidate: MetadataCandidate) => {
      if (!targetComic) return;
      await api.applyMetadata(targetComic.id, {
        ...candidate,
        externalSource: candidate.source,
      });
    },
    onSuccess: async () => {
      toast.success('Metadata applied');
      queryClient.invalidateQueries();
      setMetadataDialogOpen(false);
    },
    onError: (err) => toast.error(`Metadata apply failed: ${err.message}`),
  });

  // Mutator: Delete
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Delete multiple or single record
      await Promise.all(activeIds.map((id) => api.deleteComic(id)));
    },
    onSuccess: () => {
      toast.success(`Removed ${count} item${count === 1 ? '' : 's'} from library database.`);
      // Invalidate queries to update lists
      queryClient.invalidateQueries();
      clearSelection();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  // Mutator: Mark Read (Completed)
  const markReadMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(activeIds.map((id) => api.setCompleted(id, true)));
    },
    onSuccess: () => {
      toast.success(`Marked ${count} item${count === 1 ? '' : 's'} as completed.`);
      queryClient.invalidateQueries();
      clearSelection();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Operation failed: ${err.message}`);
    },
  });

  // Mutator: Mark Unread (Clear progress)
  const markUnreadMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(activeIds.map((id) => api.clearProgress(id)));
    },
    onSuccess: () => {
      toast.success(`Cleared reading progress for ${count} item${count === 1 ? '' : 's'}.`);
      queryClient.invalidateQueries();
      clearSelection();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Operation failed: ${err.message}`);
    },
  });

  // Mutator: Add to Collection
  const addToCollectionMutation = useMutation({
    mutationFn: async ({ libraryId }: { libraryId: number }) => {
      await api.addComicsToLibrary(libraryId, activeIds);
    },
    onSuccess: (_, variables) => {
      const libName = libraries.find((l) => l.id === variables.libraryId)?.name || 'Collection';
      toast.success(`Added ${count} item${count === 1 ? '' : 's'} to "${libName}".`);
      queryClient.invalidateQueries();
      clearSelection();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Add failed: ${err.message}`);
    },
  });

  // Mutator: Add to Folder
  const addToFolderMutation = useMutation({
    mutationFn: async ({ folderId }: { folderId: number }) => {
      await api.addComicsToFolder(folderId, activeIds);
    },
    onSuccess: (_, variables) => {
      const folderName = folders.find((f) => f.id === variables.folderId)?.name || 'Folder';
      toast.success(`Added ${count} item${count === 1 ? '' : 's'} to folder "${folderName}".`);
      queryClient.invalidateQueries();
      clearSelection();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Add failed: ${err.message}`);
    },
  });

  const handleOpenReader = () => {
    if (targetComic) {
      navigate(`/read/${targetComic.id}`);
      onOpenChange(false);
    }
  };

  return (
    <>
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {/* 
        Virtual absolute trigger positioned at mouse coords. 
        Note pointer-events-none prevents blocking right-clicks.
      */}
      <DropdownMenuTrigger
        style={{
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          width: '1px',
          height: '1px',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />

      <DropdownMenuContent align="start" className="bg-card border-border w-52">
        {/* Open Action (single target only) */}
        {!isTargetInSelection && count === 1 && (
          <>
            <DropdownMenuItem onClick={handleOpenReader} className="gap-2 cursor-pointer focus:bg-muted">
              <BookOpen className="h-4 w-4" />
              <span>Open Reader</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMetadataQuery(targetComic?.title ?? '');
                setMetadataResults([]);
                setMetadataWarnings([]);
                setMetadataDialogOpen(true);
                onOpenChange(false);
              }}
              className="gap-2 cursor-pointer focus:bg-muted"
            >
              <Search className="h-4 w-4" />
              <span>Search Metadata</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
          </>
        )}

        {/* Mark Read/Unread toggles */}
        <DropdownMenuItem
          onClick={() => markReadMutation.mutate()}
          className="gap-2 cursor-pointer focus:bg-muted"
        >
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>Mark Read</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => markUnreadMutation.mutate()}
          className="gap-2 cursor-pointer focus:bg-muted"
        >
          <EyeOff className="h-4 w-4 text-orange-500" />
          <span>Mark Unread</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        {/* Add to Collection submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 cursor-pointer focus:bg-muted">
            <LibraryIcon className="h-4 w-4" />
            <span>Add to Collection</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="bg-card border-border min-w-40 max-h-56 overflow-y-auto">
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
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {/* Add to Folder submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 cursor-pointer focus:bg-muted">
            <FolderPlus className="h-4 w-4" />
            <span>Add to Folder</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="bg-card border-border min-w-40 max-h-56 overflow-y-auto">
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
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem
          onClick={() => {
            setTagText(targetComic?.tags.join(', ') ?? '');
            setTagDialogOpen(true);
            onOpenChange(false);
          }}
          className="gap-2 cursor-pointer focus:bg-muted"
        >
          <Tag className="h-4 w-4" />
          <span>Edit Tags</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        {/* Delete action */}
        <DropdownMenuItem
          onClick={() => deleteMutation.mutate()}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-red-500/10 focus:bg-muted/10 font-medium"
        >
          <Trash2 className="h-4 w-4" />
          <span>Remove Library Entry</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground text-left">Edit Tags</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (activeIds.length > 0) saveTagsMutation.mutate();
          }}
        >
          <div className="space-y-1.5 text-left">
            <Label htmlFor="comic-tags" className="text-foreground">
              Tags
            </Label>
            <Input
              id="comic-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              className="bg-secondary border-border"
              placeholder="action, omnibus, favorite"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Separate tags with commas. Saving replaces tags on all selected items.
            </p>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={() => setTagDialogOpen(false)}
              disabled={saveTagsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={saveTagsMutation.isPending || activeIds.length === 0}
            >
              {saveTagsMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={metadataDialogOpen} onOpenChange={setMetadataDialogOpen}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground text-left">Search Metadata</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            searchMetadataMutation.mutate();
          }}
        >
          <div className="flex gap-2">
            <Input
              value={metadataQuery}
              onChange={(event) => setMetadataQuery(event.target.value)}
              className="bg-secondary border-border"
              placeholder="Title"
              autoFocus
            />
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={searchMetadataMutation.isPending || !targetComic}
            >
              {searchMetadataMutation.isPending ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {metadataWarnings.length > 0 && (
            <div className="rounded border border-border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
              {metadataWarnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {metadataResults.map((candidate) => (
              <button
                key={`${candidate.source}:${candidate.externalId}`}
                type="button"
                onClick={() => applyMetadataMutation.mutate(candidate)}
                disabled={applyMetadataMutation.isPending}
                className="w-full text-left rounded-lg border border-border bg-secondary/20 hover:bg-muted p-3 transition-colors disabled:opacity-60"
              >
                <div className="flex gap-3">
                  {candidate.coverUrl ? (
                    <img
                      src={candidate.coverUrl}
                      alt=""
                      className="h-16 w-11 rounded object-cover bg-secondary shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-11 rounded bg-secondary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {candidate.title}
                      </span>
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                        {candidate.source}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[candidate.author, candidate.artist, candidate.year].filter(Boolean).join(' / ') || 'No creator metadata'}
                    </div>
                    {candidate.summary && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {candidate.summary}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={() => setMetadataDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
