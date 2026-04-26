import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FilterPreset } from '../../shared/types';
import { parseFilterPreset } from '../../shared/filterLogic';
import { ContinueReadingShelf } from './ContinueReadingShelf';
import { useConfirm } from './useConfirm';
import { SortControl } from './SortControl';
import { FilterBar } from './FilterBar';
import { ComicCard } from './library/ComicCard';
import { FolderCard } from './library/FolderCard';
import { ComicContextMenu } from './library/ComicContextMenu';
import { FolderContextMenu } from './library/FolderContextMenu';
import { DetailsModal } from './library/DetailsModal';
import { getFileExtension } from './library/utils';
import { useScanProgress } from './library/hooks/useScanProgress';
import { useLibraryQuery } from './library/hooks/useLibraryQuery';
import { useLibraryFilters } from './library/hooks/useLibraryFilters';
import { useLibrarySelection } from './library/hooks/useLibrarySelection';
import { useDetailsModal } from './library/hooks/useDetailsModal';
import { useFolderContextMenu } from './library/hooks/useFolderContextMenu';
import { useDragDropFiles } from './library/hooks/useDragDropFiles';
import { useComicContextMenu } from './library/hooks/useComicContextMenu';
import {
  CELL_WIDTH, GAP, ROW_HEIGHT,
  type ComicEntry, type FolderEntry,
  type ComicContextMenuState,
} from './library/types';
import {
  getFolders,
  openDirectoryDialog,
  removeComicsFromLibrary,
  removeComicsFromFolder,
  refreshBookMetadata,
  scanDirectory,
  scanBooksDirectory,
  cancelScan,
  getAllTags,
  getAppMeta,
  setAppMeta,
} from '../ipcClient';

interface Props {
  activeLibraryId: number | null;
  activeFolderId: number | null;
  activeView: 'all' | 'comics' | 'books';
  onOpenFile: (filePath: string) => void;
  onComicsChanged: () => void;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  refreshKey?: number;
}

export const LibraryView: React.FC<Props> = ({
  activeLibraryId, activeFolderId, activeView, onOpenFile, onComicsChanged, selectedIds, onSelectionChange, refreshKey,
}) => {
  const { confirm, modal: confirmModal } = useConfirm();
  const [activeFolder, setActiveFolder] = useState<{ id: number; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const { scanProgress, setScanProgress } = useScanProgress();
  // Drag-drop state + handlers come from useDragDropFiles below (instantiated
  // after loadInitial is in scope).
  // contextMenu / contextCreate* state come from useComicContextMenu below.
  const { detailsComic, setDetailsComic, detailsLoading, setDetailsLoading, closeDetails } = useDetailsModal();
  const [columnCount, setColumnCount] = useState(4);
  const scrollRef = useRef<HTMLDivElement>(null);
  const folderThumbnailUrls = useRef<Set<string>>(new Set());
  const activeFolderRef = useRef<{ id: number; name: string } | null>(activeFolder);
  activeFolderRef.current = activeFolder;

  // --- Filters hook ---
  const persistAndReset = useCallback((preset: FilterPreset) => {
    setAppMeta('filterPreset', JSON.stringify(preset)).catch((err) =>
      console.warn('Failed to persist filter preset:', err)
    );
    setComics([]);
    setTotalCount(0);
  }, []);

  const {
    sortBy, setSortBy, sortOrder, setSortOrder,
    readStatus, setReadStatus, fileExt, setFileExt,
    filterTag, setFilterTag, availableTags, setAvailableTags,
    handleSortByChange, handleSortOrderToggle,
    handleReadStatusChange, handleFileExtChange, handleTagChange,
  } = useLibraryFilters({ onPresetChange: persistAndReset });

  // --- Query hook ---
  const {
    comics, folders, totalCount, loadingMore, hasMore,
    loadInitial, loadMore, setComics, setTotalCount,
  } = useLibraryQuery({
    activeFolder, activeLibraryId, activeView,
    sortBy, sortOrder, readStatus, fileExt, filterTag,
  });

  const isBooks = activeView === 'books';
  const isAll = activeView === 'all';
  const mediaLabel = isAll ? 'items' : isBooks ? 'books' : 'comics';

  // --- Selection hook ---
  const { handleComicClick, handleCheckboxClick, handleComicDragStart } = useLibrarySelection({
    comics,
    selectedIds,
    onSelectionChange,
  });

  // --- Folder context menu hook ---
  const {
    folderContextMenu,
    setFolderContextMenu,
    renamingFolder,
    setRenamingFolder,
    folderRenameName,
    setFolderRenameName,
    folderRenameError,
    closeFolderContextMenu,
    handleSubmitRenameFolder,
    handleDeleteFolder,
  } = useFolderContextMenu({
    activeFolder,
    setActiveFolder,
    reload: () => loadInitial(searchQuery),
    onChanged: onComicsChanged,
    confirm,
  });

  // --- Drag-drop hook ---
  const {
    dragOver, adding, folderDropTargetId,
    handleDragOver, handleDragLeave, handleDrop,
    handleFolderDragOver, handleFolderDragLeave, handleFolderDrop,
  } = useDragDropFiles({
    activeLibraryId, activeView, searchQuery,
    reload: loadInitial,
    onSelectionChange,
    onComicsChanged,
  });

  // --- Comic context menu hook ---
  const {
    contextMenu, setContextMenu,
    contextCreateMode, setContextCreateMode,
    contextCreateName, setContextCreateName,
    contextCreateError, setContextCreateError,
    contextCreating,
    openContextMenu: handleComicContextMenu,
    closeContextMenu,
    handleContextAddToLibrary, handleContextCreateLibrary,
    handleContextAddToFolder, handleContextCreateFolder,
    handleContextDelete,
  } = useComicContextMenu({
    selectedIds, onSelectionChange,
    activeLibraryId, activeView, activeFolderRef,
    reload: () => loadInitial(searchQuery),
    onChanged: onComicsChanged,
    confirm,
  });

  useEffect(() => {
    let cancelled = false;

    if (activeFolderId == null) {
      if (activeFolderRef.current != null) {
        setActiveFolder(null);
      }
      return undefined;
    }

    if (activeFolderRef.current?.id === activeFolderId) {
      return undefined;
    }

    getFolders()
      .then((allFolders) => {
        if (cancelled) return;
        const match = allFolders.find((f) => f.id === activeFolderId);
        if (match) {
          setActiveFolder({ id: match.id, name: match.name });
        }
      })
      .catch((err) => {
        console.error('Failed to sync active folder:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeFolderId]);

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

  // URL cleanup effect for folder thumbnails.
  useEffect(() => {
    const currentUrls = new Set(folders.map((folder) => folder.thumbnailUrl).filter((url): url is string => url !== null));
    for (const url of folderThumbnailUrls.current) {
      if (!currentUrls.has(url)) URL.revokeObjectURL(url);
    }
    folderThumbnailUrls.current = currentUrls;
  }, [folders]);

  useEffect(() => () => {
    for (const url of folderThumbnailUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    onSelectionChange(new Set());
    loadInitial();
  }, [loadInitial, activeFolder]);

  useEffect(() => {
    setActiveFolder(null);
  }, [activeLibraryId, activeView]);

  // Load initial filter preset + tags on mount
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
      closeContextMenu();
      closeFolderContextMenu();
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
      if (activeView === 'all') {
        await scanDirectory(dirPath);
        await scanBooksDirectory(dirPath);
      } else if (activeView === 'books') {
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
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: number) => {
    e.dataTransfer.setData('application/folder-ids', JSON.stringify([folderId]));
    e.dataTransfer.effectAllowed = 'link';
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: FolderEntry) => {
    // Close the comic context menu first; the hook handles its own state.
    setContextMenu(null);
    e.preventDefault();
    e.stopPropagation();
    setRenamingFolder(false);
    setFolderRenameName(folder.name);
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const handleBackFromFolder = () => {
    setActiveFolder(null);
    onSelectionChange(new Set());
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // handleDragOver / handleDragLeave / handleDrop come from useDragDropFiles above.

  // handleComicContextMenu / closeContextMenu / handleContextAddToLibrary /
  // handleContextCreateLibrary / handleContextAddToFolder /
  // handleContextCreateFolder / handleContextDelete come from
  // useComicContextMenu above.

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

  // handleFolderDragOver / Leave / Drop come from useDragDropFiles above.

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
      {adding && <div style={{ padding: '4px 16px', backgroundColor: '#1e3a5f', fontSize: 12, flexShrink: 0 }}>Adding {mediaLabel}...</div>}

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
        <div style={{ padding: '4px 16px', backgroundColor: '#1e3a5f', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Scanning: {scanProgress.processed} / {scanProgress.discovered} processed</span>
          <button
            onClick={cancelScan}
            style={{ padding: '1px 8px', fontSize: 11, cursor: 'pointer', background: '#7f1d1d', border: 'none', color: '#fca5a5', borderRadius: 3 }}
          >Cancel</button>
        </div>
      )}

      {!activeFolder && activeLibraryId == null && (
        <ContinueReadingShelf mediaType={isAll ? undefined : (isBooks ? 'book' : 'comic')} onOpenFile={onOpenFile} refreshKey={refreshKey ?? 0} />
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 12 }}
        onClick={() => { onSelectionChange(new Set()); }}>
        {visibleItemCount === 0 && !scanning ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: '#666' }}>
            <p style={{ fontSize: 18 }}>{activeFolder ? `No ${mediaLabel} in this folder` : activeLibraryId != null ? `No ${mediaLabel} in this library` : `No ${mediaLabel}`}</p>
            {!activeFolder && <p style={{ fontSize: 14 }}>Drag &amp; drop {isAll ? 'comic or book' : isBooks ? 'PDF, EPUB, or MOBI' : 'CBZ/CBR'} files here, or use &quot;Scan Directory&quot;.</p>}
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
          onClose={closeDetails}
        />
      )}
      {confirmModal}
    </div>
  );
};
