import { useState, useCallback } from 'react';
import {
  addComicFiles, addComicsToLibrary, addComicsToFolder,
  classifyPaths, getComicByPath, getPathForFile,
  scanDirectory, scanBooksDirectory,
} from '../../../ipcClient';
import { isSupportedFile } from '../../../../shared/dropValidator';
import type { FolderEntry } from '../types';

interface Params {
  activeLibraryId: number | null;
  activeView: 'all' | 'comics' | 'books';
  searchQuery: string;
  reload: (search?: string) => Promise<void> | void;
  onSelectionChange: (ids: Set<number>) => void;
  onComicsChanged: () => void;
}

/**
 * useDragDropFiles — owns the LibraryView grid drop zone (file/folder
 * imports) plus the per-folder card drop targets (drag comics onto a
 * folder card to add them).
 */
export function useDragDropFiles({
  activeLibraryId, activeView, searchQuery,
  reload, onSelectionChange, onComicsChanged,
}: Params) {
  // Grid-level drop zone state.
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(false);

  // Per-folder drop highlight (drag a comic over a folder card).
  const [folderDropTargetId, setFolderDropTargetId] = useState<number | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
      return;
    }
    e.dataTransfer.dropEffect = 'none';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const droppedPaths = droppedFiles
      .map((file) => getPathForFile(file))
      .filter((p) => p.length > 0);
    if (!droppedPaths.length) return;

    setAdding(true);
    try {
      const { files, directories } = await classifyPaths(droppedPaths);
      for (const dir of directories) {
        try { await scanDirectory(dir); }
        catch (err) { console.error('Failed to scan dropped folder (comics):', dir, err); }
        try { await scanBooksDirectory(dir); }
        catch (err) { console.error('Failed to scan dropped folder (books):', dir, err); }
      }
      const supportedFiles = files.filter((p) => isSupportedFile(p.split(/[\\/]/).pop() ?? ''));
      let result: Awaited<ReturnType<typeof addComicFiles>> | undefined;
      if (supportedFiles.length) {
        result = await addComicFiles(supportedFiles);
        if (result?.errors.length) console.error('Failed to add some comics:', result.errors);
      }
      if (activeLibraryId != null && supportedFiles.length) {
        const records = await Promise.all(supportedFiles.map((filePath) => getComicByPath(filePath)));
        const matchingIds = records.flatMap((record) => {
          if (!record) return [];
          const expectedMediaType = activeView === 'all' ? null : (activeView === 'books' ? 'book' : 'comic');
          return expectedMediaType === null || record.mediaType === expectedMediaType ? [record.id] : [];
        });
        if (matchingIds.length > 0) {
          await addComicsToLibrary(activeLibraryId, Array.from(new Set(matchingIds)));
        }
      }
      await reload(searchQuery);
      if (directories.length || (result?.added ?? 0) > 0) onComicsChanged();
    } catch (err) {
      console.error('Failed to add dropped files:', err);
    } finally {
      setAdding(false);
    }
  }, [activeLibraryId, activeView, searchQuery, reload, onComicsChanged]);

  // Folder card drop target (drag selected comics onto it).
  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: number) => {
    if (!e.dataTransfer.types.includes('application/comic-ids')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    setFolderDropTargetId(folderId);
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderDropTargetId(null);
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, folder: FolderEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderDropTargetId(null);

    const data = e.dataTransfer.getData('application/comic-ids');
    if (!data) return;

    try {
      const comicIds = JSON.parse(data) as number[];
      if (!Array.isArray(comicIds) || comicIds.length === 0) return;
      await addComicsToFolder(folder.id, comicIds);
      onSelectionChange(new Set());
      await reload(searchQuery);
    } catch (err) {
      console.error(`Failed to add comics to folder "${folder.name}":`, err);
    }
  }, [reload, onSelectionChange, searchQuery]);

  return {
    dragOver, adding, folderDropTargetId,
    handleDragOver, handleDragLeave, handleDrop,
    handleFolderDragOver, handleFolderDragLeave, handleFolderDrop,
  };
}
