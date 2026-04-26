import { useState, useCallback } from 'react';
import {
  addComicsToFolder, addComicsToLibrary, addFoldersToLibrary,
  createFolder, createLibrary, getFolders, getLibraries,
  removeComics, removeComicsFromLibrary,
} from '../../../ipcClient';
import type { ComicEntry, ComicContextMenuState } from '../types';

interface Params {
  /** Current selection on the grid; used to expand the targeted comic to the full set. */
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  /** Currently-active library route, used by add-to-library + delete-vs-remove branch. */
  activeLibraryId: number | null;
  /** Active media tab; gates whether new libraries are book-typed. */
  activeView: 'all' | 'comics' | 'books';
  /** Ref to the currently-active folder so the menu can hide it from "Add to folder". */
  activeFolderRef: React.MutableRefObject<{ id: number; name: string } | null>;
  /** Caller's reload + change notifiers (typically loadInitial(searchQuery) + onComicsChanged). */
  reload: () => void | Promise<void>;
  onChanged: () => void;
  /** Async confirm modal for the delete branch. */
  confirm: (message: string) => Promise<boolean>;
}

interface UseComicContextMenuResult {
  contextMenu: ComicContextMenuState | null;
  contextCreateMode: 'library' | 'folder' | null;
  setContextCreateMode: (m: 'library' | 'folder' | null) => void;
  contextCreateName: string;
  setContextCreateName: (s: string) => void;
  contextCreateError: string | null;
  setContextCreateError: (s: string | null) => void;
  contextCreating: boolean;
  /** Right-click on a card → open the menu, fetch libraries + folders. */
  openContextMenu: (e: React.MouseEvent, comic: ComicEntry) => Promise<void>;
  closeContextMenu: () => void;
  handleContextAddToLibrary: (libraryId: number) => Promise<void>;
  handleContextCreateLibrary: () => Promise<void>;
  handleContextAddToFolder: (folderId: number) => Promise<void>;
  handleContextCreateFolder: () => Promise<void>;
  handleContextDelete: () => Promise<void>;
  /** Mutate the menu in place — used by the details handler when it needs to close the menu first. */
  setContextMenu: React.Dispatch<React.SetStateAction<ComicContextMenuState | null>>;
}

/**
 * useComicContextMenu — owns the right-click context menu on grid cards
 * + the inline "create new collection / folder" sub-flow + the
 * add-to-collection / add-to-folder / delete actions. Pulled out of
 * LibraryView so the component body stays readable.
 */
export function useComicContextMenu({
  selectedIds, onSelectionChange,
  activeLibraryId, activeView, activeFolderRef,
  reload, onChanged, confirm,
}: Params): UseComicContextMenuResult {
  const [contextMenu, setContextMenu] = useState<ComicContextMenuState | null>(null);
  const [contextCreateMode, setContextCreateMode] = useState<'library' | 'folder' | null>(null);
  const [contextCreateName, setContextCreateName] = useState('');
  const [contextCreateError, setContextCreateError] = useState<string | null>(null);
  const [contextCreating, setContextCreating] = useState(false);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextCreateMode(null);
    setContextCreateName('');
    setContextCreateError(null);
    setContextCreating(false);
  }, []);

  const openContextMenu = useCallback(async (e: React.MouseEvent, comic: ComicEntry) => {
    e.preventDefault();
    e.stopPropagation();

    // If the right-clicked card isn't in the selection, target only it.
    // Otherwise the menu acts on the whole selection (bulk add, bulk delete, …).
    const comicIds = selectedIds.has(comic.id) ? Array.from(selectedIds) : [comic.id];
    if (!selectedIds.has(comic.id)) {
      onSelectionChange(new Set([comic.id]));
    }

    setContextCreateMode(null);
    setContextCreateName('');
    setContextCreateError(null);
    setContextCreating(false);

    setContextMenu({
      x: e.clientX, y: e.clientY,
      comic, comicIds,
      libraries: [], folders: [],
      loading: true,
    });

    try {
      const currentActiveFolder = activeFolderRef.current;
      const [libraries, folderSummaries] = await Promise.all([
        getLibraries(activeView === 'books' ? 'book' : 'comic'),
        getFolders(),
      ]);
      setContextMenu((current) => {
        if (!current || current.comic.id !== comic.id) return current;
        return {
          ...current,
          libraries,
          folders: folderSummaries
            .filter((folder) => folder.id !== currentActiveFolder?.id)
            .map((folder) => ({
              id: folder.id, name: folder.name, comicCount: folder.comicCount, thumbnailUrl: null,
            })),
          loading: false,
        };
      });
    } catch (err) {
      console.error('Failed to load context menu data:', err);
      setContextMenu((current) => current ? { ...current, loading: false } : current);
    }
  }, [activeView, activeFolderRef, onSelectionChange, selectedIds]);

  const handleContextAddToLibrary = useCallback(async (libraryId: number) => {
    if (!contextMenu) return;
    await addComicsToLibrary(libraryId, contextMenu.comicIds);
    closeContextMenu();
    onChanged();
  }, [contextMenu, closeContextMenu, onChanged]);

  const handleContextCreateLibrary = useCallback(async () => {
    if (!contextMenu) return;
    const name = contextCreateName.trim();
    if (!name) return;

    setContextCreating(true);
    setContextCreateError(null);
    try {
      const library = await createLibrary(name, activeView === 'books' ? 'book' : 'comic');
      if (!library) {
        setContextCreateError('Library was not created.');
        setContextCreating(false);
        return;
      }
      await addComicsToLibrary(library.id, contextMenu.comicIds);
      closeContextMenu();
      onChanged();
    } catch (err) {
      console.error('Failed to create library:', err);
      setContextCreateError(err instanceof Error ? err.message : 'Failed to create library.');
      setContextCreating(false);
    }
  }, [contextMenu, contextCreateName, activeView, closeContextMenu, onChanged]);

  const handleContextAddToFolder = useCallback(async (folderId: number) => {
    if (!contextMenu) return;
    await addComicsToFolder(folderId, contextMenu.comicIds);
    closeContextMenu();
    onSelectionChange(new Set());
    await reload();
  }, [contextMenu, closeContextMenu, onSelectionChange, reload]);

  const handleContextCreateFolder = useCallback(async () => {
    if (!contextMenu) return;
    const name = contextCreateName.trim();
    if (!name) return;

    setContextCreating(true);
    setContextCreateError(null);
    try {
      const folder = await createFolder(name, contextMenu.comicIds);
      if (!folder) {
        setContextCreateError('Virtual folder was not created.');
        setContextCreating(false);
        return;
      }
      if (activeLibraryId != null) {
        await addFoldersToLibrary(activeLibraryId, [folder.id]);
      }
      closeContextMenu();
      onSelectionChange(new Set());
      await reload();
    } catch (err) {
      console.error('Failed to create folder:', err);
      setContextCreateError(err instanceof Error ? err.message : 'Failed to create folder.');
      setContextCreating(false);
    }
  }, [contextMenu, contextCreateName, activeLibraryId, closeContextMenu, onSelectionChange, reload]);

  const handleContextDelete = useCallback(async () => {
    if (!contextMenu) return;
    const count = contextMenu.comicIds.length;

    // In a library view, "delete" means remove from this library — the
    // database row stays. Outside one, it's a real delete and we confirm.
    if (activeLibraryId != null) {
      await removeComicsFromLibrary(activeLibraryId, contextMenu.comicIds);
      closeContextMenu();
      onSelectionChange(new Set());
      await reload();
      onChanged();
      return;
    }

    const confirmed = await confirm(
      `Delete ${count} comic${count !== 1 ? 's' : ''} from the database?\n\nFiles stay on disk, but future scans will skip these paths.`,
    );
    if (!confirmed) return;
    await removeComics(contextMenu.comicIds);
    closeContextMenu();
    onSelectionChange(new Set());
    await reload();
    onChanged();
  }, [contextMenu, activeLibraryId, closeContextMenu, onSelectionChange, reload, onChanged, confirm]);

  return {
    contextMenu, setContextMenu,
    contextCreateMode, setContextCreateMode,
    contextCreateName, setContextCreateName,
    contextCreateError, setContextCreateError,
    contextCreating,
    openContextMenu, closeContextMenu,
    handleContextAddToLibrary, handleContextCreateLibrary,
    handleContextAddToFolder, handleContextCreateFolder,
    handleContextDelete,
  };
}
