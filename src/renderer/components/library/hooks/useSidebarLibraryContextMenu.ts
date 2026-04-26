import { useState, useCallback } from 'react';
import { renameLibrary, deleteLibrary } from '../../../ipcClient';
import type { LibrarySummary } from '../../../../shared/ipcTypes';

interface ContextMenu {
  x: number;
  y: number;
  library: LibrarySummary;
}

interface Params {
  activeLibraryId: number | null;
  onSelectLibrary: (id: number | null) => void;
  reload: () => void | Promise<void>;
  onChanged: () => void;
  confirm: (message: string) => Promise<boolean>;
}

/**
 * useSidebarLibraryContextMenu — owns the right-click menu state on
 * sidebar library rows + rename/delete handlers. Mirrors the shape of
 * useFolderContextMenu for grid folder cards.
 */
export function useSidebarLibraryContextMenu({
  activeLibraryId, onSelectLibrary, reload, onChanged, confirm,
}: Params) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [contextRenaming, setContextRenaming] = useState(false);
  const [contextRenameName, setContextRenameName] = useState('');
  const [contextError, setContextError] = useState<string | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextRenaming(false);
    setContextRenameName('');
    setContextError(null);
  }, []);

  const openContextMenu = useCallback((e: React.MouseEvent, lib: LibrarySummary) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, library: lib });
    setContextRenaming(false);
    setContextRenameName(lib.name);
    setContextError(null);
  }, []);

  const handleContextRename = useCallback(async () => {
    if (!contextMenu) return;
    const name = contextRenameName.trim();
    if (!name || name === contextMenu.library.name) { closeContextMenu(); return; }
    try {
      await renameLibrary(contextMenu.library.id, name);
      closeContextMenu();
      await reload();
      onChanged();
    } catch (err) {
      console.error('Failed to rename library:', err);
      setContextError(err instanceof Error ? err.message : 'Failed to rename library.');
    }
  }, [contextMenu, contextRenameName, closeContextMenu, reload, onChanged]);

  const handleContextDelete = useCallback(async () => {
    if (!contextMenu) return;
    const confirmed = await confirm(`Delete library "${contextMenu.library.name}"?\n\nThis will not delete any files.`);
    if (!confirmed) return;
    await deleteLibrary(contextMenu.library.id);
    if (activeLibraryId === contextMenu.library.id) onSelectLibrary(null);
    closeContextMenu();
    await reload();
    onChanged();
  }, [contextMenu, activeLibraryId, onSelectLibrary, closeContextMenu, reload, onChanged, confirm]);

  return {
    contextMenu,
    contextRenaming,
    setContextRenaming,
    contextRenameName,
    setContextRenameName,
    contextError,
    openContextMenu,
    closeContextMenu,
    handleContextRename,
    handleContextDelete,
  };
}
