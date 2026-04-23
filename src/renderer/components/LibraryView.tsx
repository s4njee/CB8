import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { isSupportedFile } from '../../shared/dropValidator';
import type { QueryOptions, FilterPreset } from '../../shared/types';
import { parseFilterPreset, getDefaultSortOrder, toggleSortOrder } from '../../shared/filterLogic';
import { ContinueReadingShelf } from './ContinueReadingShelf';
import { SortControl } from './SortControl';
import { FilterBar } from './FilterBar';
import { ComicCard } from './library/ComicCard';
import { FolderCard } from './library/FolderCard';
import { ComicContextMenu } from './library/ComicContextMenu';
import { FolderContextMenu } from './library/FolderContextMenu';
import { DetailsModal } from './library/DetailsModal';
import { parseThumb, getFileExtension } from './library/utils';
import { useScanProgress } from './library/hooks/useScanProgress';
import {
  CELL_WIDTH, GAP, PAGE_SIZE, ROW_HEIGHT,
  type ComicEntry, type FolderEntry,
  type ComicContextMenuState, type FolderContextMenuState,
} from './library/types';
import {
  addComicFiles,
  addComicsToFolder,
  addComicsToLibrary,
  addFoldersToLibrary,
  createLibrary,
  createFolder,
  deleteFolder,
  getComicByPath,
  getPathForFile,
  getFolders,
  getLibraries,
  openDirectoryDialog,
  queryComics,
  queryFolderComics,
  queryLibraryComics,
  renameFolder,
  removeComics,
  removeComicsFromLibrary,
  removeComicsFromFolder,
  refreshBookMetadata,
  scanDirectory,
  scanBooksDirectory,
  classifyPaths,
  getAllTags,
  getAppMeta,
  setAppMeta,
} from '../ipcClient';

interface Props {
  activeLibraryId: number | null;
  activeView: 'comics' | 'books';
  onOpenFile: (filePath: string) => void;
  onComicsChanged: () => void;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  refreshKey?: number;
}

export const LibraryView: React.FC<Props> = ({
  activeLibraryId, activeView, onOpenFile, onComicsChanged, selectedIds, onSelectionChange, refreshKey,
}) => {
  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [activeFolder, setActiveFolder] = useState<{ id: number; name: string } | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<QueryOptions['sortBy']>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [readStatus, setReadStatus] = useState<QueryOptions['readStatus'] | undefined>(undefined);
  const [fileExt, setFileExt] = useState<string | undefined>(undefined);
  const [filterTag, setFilterTag] = useState<string | undefined>(undefined);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const { scanProgress, setScanProgress } = useScanProgress();
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [folderDropTargetId, setFolderDropTargetId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ComicContextMenuState | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [contextCreateMode, setContextCreateMode] = useState<'library' | 'folder' | null>(null);
  const [contextCreateName, setContextCreateName] = useState('');
  const [contextCreateError, setContextCreateError] = useState<string | null>(null);
  const [contextCreating, setContextCreating] = useState(false);
  const [detailsComic, setDetailsComic] = useState<ComicEntry | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderRenameName, setFolderRenameName] = useState('');
  const [folderRenameError, setFolderRenameError] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState(4);
  const lastClickedIndex = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbnailUrls = useRef<Set<string>>(new Set());
  const comicsRef = useRef<ComicEntry[]>([]);
  const selectedIdsRef = useRef<Set<number>>(selectedIds);
  const activeFolderRef = useRef<{ id: number; name: string } | null>(activeFolder);
  const hasMore = comics.length < totalCount;
  const isBooks = activeView === 'books';
  const currentSearch = useRef('');
  comicsRef.current = comics;
  selectedIdsRef.current = selectedIds;
  activeFolderRef.current = activeFolder;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const computeColumns = () => {
      const width = el.clientWidth - GAP;
      const cols = Math.max(1, Math.floor((width + GAP) / (CELL_WIDTH + GAP)));
      setColumnCount(cols);
    };
    computeColumns();
    const ro = new ResizeObserver(computeColumns);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  type GridItem =
    | { kind: 'folder'; folder: FolderEntry }
    | { kind: 'comic'; comic: ComicEntry; comicIndex: number };

  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = [];
    for (const folder of folders) items.push({ kind: 'folder', folder });
    for (let i = 0; i < comics.length; i++) items.push({ kind: 'comic', comic: comics[i], comicIndex: i });
    return items;
  }, [folders, comics]);

  const rowCount = Math.max(1, Math.ceil(gridItems.length / columnCount));

  const rowVirtualizer = useVirtualizer({
    count: gridItems.length > 0 ? rowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 1,
  });

  const fetchPage = useCallback(async (search: string, offset: number): Promise<{ entries: ComicEntry[]; total: number }> => {
    const trimmedSearch = search.trim();
    const opts: QueryOptions = {
      search: trimmedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
      sortBy,
      sortOrder,
      readStatus,
      fileExt,
      tag: filterTag,
      excludeFoldered: activeFolder == null && activeLibraryId == null && !trimmedSearch,
      mediaType: activeView === 'books' ? 'book' : 'comic',
    };
    const result = activeFolder != null
      ? await queryFolderComics(activeFolder.id, opts)
      : activeLibraryId != null
      ? await queryLibraryComics(activeLibraryId, opts)
      : await queryComics(opts);
    if (!result?.records) return { entries: [], total: 0 };
    const entries: ComicEntry[] = result.records.map((rec) => ({
      id: rec.id, title: rec.title, pageCount: rec.pageCount,
      fileSize: rec.fileSize, filePath: rec.filePath,
      thumbnailUrl: parseThumb(rec.coverThumbnail),
      mediaType: rec.mediaType,
    }));
    return { entries, total: result.totalCount };
  }, [activeFolder, activeLibraryId, activeView, sortBy, sortOrder, readStatus, fileExt, filterTag]);

  const loadFolders = useCallback(async (search?: string) => {
    if (activeFolder || activeLibraryId != null) {
      setFolders([]);
      return;
    }

    const query = (search ?? '').trim().toLowerCase();
    try {
      const result = await getFolders();
      setFolders(result
        .filter((folder) => !query || folder.name.toLowerCase().includes(query))
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          comicCount: folder.comicCount,
          thumbnailUrl: parseThumb(folder.coverThumbnail),
        })));
    } catch (err) {
      console.error('Failed to load folders:', err);
      setFolders([]);
    }
  }, [activeFolder, activeLibraryId]);

  const loadInitial = useCallback(async (search?: string) => {
    const s = search ?? '';
    currentSearch.current = s;
    const [{ entries, total }] = await Promise.all([
      fetchPage(s, 0),
      loadFolders(s),
    ]);
    setComics(entries);
    setTotalCount(total);
  }, [fetchPage, loadFolders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [presetJson, tags] = await Promise.all([
          getAppMeta('filterPreset'),
          getAllTags(),
        ]);
        if (cancelled) return;
        const preset = parseFilterPreset(presetJson);
        setSortBy(preset.sortBy);
        setSortOrder(preset.sortOrder ?? 'asc');
        setReadStatus(preset.readStatus);
        setFileExt(preset.fileExt);
        setFilterTag(preset.tag);
        setAvailableTags(tags);
      } catch (err) {
        console.warn('Failed to load filter preferences:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { entries, total } = await fetchPage(currentSearch.current, comics.length);
      setComics((prev) => [...prev, ...entries]);
      setTotalCount(total);
    } catch (err) { console.error('Failed to load more:', err); }
    finally { setLoadingMore(false); }
  }, [fetchPage, comics.length, hasMore, loadingMore]);

  useEffect(() => {
    const currentUrls = new Set(comics.map((comic) => comic.thumbnailUrl).filter((url): url is string => url !== null));
    for (const url of thumbnailUrls.current) {
      if (!currentUrls.has(url)) URL.revokeObjectURL(url);
    }
    thumbnailUrls.current = currentUrls;
  }, [comics]);

  useEffect(() => () => {
    for (const url of thumbnailUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    loadInitial();
  }, [loadInitial, activeFolder]);

  useEffect(() => {
    setActiveFolder(null);
  }, [activeLibraryId, activeView]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  useEffect(() => {
    if (!hasMore || loadingMore) return;
    if (!lastVirtualRow) return;
    if (lastVirtualRow.index >= rowCount - 3) {
      loadMore();
    }
  }, [lastVirtualRow?.index, rowCount, hasMore, loadingMore, loadMore]);

  useEffect(() => {
    if (!contextMenu && !folderContextMenu) return;

    const close = () => {
      setContextMenu(null);
      setFolderContextMenu(null);
      setContextCreateMode(null);
      setContextCreateName('');
      setContextCreateError(null);
      setContextCreating(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu, folderContextMenu]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (contextMenu || folderContextMenu || comics.length === 0) return;
        e.preventDefault();
        onSelectionChange(new Set(comics.map((comic) => comic.id)));
        lastClickedIndex.current = comics.length - 1;
        return;
      }

      if (e.key !== 'Escape' || !activeFolder || contextMenu || folderContextMenu) return;
      e.preventDefault();
      handleBackFromFolder();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeFolder, comics, contextMenu, folderContextMenu, onSelectionChange]);

  const handleScan = async () => {
    const dirPath = await openDirectoryDialog();
    if (!dirPath) return;
    setScanning(true); setScanProgress(null);
    try {
      if (activeView === 'books') {
        await scanBooksDirectory(dirPath);
      } else {
        await scanDirectory(dirPath);
      }
      await loadInitial(searchQuery); onComicsChanged();
    }
    catch (err) { console.error('Scan failed:', err); }
    finally { setScanning(false); setScanProgress(null); }
  };

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadInitial(searchQuery); };

  const handleClearSearch = () => {
    setSearchQuery('');
    loadInitial('');
  };

  const persistAndReset = useCallback((preset: FilterPreset) => {
    setAppMeta('filterPreset', JSON.stringify(preset)).catch((err) =>
      console.warn('Failed to persist filter preset:', err)
    );
    setComics([]);
    setTotalCount(0);
  }, []);

  const handleSortByChange = useCallback((field: QueryOptions['sortBy']) => {
    const newOrder = getDefaultSortOrder(field);
    setSortBy(field);
    setSortOrder(newOrder);
    const preset: FilterPreset = { sortBy: field, sortOrder: newOrder, readStatus, fileExt, tag: filterTag };
    persistAndReset(preset);
  }, [readStatus, fileExt, filterTag, persistAndReset]);

  const handleSortOrderToggle = useCallback(() => {
    const newOrder = toggleSortOrder(sortOrder);
    setSortOrder(newOrder);
    const preset: FilterPreset = { sortBy, sortOrder: newOrder, readStatus, fileExt, tag: filterTag };
    persistAndReset(preset);
  }, [sortBy, sortOrder, readStatus, fileExt, filterTag, persistAndReset]);

  const handleReadStatusChange = useCallback((status: QueryOptions['readStatus'] | undefined) => {
    setReadStatus(status);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus: status, fileExt, tag: filterTag };
    persistAndReset(preset);
  }, [sortBy, sortOrder, fileExt, filterTag, persistAndReset]);

  const handleFileExtChange = useCallback((ext: string | undefined) => {
    setFileExt(ext);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus, fileExt: ext, tag: filterTag };
    persistAndReset(preset);
  }, [sortBy, sortOrder, readStatus, filterTag, persistAndReset]);

  const handleTagChange = useCallback((tag: string | undefined) => {
    setFilterTag(tag);
    const preset: FilterPreset = { sortBy, sortOrder, readStatus, fileExt, tag };
    persistAndReset(preset);
  }, [sortBy, sortOrder, readStatus, fileExt, persistAndReset]);

  const handleOpenFolder = (folder: FolderEntry) => {
    setContextMenu(null);
    setFolderContextMenu(null);
    setActiveFolder({ id: folder.id, name: folder.name });
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: number) => {
    e.dataTransfer.setData('application/folder-ids', JSON.stringify([folderId]));
    e.dataTransfer.effectAllowed = 'link';
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: FolderEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setRenamingFolder(false);
    setFolderRenameName(folder.name);
    setFolderRenameError(null);
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const handleBackFromFolder = () => {
    setActiveFolder(null);
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) { e.dataTransfer.dropEffect = 'copy'; setDragOver(true); return; }
    e.dataTransfer.dropEffect = 'none';
  };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
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
          const expectedMediaType = activeView === 'books' ? 'book' : 'comic';
          return record.mediaType === expectedMediaType ? [record.id] : [];
        });
        if (matchingIds.length > 0) {
          await addComicsToLibrary(activeLibraryId, Array.from(new Set(matchingIds)));
        }
      }
      await loadInitial(searchQuery);
      if (directories.length || (result?.added ?? 0) > 0) onComicsChanged();
    } catch (err) { console.error('Failed to add dropped files:', err); }
    finally { setAdding(false); }
  };

  const handleComicClick = useCallback((e: React.MouseEvent, index: number) => {
    const currentComics = comicsRef.current;
    const currentSelectedIds = selectedIdsRef.current;
    const comic = currentComics[index];
    if (!comic) return;

    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, index);
      const end = Math.max(lastClickedIndex.current, index);
      const next = new Set(currentSelectedIds);
      for (let i = start; i <= end; i++) next.add(currentComics[i].id);
      onSelectionChange(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(currentSelectedIds);
      if (next.has(comic.id)) next.delete(comic.id); else next.add(comic.id);
      onSelectionChange(next);
      lastClickedIndex.current = index;
    } else {
      if (currentSelectedIds.size === 1 && currentSelectedIds.has(comic.id)) {
        onSelectionChange(new Set()); lastClickedIndex.current = null;
      } else {
        onSelectionChange(new Set([comic.id])); lastClickedIndex.current = index;
      }
    }
  }, [onSelectionChange]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent, comicId: number) => {
    e.stopPropagation();
    const next = new Set(selectedIdsRef.current);
    if (next.has(comicId)) next.delete(comicId); else next.add(comicId);
    onSelectionChange(next);
  }, [onSelectionChange]);

  const handleComicDragStart = useCallback((e: React.DragEvent, comicId: number) => {
    let ids = selectedIdsRef.current;
    if (!ids.has(comicId)) { ids = new Set([comicId]); onSelectionChange(ids); }
    e.dataTransfer.setData('application/comic-ids', JSON.stringify(Array.from(ids)));
    e.dataTransfer.effectAllowed = 'link';
  }, [onSelectionChange]);

  const handleComicContextMenu = useCallback(async (e: React.MouseEvent, comic: ComicEntry) => {
    e.preventDefault();
    e.stopPropagation();

    const currentSelectedIds = selectedIdsRef.current;
    const currentComics = comicsRef.current;
    const currentActiveFolder = activeFolderRef.current;
    const comicIds = currentSelectedIds.has(comic.id) ? Array.from(currentSelectedIds) : [comic.id];
    if (!currentSelectedIds.has(comic.id)) {
      onSelectionChange(new Set([comic.id]));
      lastClickedIndex.current = currentComics.findIndex((entry) => entry.id === comic.id);
    }

    setContextCreateMode(null);
    setContextCreateName('');
    setContextCreateError(null);
    setContextCreating(false);

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      comic,
      comicIds,
      libraries: [],
      folders: [],
      loading: true,
    });

    try {
      const [libraries, folderSummaries] = await Promise.all([getLibraries(activeView === 'books' ? 'book' : 'comic'), getFolders()]);
      setContextMenu((current) => {
        if (!current || current.comic.id !== comic.id) return current;
        return {
          ...current,
          libraries,
          folders: folderSummaries
            .filter((folder) => folder.id !== currentActiveFolder?.id)
            .map((folder) => ({
              id: folder.id,
              name: folder.name,
              comicCount: folder.comicCount,
              thumbnailUrl: null,
            })),
          loading: false,
        };
      });
    } catch (err) {
      console.error('Failed to load context menu data:', err);
      setContextMenu((current) => current ? { ...current, loading: false } : current);
    }
  }, [activeView, onSelectionChange]);

  const closeContextMenu = () => {
    setContextMenu(null);
    setContextCreateMode(null);
    setContextCreateName('');
    setContextCreateError(null);
    setContextCreating(false);
  };
  const closeFolderContextMenu = () => {
    setFolderContextMenu(null);
    setRenamingFolder(false);
    setFolderRenameName('');
    setFolderRenameError(null);
  };

  const handleSubmitRenameFolder = async () => {
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
      await loadInitial(searchQuery);
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setFolderRenameError(err instanceof Error ? err.message : 'Failed to rename folder.');
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderContextMenu) return;
    const { folder } = folderContextMenu;
    const confirmed = window.confirm(
      `Delete virtual folder "${folder.name}"?\n\nThis only removes the folder grouping. Comics and image files stay in the library.`
    );
    if (!confirmed) return;

    try {
      await deleteFolder(folder.id);
      if (activeFolder?.id === folder.id) {
        setActiveFolder(null);
      }
      closeFolderContextMenu();
      await loadInitial(searchQuery);
      onComicsChanged();
    } catch (err) {
      console.error('Failed to delete folder:', err);
      setFolderRenameError(err instanceof Error ? err.message : 'Failed to delete folder.');
    }
  };

  const handleContextAddToLibrary = async (libraryId: number) => {
    if (!contextMenu) return;
    await addComicsToLibrary(libraryId, contextMenu.comicIds);
    closeContextMenu();
    onComicsChanged();
  };

  const handleContextCreateLibrary = async () => {
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
      onComicsChanged();
    } catch (err) {
      console.error('Failed to create library:', err);
      setContextCreateError(err instanceof Error ? err.message : 'Failed to create library.');
      setContextCreating(false);
    }
  };

  const handleContextAddToFolder = async (folderId: number) => {
    if (!contextMenu) return;
    await addComicsToFolder(folderId, contextMenu.comicIds);
    closeContextMenu();
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    await loadInitial(searchQuery);
  };

  const handleContextCreateFolder = async () => {
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
      lastClickedIndex.current = null;
      await loadInitial(searchQuery);
    } catch (err) {
      console.error('Failed to create folder:', err);
      setContextCreateError(err instanceof Error ? err.message : 'Failed to create folder.');
      setContextCreating(false);
    }
  };

  const handleContextDelete = async () => {
    if (!contextMenu) return;
    const count = contextMenu.comicIds.length;
    if (activeLibraryId != null) {
      await removeComicsFromLibrary(activeLibraryId, contextMenu.comicIds);
      closeContextMenu();
      onSelectionChange(new Set());
      lastClickedIndex.current = null;
      await loadInitial(searchQuery);
      onComicsChanged();
      return;
    }

    const confirmed = window.confirm(`Delete ${count} comic${count !== 1 ? 's' : ''} from the database?\n\nFiles stay on disk, but future scans will skip these paths.`);
    if (!confirmed) return;
    await removeComics(contextMenu.comicIds);
    closeContextMenu();
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    await loadInitial(searchQuery);
    onComicsChanged();
  };

  const handleContextDetails = async () => {
    if (!contextMenu) return;
    const { comic } = contextMenu;
    closeContextMenu();
    setDetailsComic(comic);

    const ext = getFileExtension(comic.filePath);
    if (comic.mediaType === 'book' && ext === 'pdf' && comic.pageCount <= 0) {
      setDetailsLoading(true);
      try {
        const refreshed = await refreshBookMetadata(comic.id);
        if (refreshed) {
          const updated = {
            ...comic,
            pageCount: refreshed.pageCount,
            fileSize: refreshed.fileSize,
            mediaType: refreshed.mediaType,
          };
          setDetailsComic(updated);
          setComics((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
        }
      } catch (err) {
        console.error('Failed to refresh book metadata:', err);
      } finally {
        setDetailsLoading(false);
      }
    }
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: number) => {
    if (!e.dataTransfer.types.includes('application/comic-ids')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    setFolderDropTargetId(folderId);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderDropTargetId(null);
  };

  const handleFolderDrop = async (e: React.DragEvent, folder: FolderEntry) => {
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
      lastClickedIndex.current = null;
      await loadInitial(searchQuery);
    } catch (err) {
      console.error(`Failed to add comics to folder "${folder.name}":`, err);
    }
  };

  const handleRemoveFromLibrary = async () => {
    if (activeLibraryId == null || selectedIds.size === 0) return;
    await removeComicsFromLibrary(activeLibraryId, Array.from(selectedIds));
    onSelectionChange(new Set());
    await loadInitial(searchQuery);
    onComicsChanged();
  };

  const handleRemoveFromFolder = async () => {
    if (activeFolder == null || selectedIds.size === 0) return;
    await removeComicsFromFolder(activeFolder.id, Array.from(selectedIds));
    onSelectionChange(new Set());
    await loadInitial(searchQuery);
  };

  const visibleItemCount = folders.length + comics.length;
  const displayedCount = activeFolder ? totalCount : totalCount + folders.length;

  const gridWidth = columnCount * CELL_WIDTH + (columnCount - 1) * GAP;

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{
      backgroundColor: '#1a1a1a', color: '#ccc', flex: 1,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      border: dragOver ? '3px dashed #2563eb' : '3px solid transparent', position: 'relative',
    }}>
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(37, 99, 235, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none' }}>
          <span style={{ fontSize: 24, color: '#5b9aff', fontWeight: 'bold' }}>Drop CBZ/CBR files to add</span>
        </div>
      )}
      {adding && <div style={{ padding: '4px 16px', backgroundColor: '#1e3a5f', fontSize: 12, flexShrink: 0 }}>Adding {isBooks ? 'books' : 'comics'}...</div>}

      <div style={{ padding: '8px 12px', backgroundColor: '#252525', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderBottom: '1px solid #333' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '5px 10px', backgroundColor: '#333', color: '#eee', border: '1px solid #444', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          <button type="submit" style={{ padding: '5px 12px', backgroundColor: '#444', color: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Search</button>
          <button type="button" onClick={handleClearSearch} disabled={!searchQuery} style={{
            padding: '5px 10px', backgroundColor: searchQuery ? '#333' : '#2a2a2a', color: searchQuery ? '#ddd' : '#666',
            border: '1px solid #444', borderRadius: 4, cursor: searchQuery ? 'pointer' : 'default', fontSize: 13,
          }}>Clear</button>
        </form>
        <SortControl sortBy={sortBy} sortOrder={sortOrder} onSortByChange={handleSortByChange} onSortOrderToggle={handleSortOrderToggle} />
        <button onClick={handleScan} disabled={scanning} style={{
          padding: '5px 12px', backgroundColor: scanning ? '#333' : '#2563eb', color: '#fff',
          border: 'none', borderRadius: 4, cursor: scanning ? 'default' : 'pointer', fontSize: 13, whiteSpace: 'nowrap',
        }}>{scanning ? 'Scanning...' : 'Scan Directory'}</button>
        <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
          {displayedCount} item{displayedCount !== 1 ? 's' : ''}
        </span>
      </div>

      <FilterBar
        readStatus={readStatus}
        fileExt={fileExt}
        tag={filterTag}
        availableTags={availableTags}
        onReadStatusChange={handleReadStatusChange}
        onFileExtChange={handleFileExtChange}
        onTagChange={handleTagChange}
      />

      {activeFolder && (
        <div style={{ padding: '6px 12px', backgroundColor: '#202838', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderBottom: '1px solid #334' }}>
          <button onClick={handleBackFromFolder} style={{
            padding: '4px 10px', backgroundColor: '#30394c', color: '#d8e3ff', border: '1px solid #44506a',
            borderRadius: 4, cursor: 'pointer', fontSize: 12,
          }}>Back</button>
          <span style={{ color: '#d8e3ff', fontSize: 13 }}>Virtual folder: {activeFolder.name}</span>
          <span style={{ color: '#7f8ca8', fontSize: 12 }}>{totalCount} comic{totalCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{ padding: '5px 12px', backgroundColor: '#2a2a3a', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderBottom: '1px solid #444', fontSize: 13 }}>
          <span style={{ color: '#aac' }}>{selectedIds.size} selected</span>
          <span style={{ color: '#666', fontSize: 12 }}>— right-click a selected comic for library and folder actions</span>
          {activeFolder && (
            <button onClick={handleRemoveFromFolder} style={{
              padding: '3px 10px', backgroundColor: '#4a2a2a', color: '#faa', border: '1px solid #644',
              borderRadius: 3, cursor: 'pointer', fontSize: 12, marginLeft: 'auto',
            }}>Remove from folder</button>
          )}
          {activeLibraryId != null && !activeFolder && (
            <button onClick={handleRemoveFromLibrary} style={{
              padding: '3px 10px', backgroundColor: '#4a2a2a', color: '#faa', border: '1px solid #644',
              borderRadius: 3, cursor: 'pointer', fontSize: 12, marginLeft: selectedIds.size > 0 ? 0 : 'auto',
            }}>Remove from library</button>
          )}
          <button onClick={() => onSelectionChange(new Set())} style={{
            padding: '3px 10px', backgroundColor: '#333', color: '#ccc', border: '1px solid #555',
            borderRadius: 3, cursor: 'pointer', fontSize: 12, marginLeft: activeFolder || activeLibraryId != null ? 0 : 'auto',
          }}>Clear</button>
        </div>
      )}

      {scanning && scanProgress && (
        <div style={{ padding: '4px 16px', backgroundColor: '#1e3a5f', fontSize: 12, flexShrink: 0 }}>
          Scanning: {scanProgress.processed} / {scanProgress.discovered} processed
        </div>
      )}

      {!activeFolder && activeLibraryId == null && (
        <ContinueReadingShelf mediaType={isBooks ? 'book' : 'comic'} onOpenFile={onOpenFile} refreshKey={refreshKey ?? 0} />
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 12 }}
        onClick={() => { onSelectionChange(new Set()); lastClickedIndex.current = null; }}>
        {visibleItemCount === 0 && !scanning ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: '#666' }}>
            <p style={{ fontSize: 18 }}>{activeFolder ? `No ${isBooks ? 'books' : 'comics'} in this folder` : activeLibraryId != null ? `No ${isBooks ? 'books' : 'comics'} in this library` : isBooks ? 'No books' : 'No comics'}</p>
            {!activeFolder && <p style={{ fontSize: 14 }}>Drag &amp; drop {isBooks ? 'PDF, EPUB, or MOBI' : 'CBZ/CBR'} files here, or use &quot;Scan Directory&quot;.</p>}
          </div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * columnCount;
              const rowItems = gridItems.slice(startIdx, startIdx + columnCount);
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: `translateX(-50%) translateY(${virtualRow.start}px)`,
                    width: gridWidth,
                    height: ROW_HEIGHT,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columnCount}, ${CELL_WIDTH}px)`,
                    gap: GAP,
                  }}
                >
                  {rowItems.map((item) => {
                    if (item.kind === 'folder') {
                      return (
                        <FolderCard
                          key={`folder-${item.folder.id}`}
                          folder={item.folder}
                          isDropTarget={folderDropTargetId === item.folder.id}
                          onDragStart={handleFolderDragStart}
                          onClick={(_e, selectedFolder) => handleOpenFolder(selectedFolder)}
                          onContextMenu={handleFolderContextMenu}
                          onDragOver={handleFolderDragOver}
                          onDragLeave={handleFolderDragLeave}
                          onDrop={handleFolderDrop}
                        />
                      );
                    }
                    return (
                      <ComicCard
                        key={item.comic.id}
                        comic={item.comic}
                        index={item.comicIndex}
                        isSelected={selectedIds.has(item.comic.id)}
                        onDragStart={handleComicDragStart}
                        onClick={handleComicClick}
                        onContextMenu={handleComicContextMenu}
                        onDoubleClick={onOpenFile}
                        onCheckboxClick={handleCheckboxClick}
                      />
                    );
                  })}
                </div>
              );
            })}
            {loadingMore && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', padding: 16, color: '#666', fontSize: 13 }}>Loading more...</div>}
          </div>
        )}
      </div>
      {contextMenu && (
        <ComicContextMenu
          state={contextMenu}
          activeLibraryId={activeLibraryId}
          createMode={contextCreateMode}
          createName={contextCreateName}
          createError={contextCreateError}
          creating={contextCreating}
          onCreateModeChange={(mode) => {
            setContextCreateMode(mode);
            setContextCreateError(null);
          }}
          onCreateNameChange={setContextCreateName}
          onCreateCancel={() => {
            setContextCreateMode(null);
            setContextCreateName('');
            setContextCreateError(null);
          }}
          onAddToLibrary={handleContextAddToLibrary}
          onCreateLibrary={handleContextCreateLibrary}
          onAddToFolder={handleContextAddToFolder}
          onCreateFolder={handleContextCreateFolder}
          onViewDetails={handleContextDetails}
          onDelete={handleContextDelete}
        />
      )}
      {folderContextMenu && (
        <FolderContextMenu
          state={folderContextMenu}
          renaming={renamingFolder}
          renameName={folderRenameName}
          renameError={folderRenameError}
          onRenameNameChange={setFolderRenameName}
          onStartRename={() => setRenamingFolder(true)}
          onSubmitRename={handleSubmitRenameFolder}
          onDelete={handleDeleteFolder}
          onCancel={closeFolderContextMenu}
        />
      )}
      {detailsComic && (
        <DetailsModal
          comic={detailsComic}
          loading={detailsLoading}
          onClose={() => setDetailsComic(null)}
        />
      )}
    </div>
  );
};
