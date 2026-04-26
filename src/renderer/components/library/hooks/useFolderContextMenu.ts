import { useState, useCallback } from 'react';
import { renameFolder, deleteFolder } from '../../../ipcClient';
import type { FolderEntry, FolderContextMenuState } from '../types';

interface Params {
  /** Currently-active folder, used to update name/clear when affected. */
  activeFolder: { id: number; name: string } | null;
  setActiveFolder: (f: { id: number; name: string } | null) => void;
  /** Caller's reload trigger (typically loadInitial(searchQuery) from useLibraryQuery). */
  reload: () => void | Promise<void>;
  /** Caller's "library changed" notifier (sidebar refresh, etc). */
  onChanged: () => void;
  /** Async confirm dialog (from useConfirm). */
  confirm: (message: string) => Promise<boolean>;
}

/**
 * useFolderContextMenu — owns the folder context-menu + inline rename
 * state, and the rename/delete handlers. The actual menu is rendered by
 * the caller; this hook returns the state and the open/close/submit/
 * delete callbacks.
 */
export function useFolderContextMenu({ activeFolder, setActiveFolder, reload, onChanged, confirm }: Params) {
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderRenameName, setFolderRenameName] = useState('');
  const [folderRenameError, setFolderRenameError] = useState<string | null>(null);

  const openFolderContextMenu = useCallback((e: React.MouseEvent, folder: FolderEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setRenamingFolder(false);
    setFolderRenameName(folder.name);
    setFolderRenameError(null);
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
  }, []);

  const closeFolderContextMenu = useCallback(() => {
    setFolderContextMenu(null);
    setRenamingFolder(false);
    setFolderRenameName('');
    setFolderRenameError(null);
  }, []);

  const handleSubmitRenameFolder = useCallback(async () => {
    if (!folderContextMenu) return;
    const trimmed = folderRenameName.trim();
    if (!trimmed || trimmed === folderContextMenu.folder.name) {
      closeFolderContextMenu();
      return;
    }
    try {
      setFolderRenameError(null);
      await renameFolder(folderContextMenu.folder.id, trimmed);
      if (activeFolder?.id === folderContextMenu.folder.id) {
        setActiveFolder({ id: folderContextMenu.folder.id, name: trimmed });
      }
      closeFolderContextMenu();
      await reload();
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setFolderRenameError(err instanceof Error ? err.message : 'Failed to rename folder.');
    }
  }, [folderContextMenu, folderRenameName, activeFolder, setActiveFolder, reload, closeFolderContextMenu]);

  const handleDeleteFolder = useCallback(async () => {
    if (!folderContextMenu) return;
    const { folder } = folderContextMenu;
    const confirmed = await confirm(
      `Delete virtual folder "${folder.name}"?\n\nThis only removes the folder grouping. Comics and image files stay in the library.`,
    );
    if (!confirmed) return;
    try {
      await deleteFolder(folder.id);
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      closeFolderContextMenu();
      await reload();
      onChanged();
    } catch (err) {
      console.error('Failed to delete folder:', err);
      setFolderRenameError(err instanceof Error ? err.message : 'Failed to delete folder.');
    }
  }, [folderContextMenu, activeFolder, setActiveFolder, reload, onChanged, confirm, closeFolderContextMenu]);

  return {
    folderContextMenu,
    setFolderContextMenu,
    renamingFolder,
    setRenamingFolder,
    folderRenameName,
    setFolderRenameName,
    folderRenameError,
    openFolderContextMenu,
    closeFolderContextMenu,
    handleSubmitRenameFolder,
    handleDeleteFolder,
  };
}
