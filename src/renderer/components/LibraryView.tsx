import React, { memo, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { isComicArchive, isSupportedFile } from '../../shared/dropValidator';
import type { QueryOptions } from '../../shared/types';
import { ContinueReadingShelf } from './ContinueReadingShelf';
import {
  addComicFiles,
  addComicsToFolder,
  addComicsToLibrary,
  addFoldersToLibrary,
  createLibrary,
  createFolder,
  deleteFolder,
  getPathForFile,
  getFolders,
  getLibraries,
  onScanProgress,
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
} from '../ipcClient';
import type { LibrarySummary } from '../../shared/ipcTypes';

interface ComicEntry {
  id: number;
  title: string;
  pageCount: number;
  fileSize: number;
  filePath: string;
  thumbnailUrl: string | null;
  mediaType: 'comic' | 'book';
}

interface FolderEntry {
  id: number;
  name: string;
  comicCount: number;
  thumbnailUrl: string | null;
}

interface ComicContextMenu {
  x: number;
  y: number;
  comic: ComicEntry;
  comicIds: number[];
  libraries: LibrarySummary[];
  folders: FolderEntry[];
  loading: boolean;
}

interface FolderContextMenu {
  x: number;
  y: number;
  folder: FolderEntry;
}

interface Props {
  activeLibraryId: number | null;
  activeView: 'comics' | 'books';
  onOpenFile: (filePath: string) => void;
  onComicsChanged: () => void;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  refreshKey?: number;
}

const CELL_WIDTH = 180;
const GAP = 12;
const PAGE_SIZE = 50;
const CELL_HEIGHT = Math.round(CELL_WIDTH * 1.4) + 30; // image area + title area
const ROW_HEIGHT = CELL_HEIGHT + GAP;
const FOLDER_ICON_URL = new URL('../../../folder.png', import.meta.url).href;

function parseThumb(data: unknown): string | null {
  if (!data) return null;
  try {
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (isSerializedBuffer(data)) bytes = new Uint8Array(data.data);
    else if (data instanceof Uint8Array) bytes = data;
    else if (typeof data === 'object') bytes = new Uint8Array(Object.values(data) as number[]);
    else return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy.buffer]));
  } catch { return null; }
}

function isSerializedBuffer(data: unknown): data is { type: 'Buffer'; data: number[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'data' in data &&
    data.type === 'Buffer' &&
    Array.isArray(data.data)
  );
}

function getFileExtension(filePath: string): string {
  const filename = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

function formatPageDetails(comic: ComicEntry): string {
  if (comic.pageCount > 0) {
    return `${comic.pageCount} page${comic.pageCount === 1 ? '' : 's'}`;
  }

  const ext = getFileExtension(comic.filePath);
  if (comic.mediaType === 'book' && ext === 'epub') return 'Reflowable EPUB';
  return 'Unknown';
}

interface FolderCardProps {
  folder: FolderEntry;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent, folderId: number) => void;
  onClick: (e: React.MouseEvent, folder: FolderEntry) => void;
  onContextMenu: (e: React.MouseEvent, folder: FolderEntry) => void;
  onDragOver: (e: React.DragEvent, folderId: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, folder: FolderEntry) => void;
}

const FolderCard = memo(function FolderCard({
  folder,
  isDropTarget,
  onDragStart,
  onClick,
  onContextMenu,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderCardProps) {
  return (
    <div draggable
      onDragStart={(e) => onDragStart(e, folder.id)}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, folder);
      }}
      onContextMenu={(e) => onContextMenu(e, folder)}
      onDragOver={(e) => onDragOver(e, folder.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, folder)}
      style={{
        width: CELL_WIDTH, cursor: 'pointer', textAlign: 'center',
        borderRadius: 6, overflow: 'hidden',
        backgroundColor: isDropTarget ? '#1d3b2a' : '#242b36',
        transition: 'transform 0.1s, background-color 0.1s',
        outline: isDropTarget ? '2px solid #4ade80' : '1px solid #334155',
        outlineOffset: isDropTarget ? -2 : 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ width: CELL_WIDTH, height: CELL_WIDTH * 1.4, backgroundColor: '#2f3a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {folder.thumbnailUrl ? (
          <img src={folder.thumbnailUrl} alt={folder.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.58 }} loading="lazy" decoding="async" />
        ) : (
          <span style={{ color: '#789', fontSize: 48 }}>📁</span>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.05), rgba(15,23,42,0.72))' }} />
        <div style={{
          position: 'absolute', top: 8, left: 8, width: 34, height: 28, borderRadius: 5,
          backgroundColor: 'transparent', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 0,
        }}>
          <img src={FOLDER_ICON_URL} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} decoding="async" />
        </div>
        <div style={{
          position: 'absolute', right: 8, bottom: 8, padding: '3px 8px', borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 12,
        }}>{folder.comicCount} item{folder.comicCount !== 1 ? 's' : ''}</div>
      </div>
      <div style={{ padding: '6px 8px', fontSize: 12, color: '#d8e3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {folder.name}
      </div>
    </div>
  );
});

interface ComicCardProps {
  comic: ComicEntry;
  index: number;
  isSelected: boolean;
  onDragStart: (e: React.DragEvent, comicId: number) => void;
  onClick: (e: React.MouseEvent, index: number) => void;
  onContextMenu: (e: React.MouseEvent, comic: ComicEntry) => void;
  onDoubleClick: (filePath: string) => void;
  onCheckboxClick: (e: React.MouseEvent, comicId: number) => void;
}

const ComicCard = memo(function ComicCard({
  comic,
  index,
  isSelected,
  onDragStart,
  onClick,
  onContextMenu,
  onDoubleClick,
  onCheckboxClick,
}: ComicCardProps) {
  return (
    <div draggable
      onDragStart={(e) => onDragStart(e, comic.id)}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, index);
      }}
      onContextMenu={(e) => onContextMenu(e, comic)}
      onDoubleClick={() => onDoubleClick(comic.filePath)}
      style={{
        width: CELL_WIDTH, cursor: 'pointer', textAlign: 'center',
        borderRadius: 6, overflow: 'hidden', backgroundColor: isSelected ? '#2a2a3a' : '#252525',
        border: isSelected ? '2px solid #5b9aff' : '2px solid transparent',
        boxShadow: isSelected ? '0 0 0 1px rgba(91,154,255,0.45) inset' : 'none',
        transition: 'transform 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ width: CELL_WIDTH, height: CELL_WIDTH * 1.4, backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div onClick={(e) => onCheckboxClick(e, comic.id)} style={{
          position: 'absolute', top: 6, right: 6, width: 20, height: 20,
          borderRadius: 3, border: '2px solid rgba(255,255,255,0.5)',
          backgroundColor: isSelected ? '#5b9aff' : 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#fff', zIndex: 2, cursor: 'pointer',
          opacity: isSelected ? 1 : 0, transition: 'opacity 0.15s',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = '0'; }}
        >{isSelected ? '✓' : ''}</div>
        {comic.thumbnailUrl ? (
          <img src={comic.thumbnailUrl} alt={comic.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
        ) : (
          <span style={{ color: '#555', fontSize: 40 }}>📖</span>
        )}
      </div>
      <div style={{ padding: '6px 8px', fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {comic.title}
      </div>
    </div>
  );
});

export const LibraryView: React.FC<Props> = ({
  activeLibraryId, activeView, onOpenFile, onComicsChanged, selectedIds, onSelectionChange, refreshKey,
}) => {
  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [activeFolder, setActiveFolder] = useState<{ id: number; name: string } | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ discovered: number; processed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shelfRefreshKey, setShelfRefreshKey] = useState(0);
  const [folderDropTargetId, setFolderDropTargetId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ComicContextMenu | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenu | null>(null);
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

  // Track container width to compute column count
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const computeColumns = () => {
      const width = el.clientWidth - GAP; // subtract padding
      const cols = Math.max(1, Math.floor((width + GAP) / (CELL_WIDTH + GAP)));
      setColumnCount(cols);
    };
    computeColumns();
    const ro = new ResizeObserver(computeColumns);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Unified items list: folders first, then comics
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
      sortBy: 'title',
      sortOrder: 'asc',
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
  }, [activeFolder, activeLibraryId, activeView]);

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

  // Reset on library change
  useEffect(() => {
    onSelectionChange(new Set());
    lastClickedIndex.current = null;
    loadInitial();
  }, [loadInitial, activeFolder]);

  useEffect(() => {
    setActiveFolder(null);
  }, [activeLibraryId, activeView]);

  // Trigger loadMore when virtual rows near the end become visible
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  useEffect(() => {
    if (!hasMore || loadingMore) return;
    if (!lastVirtualRow) return;
    // If the last visible virtual row is within 2 rows of the end, load more
    if (lastVirtualRow.index >= rowCount - 3) {
      loadMore();
    }
  }, [lastVirtualRow?.index, rowCount, hasMore, loadingMore, loadMore]);

  useEffect(() => {
    const unsub = onScanProgress((progress) => {
      setScanProgress({ discovered: progress.discovered, processed: progress.processed });
    });
    return unsub;
  }, []);

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
    const comicPaths = Array.from(e.dataTransfer.files)
      .filter((file) => isSupportedFile(file.name))
      .map((file) => getPathForFile(file))
      .filter((filePath) => filePath.length > 0);
    if (!comicPaths.length) return;
    setAdding(true);
    try {
      const result = await addComicFiles(comicPaths);
      await loadInitial(searchQuery);
      if (result?.added > 0) onComicsChanged();
      if (result?.errors.length) console.error('Failed to add some comics:', result.errors);
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
  }, [onSelectionChange]);

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

    const confirmed = window.confirm(`Delete ${count} comic${count !== 1 ? 's' : ''} from the database?\n\nThis will not delete files from disk.`);
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

  // Compute grid width for centering: columns * cell + (columns-1) * gap
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
        <button onClick={handleScan} disabled={scanning} style={{
          padding: '5px 12px', backgroundColor: scanning ? '#333' : '#2563eb', color: '#fff',
          border: 'none', borderRadius: 4, cursor: scanning ? 'default' : 'pointer', fontSize: 13, whiteSpace: 'nowrap',
        }}>{scanning ? 'Scanning...' : 'Scan Directory'}</button>
        <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
          {displayedCount} item{displayedCount !== 1 ? 's' : ''}
        </span>
      </div>

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
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            minWidth: 220, maxWidth: 300, backgroundColor: '#202020', color: '#ddd',
            border: '1px solid #444', borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            padding: 6, fontSize: 13,
          }}
        >
          <div style={{ padding: '6px 8px', color: '#9ca3af', borderBottom: '1px solid #333', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contextMenu.comicIds.length > 1 ? `${contextMenu.comicIds.length} comics selected` : contextMenu.comic.title}
          </div>

          <ContextMenuGroup title="Add to library">
            {contextMenu.loading ? (
              <ContextMenuItem label="Loading..." disabled />
            ) : (
              <>
                {contextMenu.libraries.length ? (
                  contextMenu.libraries.map((library) => (
                    <ContextMenuItem key={library.id} label={library.name} onClick={() => handleContextAddToLibrary(library.id)} />
                  ))
                ) : (
                  <ContextMenuItem label="No libraries" disabled />
                )}
                <ContextMenuItem
                  label="Add to new library..."
                  onClick={() => {
                    setContextCreateMode('library');
                    setContextCreateName('');
                    setContextCreateError(null);
                  }}
                />
                {contextCreateMode === 'library' && (
                  <ContextCreateForm
                    placeholder="Library name"
                    value={contextCreateName}
                    error={contextCreateError}
                    creating={contextCreating}
                    onChange={setContextCreateName}
                    onSubmit={handleContextCreateLibrary}
                    onCancel={() => {
                      setContextCreateMode(null);
                      setContextCreateName('');
                      setContextCreateError(null);
                    }}
                  />
                )}
              </>
            )}
          </ContextMenuGroup>

          <ContextMenuGroup title="Add to virtual folder">
            {contextMenu.loading ? (
              <ContextMenuItem label="Loading..." disabled />
            ) : (
              <>
                {contextMenu.folders.length ? (
                  contextMenu.folders.map((folder) => (
                    <ContextMenuItem key={folder.id} label={folder.name} onClick={() => handleContextAddToFolder(folder.id)} />
                  ))
                ) : (
                  <ContextMenuItem label="No folders" disabled />
                )}
                <ContextMenuItem
                  label="Add to new folder..."
                  onClick={() => {
                    setContextCreateMode('folder');
                    setContextCreateName('');
                    setContextCreateError(null);
                  }}
                />
                {contextCreateMode === 'folder' && (
                  <ContextCreateForm
                    placeholder="Folder name"
                    value={contextCreateName}
                    error={contextCreateError}
                    creating={contextCreating}
                    onChange={setContextCreateName}
                    onSubmit={handleContextCreateFolder}
                    onCancel={() => {
                      setContextCreateMode(null);
                      setContextCreateName('');
                      setContextCreateError(null);
                    }}
                  />
                )}
              </>
            )}
          </ContextMenuGroup>

          <div style={{ height: 1, backgroundColor: '#333', margin: '4px 0' }} />
          <ContextMenuItem label="View details" onClick={handleContextDetails} />
          <ContextMenuItem label={activeLibraryId != null ? 'Remove from this library' : 'Delete from database'} danger onClick={handleContextDelete} />
        </div>
      )}
      {folderContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: 'fixed', left: folderContextMenu.x, top: folderContextMenu.y, zIndex: 1000,
            minWidth: 200, backgroundColor: '#202020', color: '#ddd',
            border: '1px solid #444', borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            padding: 6, fontSize: 13,
          }}
        >
          <div style={{ padding: '6px 8px', color: '#9ca3af', borderBottom: '1px solid #333', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderContextMenu.folder.name}
          </div>
          {renamingFolder ? (
            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                autoFocus
                value={folderRenameName}
                onChange={(e) => setFolderRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitRenameFolder();
                  if (e.key === 'Escape') closeFolderContextMenu();
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '5px 7px',
                  backgroundColor: '#111827', color: '#eee', border: '1px solid #4b5563',
                  borderRadius: 4, outline: 'none', fontSize: 13,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleSubmitRenameFolder}
                  disabled={!folderRenameName.trim()}
                  style={{
                    flex: 1, padding: '5px 8px', backgroundColor: folderRenameName.trim() ? '#2563eb' : '#333',
                    color: '#fff', border: 'none', borderRadius: 4,
                    cursor: folderRenameName.trim() ? 'pointer' : 'default', fontSize: 12,
                  }}
                >Save</button>
                <button
                  type="button"
                  onClick={closeFolderContextMenu}
                  style={{
                    flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc',
                    border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  }}
                >Cancel</button>
              </div>
              {folderRenameError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{folderRenameError}</div>}
            </div>
          ) : (
            <>
              <ContextMenuItem label="Rename folder" onClick={() => setRenamingFolder(true)} />
              <ContextMenuItem label="Delete folder" danger onClick={handleDeleteFolder} />
              {folderRenameError && <div style={{ color: '#fca5a5', fontSize: 12, padding: '4px 8px' }}>{folderRenameError}</div>}
            </>
          )}
        </div>
      )}
      {detailsComic && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailsComic(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            backgroundColor: 'rgba(0,0,0,0.58)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              backgroundColor: '#202020',
              color: '#e5e7eb',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #333' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailsComic.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2, textTransform: 'uppercase' }}>{getFileExtension(detailsComic.filePath) || detailsComic.mediaType}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsComic(null)}
                style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #444', backgroundColor: '#2a2a2a', color: '#ddd', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                aria-label="Close details"
              >x</button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: '10px 14px', fontSize: 13 }}>
              <DetailLabel>Path</DetailLabel>
              <div style={{ overflowWrap: 'anywhere', color: '#d1d5db' }}>{detailsComic.filePath}</div>
              <DetailLabel>Pages</DetailLabel>
              <div>{detailsLoading ? 'Reading metadata...' : formatPageDetails(detailsComic)}</div>
              <DetailLabel>Size</DetailLabel>
              <div>{formatBytes(detailsComic.fileSize)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#9ca3af' }}>{children}</div>;
}

function ContextMenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ padding: '5px 8px 2px', color: '#7f8a9a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      {children}
    </div>
  );
}

function ContextMenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '6px 8px', textAlign: 'left',
        backgroundColor: 'transparent', color: disabled ? '#666' : danger ? '#fca5a5' : '#ddd',
        border: 'none', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = danger ? '#3a2222' : '#303030'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function ContextCreateForm({
  placeholder,
  value,
  error,
  creating,
  onChange,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  value: string;
  error: string | null;
  creating: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const trimmed = value.trim();

  return (
    <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed && !creating) onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '5px 7px',
          backgroundColor: '#111827', color: '#eee', border: '1px solid #4b5563',
          borderRadius: 4, outline: 'none', fontSize: 13,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!trimmed || creating}
          style={{
            flex: 1, padding: '5px 8px', backgroundColor: trimmed && !creating ? '#2563eb' : '#333',
            color: '#fff', border: 'none', borderRadius: 4,
            cursor: trimmed && !creating ? 'pointer' : 'default', fontSize: 12,
          }}
        >{creating ? 'Creating...' : 'Create'}</button>
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          style={{
            flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc',
            border: 'none', borderRadius: 4, cursor: creating ? 'default' : 'pointer', fontSize: 12,
          }}
        >Cancel</button>
      </div>
      {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
