import React, { useEffect, useState, useCallback } from 'react';
import { useConfirm } from './useConfirm';
import { useSidebarLibraryContextMenu } from './library/hooks/useSidebarLibraryContextMenu';
import {
  addComicFiles,
  addComicsToLibrary,
  addFoldersToLibrary,
  createLibrary,
  createFolder,
  deleteFolder,
  deleteLibrary,
  getComicByPath,
  getPathForFile,
  getFolders,
  getLibraries,
  renameFolder,
  renameLibrary,
} from '../ipcClient';
import { isSupportedFile } from '../../shared/dropValidator';
import type { FolderSummary, LibrarySummary } from '../../shared/ipcTypes';

type LibraryItem = LibrarySummary;
type FolderItem = { id: number; name: string; comicCount: number };

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_MARGIN = 8;
const CONTEXT_MENU_HEIGHT = 96;
const RENAME_CONTEXT_MENU_HEIGHT = 178;

interface Props {
  activeLibraryId: number | null;
  activeFolderId: number | null;
  activeView: 'all' | 'comics' | 'books';
  onSelectLibrary: (id: number | null) => void;
  onSelectFolder: (id: number | null) => void;
  onSelectView: (view: 'all' | 'comics' | 'books') => void;
  onLibrariesChanged: () => void;
}

export const LibrarySidebar: React.FC<Props> = ({ activeLibraryId, activeFolderId, activeView, onSelectLibrary, onSelectFolder, onSelectView, onLibrariesChanged }) => {
  const { confirm, modal: confirmModal } = useConfirm();
  const [comicLibraries, setComicLibraries] = useState<LibraryItem[]>([]);
  const [bookLibraries, setBookLibraries] = useState<LibraryItem[]>([]);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [creatingFor, setCreatingFor] = useState<'comics' | 'books' | 'folders' | null>(null);
  const [newName, setNewName] = useState('');
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);

  const loadLibraries = useCallback(async () => {
    const [comics, books, folders] = await Promise.all([
      getLibraries('comic'),
      getLibraries('book'),
      getFolders(),
    ]);
    setComicLibraries(comics ?? []);
    setBookLibraries(books ?? []);
    setFolderItems((folders ?? []).map((f) => ({ id: f.id, name: f.name, comicCount: f.comicCount })));
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);
  useEffect(() => { loadLibraries(); }, [activeLibraryId, loadLibraries]);

  // Library row context menu (right-click → rename / delete).
  const {
    contextMenu,
    contextRenaming, setContextRenaming,
    contextRenameName, setContextRenameName,
    contextError,
    openContextMenu,
    closeContextMenu,
    handleContextRename,
    handleContextDelete,
  } = useSidebarLibraryContextMenu({
    activeLibraryId,
    onSelectLibrary,
    reload: loadLibraries,
    onChanged: onLibrariesChanged,
    confirm,
  });

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => closeContextMenu();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const handleCreate = async (mediaType: 'comic' | 'book') => {
    const name = newName.trim();
    if (!name) return;
    await createLibrary(name, mediaType);
    setNewName(''); setCreatingFor(null);
    await loadLibraries();
    onLibrariesChanged();
  };

  const handleRename = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    await renameLibrary(id, name);
    setEditingId(null); setEditName('');
    await loadLibraries();
    onLibrariesChanged();
  };

  const handleDelete = async (id: number) => {
    await deleteLibrary(id);
    if (activeLibraryId === id) onSelectLibrary(null);
    await loadLibraries();
    onLibrariesChanged();
  };

  const startEdit = (lib: LibraryItem) => { setEditingId(lib.id); setEditName(lib.name); };

  // Wrapper just so we keep the original name at call sites.
  const handleLibraryContextMenu = openContextMenu;

  const getContextMenuPosition = () => {
    if (!contextMenu) return { left: 0, top: 0 };

    const menuHeight = contextRenaming
      ? RENAME_CONTEXT_MENU_HEIGHT + (contextError ? 22 : 0)
      : CONTEXT_MENU_HEIGHT;
    const maxLeft = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN;
    const maxTop = window.innerHeight - menuHeight - CONTEXT_MENU_MARGIN;

    return {
      left: Math.max(CONTEXT_MENU_MARGIN, Math.min(contextMenu.x, maxLeft)),
      top: Math.max(CONTEXT_MENU_MARGIN, Math.min(contextMenu.y, maxTop)),
    };
  };

  const handleLibDragOver = (e: React.DragEvent, libId: number) => {
    if (
      e.dataTransfer.types.includes('application/comic-ids') ||
      e.dataTransfer.types.includes('application/folder-ids') ||
      e.dataTransfer.types.includes('Files')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'link';
      setDropTargetId(libId);
    }
  };
  const handleLibDragLeave = () => { setDropTargetId(null); };
  const handleLibDrop = async (e: React.DragEvent, libId: number) => {
    e.preventDefault();
    setDropTargetId(null);
    try {
      const comicData = e.dataTransfer.getData('application/comic-ids');
      const folderData = e.dataTransfer.getData('application/folder-ids');
      const comicIds = comicData ? JSON.parse(comicData) as number[] : [];
      const folderIds = folderData ? JSON.parse(folderData) as number[] : [];
      const droppedFileIds = await addDroppedFilesToLibrary(e, libId);
      const idsToAdd = Array.from(new Set([...comicIds, ...droppedFileIds]));
      if (idsToAdd.length > 0) await addComicsToLibrary(libId, idsToAdd);
      if (folderIds.length > 0) await addFoldersToLibrary(libId, folderIds);
      if (idsToAdd.length > 0 || folderIds.length > 0) {
        await loadLibraries();
        onLibrariesChanged();
      }
    } catch { /* ignore */ }
  };

  const addDroppedFilesToLibrary = async (e: React.DragEvent, libId: number): Promise<number[]> => {
    if (!e.dataTransfer.types.includes('Files')) return [];

    const filePaths = Array.from(e.dataTransfer.files)
      .filter((file) => isSupportedFile(file.name))
      .filter((file) => isFileCompatibleWithLibrary(file.name, libId))
      .map((file) => getPathForFile(file))
      .filter((filePath) => filePath.length > 0);

    if (filePaths.length === 0) return [];

    const result = await addComicFiles(filePaths);
    if (result?.errors.length) console.error('Failed to add some dropped files:', result.errors);

    const records = await Promise.all(filePaths.map((filePath) => getComicByPath(filePath)));
    return records.flatMap((record) => record ? [record.id] : []);
  };

  const isFileCompatibleWithLibrary = (filename: string, libId: number): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const isBook = ext === 'pdf' || ext === 'epub' || ext === 'mobi';
    const libraries = isBook ? bookLibraries : comicLibraries;
    return libraries.some((lib) => lib.id === libId);
  };

  const selectLibrary = (lib: LibraryItem) => {
    onSelectFolder(null);
    onSelectView(lib.mediaType === 'book' ? 'books' : 'comics');
    onSelectLibrary(lib.id);
  };

  const selectFolder = (folder: FolderItem) => {
    onSelectLibrary(null);
    onSelectFolder(folder.id);
  };

  const handleCreateFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    await createFolder(name, []);
    setNewName(''); setCreatingFor(null);
    await loadLibraries();
    onLibrariesChanged();
  };

  const handleRenameFolder = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    await renameFolder(id, name);
    setEditingId(null); setEditName('');
    await loadLibraries();
    onLibrariesChanged();
  };

  const handleDeleteFolder = async (id: number) => {
    const confirmed = await confirm('Delete this folder?\n\nThis will not delete any files.');
    if (!confirmed) return;
    await deleteFolder(id);
    if (activeFolderId === id) onSelectFolder(null);
    await loadLibraries();
    onLibrariesChanged();
  };

  const renderLibraryItem = (lib: LibraryItem) => (
    <div key={lib.id}
      onClick={() => selectLibrary(lib)}
      onContextMenu={(e) => handleLibraryContextMenu(e, lib)}
      onDragOver={(e) => handleLibDragOver(e, lib.id)}
      onDragLeave={handleLibDragLeave}
      onDrop={(e) => handleLibDrop(e, lib.id)}
      style={{
        padding: '6px 12px 6px 20px', cursor: 'pointer', fontSize: 13,
        backgroundColor: dropTargetId === lib.id ? '#2a3a2a' : activeLibraryId === lib.id ? '#2a2a3a' : 'transparent',
        color: activeLibraryId === lib.id ? '#fff' : '#ccc',
        borderLeft: dropTargetId === lib.id ? '3px solid #4ade80' : activeLibraryId === lib.id ? '3px solid #5b9aff' : '3px solid transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
        transition: 'background-color 0.1s',
      }}
    >
      {editingId === lib.id ? (
        <input autoFocus value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(lib.id); if (e.key === 'Escape') setEditingId(null); }}
          onBlur={() => handleRename(lib.id)}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, backgroundColor: '#333', color: '#eee', border: '1px solid #555', borderRadius: 2, padding: '2px 4px', fontSize: 12, outline: 'none' }}
        />
      ) : (
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{lib.name}</span>
          <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>{lib.comicCount}</span>
          <span onClick={(e) => { e.stopPropagation(); startEdit(lib); }} style={{ cursor: 'pointer', color: '#666', fontSize: 11, flexShrink: 0 }} title="Rename">✎</span>
          <span onClick={(e) => { e.stopPropagation(); handleDelete(lib.id); }} style={{ cursor: 'pointer', color: '#666', fontSize: 11, flexShrink: 0 }} title="Delete">✕</span>
        </>
      )}
    </div>
  );

  const renderCreateInput = (mediaType: 'comic' | 'book') => (
    <div style={{ padding: '6px 12px' }}>
      <input autoFocus placeholder="Library name..." value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(mediaType); if (e.key === 'Escape') { setCreatingFor(null); setNewName(''); } }}
        onBlur={() => { if (newName.trim()) handleCreate(mediaType); else { setCreatingFor(null); setNewName(''); } }}
        style={{ width: '100%', backgroundColor: '#333', color: '#eee', border: '1px solid #555', borderRadius: 2, padding: '4px 6px', fontSize: 12, outline: 'none' }}
      />
    </div>
  );

  const renderFolderCreateInput = () => (
    <div style={{ padding: '6px 12px' }}>
      <input autoFocus placeholder="Folder name..." value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFor(null); setNewName(''); } }}
        onBlur={() => { if (newName.trim()) handleCreateFolder(); else { setCreatingFor(null); setNewName(''); } }}
        style={{ width: '100%', backgroundColor: '#333', color: '#eee', border: '1px solid #555', borderRadius: 2, padding: '4px 6px', fontSize: 12, outline: 'none' }}
      />
    </div>
  );

  return (
    <div style={{
      width: 200, backgroundColor: '#1e1e1e', borderLeft: '1px solid #333',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px', fontSize: 13, fontWeight: 'bold', color: '#aaa',
        borderBottom: '1px solid #333',
      }}>Libraries</div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* All items */}
        <div onClick={() => { onSelectLibrary(null); onSelectFolder(null); onSelectView('all'); }} style={{
          padding: '6px 12px 6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
          color: activeLibraryId === null && activeFolderId === null && activeView === 'all' ? '#fff' : '#ccc',
          borderLeft: activeLibraryId === null && activeFolderId === null && activeView === 'all' ? '3px solid #5b9aff' : '3px solid transparent',
          backgroundColor: activeLibraryId === null && activeFolderId === null && activeView === 'all' ? '#2a2a3a' : 'transparent',
        }}>All</div>

        {/* Books section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 2px' }}>
          <div onClick={() => { onSelectLibrary(null); onSelectView('books'); }} style={{
            cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
            color: activeLibraryId === null && activeView === 'books' ? '#fff' : '#ccc',
          }}>All Books</div>
          <button onClick={() => setCreatingFor('books')} style={{
            background: 'none', border: 'none', color: '#5b9aff', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
          }} title="New book library">+</button>
        </div>
        <div onClick={() => { onSelectLibrary(null); onSelectView('books'); }} style={{
          height: 0, borderLeft: activeLibraryId === null && activeView === 'books' ? '3px solid #5b9aff' : '3px solid transparent',
        }} />
        {bookLibraries.map(renderLibraryItem)}
        {creatingFor === 'books' && renderCreateInput('book')}

        {/* Comics section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 2px' }}>
          <div onClick={() => { onSelectLibrary(null); onSelectView('comics'); }} style={{
            cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
            color: activeLibraryId === null && activeView === 'comics' ? '#fff' : '#ccc',
          }}>All Comics</div>
          <button onClick={() => setCreatingFor('comics')} style={{
            background: 'none', border: 'none', color: '#5b9aff', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
          }} title="New comic library">+</button>
        </div>
        <div onClick={() => { onSelectLibrary(null); onSelectView('comics'); }} style={{
          height: 0, borderLeft: activeLibraryId === null && activeView === 'comics' ? '3px solid #5b9aff' : '3px solid transparent',
        }} />
        {comicLibraries.map(renderLibraryItem)}
        {creatingFor === 'comics' && renderCreateInput('comic')}

        {/* Folders section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 2px' }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ccc' }}>Folders</div>
          <button onClick={() => setCreatingFor('folders')} style={{
            background: 'none', border: 'none', color: '#5b9aff', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
          }} title="New folder">+</button>
        </div>
        {folderItems.map((folder) => (
          <div key={`folder-${folder.id}`}
            onClick={() => selectFolder(folder)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              padding: '6px 12px 6px 20px', cursor: 'pointer', fontSize: 13,
              backgroundColor: activeFolderId === folder.id ? '#2a2a3a' : 'transparent',
              color: activeFolderId === folder.id ? '#fff' : '#ccc',
              borderLeft: activeFolderId === folder.id ? '3px solid #5b9aff' : '3px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              transition: 'background-color 0.1s',
            }}
          >
            {editingId === -folder.id ? (
              <input autoFocus value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setEditingId(null); }}
                onBlur={() => handleRenameFolder(folder.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1, backgroundColor: '#333', color: '#eee', border: '1px solid #555', borderRadius: 2, padding: '2px 4px', fontSize: 12, outline: 'none' }}
              />
            ) : (
              <>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{folder.name}</span>
                <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>{folder.comicCount}</span>
                <span onClick={(e) => { e.stopPropagation(); setEditingId(-folder.id); setEditName(folder.name); }} style={{ cursor: 'pointer', color: '#666', fontSize: 11, flexShrink: 0 }} title="Rename">✎</span>
                <span onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} style={{ cursor: 'pointer', color: '#666', fontSize: 11, flexShrink: 0 }} title="Delete">✕</span>
              </>
            )}
          </div>
        ))}
        {creatingFor === 'folders' && renderFolderCreateInput()}
      </div>

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: 'fixed', ...getContextMenuPosition(), zIndex: 1000,
            width: CONTEXT_MENU_WIDTH, backgroundColor: '#202020', color: '#ddd',
            border: '1px solid #444', borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            padding: 6, fontSize: 13,
          }}
        >
          <div style={{ padding: '6px 8px', color: '#9ca3af', borderBottom: '1px solid #333', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contextMenu.library.name}
          </div>
          {contextRenaming ? (
            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                autoFocus
                value={contextRenameName}
                onChange={(e) => setContextRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleContextRename();
                  if (e.key === 'Escape') closeContextMenu();
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '5px 7px',
                  backgroundColor: '#111827', color: '#eee', border: '1px solid #4b5563',
                  borderRadius: 4, outline: 'none', fontSize: 13,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={handleContextRename} disabled={!contextRenameName.trim()}
                  style={{ flex: 1, padding: '5px 8px', backgroundColor: contextRenameName.trim() ? '#2563eb' : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: contextRenameName.trim() ? 'pointer' : 'default', fontSize: 12 }}
                >Save</button>
                <button type="button" onClick={closeContextMenu}
                  style={{ flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                >Cancel</button>
              </div>
              {contextError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{contextError}</div>}
            </div>
          ) : (
            <>
              <SidebarMenuItem label="Rename library" onClick={() => setContextRenaming(true)} />
              <SidebarMenuItem label="Delete library" danger onClick={handleContextDelete} />
            </>
          )}
        </div>
      )}
      {confirmModal}
    </div>
  );
};

function SidebarMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '6px 8px', textAlign: 'left',
        backgroundColor: 'transparent', color: danger ? '#fca5a5' : '#ddd',
        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = danger ? '#3a2222' : '#303030'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >{label}</button>
  );
}
