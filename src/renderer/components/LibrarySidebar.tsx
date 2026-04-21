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

interface LibraryContextMenu {
  x: number;
  y: number;
  library: LibraryItem;
}

interface Props {
  activeLibraryId: number | null;
  onSelectLibrary: (id: number | null) => void;
  onLibrariesChanged: () => void;
}

export const LibrarySidebar: React.FC<Props> = ({ activeLibraryId, onSelectLibrary, onLibrariesChanged }) => {
  const [libraries, setLibraries] = useState<LibraryItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<LibraryContextMenu | null>(null);
  const [contextRenaming, setContextRenaming] = useState(false);
  const [contextRenameName, setContextRenameName] = useState('');
  const [contextError, setContextError] = useState<string | null>(null);

  const loadLibraries = useCallback(async () => {
    const result = await getLibraries();
    setLibraries(result ?? []);
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  // Reload when external changes happen
  useEffect(() => {
    loadLibraries();
  }, [activeLibraryId, loadLibraries]);

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

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createLibrary(name);
    setNewName(''); setCreating(false);
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
    if (!name || name === contextMenu.library.name) {
      closeContextMenu();
      return;
    }
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
    const confirmed = window.confirm(`Delete library "${contextMenu.library.name}"?\n\nThis will not delete comic files.`);
    if (!confirmed) return;
    await deleteLibrary(contextMenu.library.id);
    if (activeLibraryId === contextMenu.library.id) onSelectLibrary(null);
    closeContextMenu();
    await loadLibraries();
    onLibrariesChanged();
  };

  // Drop handlers for receiving comics or virtual folders
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
      if (comicIds.length > 0) {
        await addComicsToLibrary(libId, comicIds);
      }
      if (folderIds.length > 0) {
        await addFoldersToLibrary(libId, folderIds);
      }
      if (comicIds.length > 0 || folderIds.length > 0) {
        await loadLibraries();
        onLibrariesChanged();
      }
    } catch { /* ignore */ }
  };

  return (
    <div style={{
      width: 200, backgroundColor: '#1e1e1e', borderLeft: '1px solid #333',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px', fontSize: 13, fontWeight: 'bold', color: '#aaa',
        borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Libraries</span>
        <button onClick={() => setCreating(true)} style={{
          background: 'none', border: 'none', color: '#5b9aff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
        }} title="New library">+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* All Comics */}
        <div onClick={() => onSelectLibrary(null)} style={{
          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
          backgroundColor: activeLibraryId === null ? '#2a2a3a' : 'transparent',
          color: activeLibraryId === null ? '#fff' : '#ccc',
          borderLeft: activeLibraryId === null ? '3px solid #5b9aff' : '3px solid transparent',
        }}>All Comics</div>

        {/* Library list */}
        {libraries.map((lib) => (
          <div key={lib.id}
            onClick={() => onSelectLibrary(lib.id)}
            onContextMenu={(e) => handleLibraryContextMenu(e, lib)}
            onDragOver={(e) => handleLibDragOver(e, lib.id)}
            onDragLeave={handleLibDragLeave}
            onDrop={(e) => handleLibDrop(e, lib.id)}
            style={{
              padding: '6px 12px', cursor: 'pointer', fontSize: 13,
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
        ))}

        {/* Create new */}
        {creating && (
          <div style={{ padding: '6px 12px' }}>
            <input autoFocus placeholder="Library name..." value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
              onBlur={() => { if (newName.trim()) handleCreate(); else { setCreating(false); setNewName(''); } }}
              style={{ width: '100%', backgroundColor: '#333', color: '#eee', border: '1px solid #555', borderRadius: 2, padding: '4px 6px', fontSize: 12, outline: 'none' }}
            />
          </div>
        )}
      </div>
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            width: 220, backgroundColor: '#202020', color: '#ddd',
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
                <button
                  type="button"
                  onClick={handleContextRename}
                  disabled={!contextRenameName.trim()}
                  style={{
                    flex: 1, padding: '5px 8px', backgroundColor: contextRenameName.trim() ? '#2563eb' : '#333',
                    color: '#fff', border: 'none', borderRadius: 4,
                    cursor: contextRenameName.trim() ? 'pointer' : 'default', fontSize: 12,
                  }}
                >Save</button>
                <button
                  type="button"
                  onClick={closeContextMenu}
                  style={{
                    flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc',
                    border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  }}
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

function SidebarMenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '6px 8px', textAlign: 'left',
        backgroundColor: 'transparent', color: danger ? '#fca5a5' : '#ddd',
        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = danger ? '#3a2222' : '#303030'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {label}
    </button>
  );
}
