import React, { useEffect, useState, useCallback } from 'react';
import {
  addComicsToLibrary,
  addFoldersToLibrary,
  createLibrary,
  deleteLibrary,
  getLibraries,
  renameLibrary,
} from '../ipcClient';
import type { LibrarySummary } from '../../shared/ipcTypes';

type LibraryItem = LibrarySummary;

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_MARGIN = 8;
const CONTEXT_MENU_HEIGHT = 96;
const RENAME_CONTEXT_MENU_HEIGHT = 178;

interface LibraryContextMenu {
  x: number;
  y: number;
  library: LibraryItem;
}

interface Props {
  activeLibraryId: number | null;
  activeView: 'comics' | 'books';
  onSelectLibrary: (id: number | null) => void;
  onSelectView: (view: 'comics' | 'books') => void;
  onLibrariesChanged: () => void;
}

export const LibrarySidebar: React.FC<Props> = ({ activeLibraryId, activeView, onSelectLibrary, onSelectView, onLibrariesChanged }) => {
  const [comicLibraries, setComicLibraries] = useState<LibraryItem[]>([]);
  const [bookLibraries, setBookLibraries] = useState<LibraryItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [creatingFor, setCreatingFor] = useState<'comics' | 'books' | null>(null);
  const [newName, setNewName] = useState('');
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<LibraryContextMenu | null>(null);
  const [contextRenaming, setContextRenaming] = useState(false);
  const [contextRenameName, setContextRenameName] = useState('');
  const [contextError, setContextError] = useState<string | null>(null);

  const loadLibraries = useCallback(async () => {
    const [comics, books] = await Promise.all([
      getLibraries('comic'),
      getLibraries('book'),
    ]);
    setComicLibraries(comics ?? []);
    setBookLibraries(books ?? []);
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);
  useEffect(() => { loadLibraries(); }, [activeLibraryId, loadLibraries]);

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

  const closeContextMenu = () => {
    setContextMenu(null);
    setContextRenaming(false);
    setContextRenameName('');
    setContextError(null);
  };

  const handleLibraryContextMenu = (e: React.MouseEvent, lib: LibraryItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, library: lib });
    setContextRenaming(false);
    setContextRenameName(lib.name);
    setContextError(null);
  };

  const handleContextRename = async () => {
    if (!contextMenu) return;
    const name = contextRenameName.trim();
    if (!name || name === contextMenu.library.name) { closeContextMenu(); return; }
    try {
      await renameLibrary(contextMenu.library.id, name);
      closeContextMenu();
      await loadLibraries();
      onLibrariesChanged();
    } catch (err) {
      console.error('Failed to rename library:', err);
      setContextError(err instanceof Error ? err.message : 'Failed to rename library.');
    }
  };

  const handleContextDelete = async () => {
    if (!contextMenu) return;
    const confirmed = window.confirm(`Delete library "${contextMenu.library.name}"?\n\nThis will not delete any files.`);
    if (!confirmed) return;
    await deleteLibrary(contextMenu.library.id);
    if (activeLibraryId === contextMenu.library.id) onSelectLibrary(null);
    closeContextMenu();
    await loadLibraries();
    onLibrariesChanged();
  };

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
    if (e.dataTransfer.types.includes('application/comic-ids') || e.dataTransfer.types.includes('application/folder-ids')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
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
      if (comicIds.length > 0) await addComicsToLibrary(libId, comicIds);
      if (folderIds.length > 0) await addFoldersToLibrary(libId, folderIds);
      if (comicIds.length > 0 || folderIds.length > 0) {
        await loadLibraries();
        onLibrariesChanged();
      }
    } catch { /* ignore */ }
  };

  const selectLibrary = (lib: LibraryItem) => {
    onSelectView(lib.mediaType === 'book' ? 'books' : 'comics');
    onSelectLibrary(lib.id);
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
