import React from 'react';
import { ContextMenuItem } from './ContextMenuPrimitives';
import type { FolderContextMenuState } from './types';

export function FolderContextMenu({
  state,
  renaming,
  renameName,
  renameError,
  onRenameNameChange,
  onStartRename,
  onSubmitRename,
  onDelete,
  onCancel,
}: {
  state: FolderContextMenuState;
  renaming: boolean;
  renameName: string;
  renameError: string | null;
  onRenameNameChange: (value: string) => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'fixed', left: state.x, top: state.y, zIndex: 1000,
        minWidth: 200, backgroundColor: '#202020', color: '#ddd',
        border: '1px solid #444', borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        padding: 6, fontSize: 13,
      }}
    >
      <div style={{ padding: '6px 8px', color: '#9ca3af', borderBottom: '1px solid #333', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {state.folder.name}
      </div>
      {renaming ? (
        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            autoFocus
            value={renameName}
            onChange={(e) => onRenameNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitRename();
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
              onClick={onSubmitRename}
              disabled={!renameName.trim()}
              style={{
                flex: 1, padding: '5px 8px', backgroundColor: renameName.trim() ? '#2563eb' : '#333',
                color: '#fff', border: 'none', borderRadius: 4,
                cursor: renameName.trim() ? 'pointer' : 'default', fontSize: 12,
              }}
            >Save</button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1, padding: '5px 8px', backgroundColor: '#333', color: '#ccc',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
              }}
            >Cancel</button>
          </div>
          {renameError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{renameError}</div>}
        </div>
      ) : (
        <>
          <ContextMenuItem label="Rename folder" onClick={onStartRename} />
          <ContextMenuItem label="Delete folder" danger onClick={onDelete} />
          {renameError && <div style={{ color: '#fca5a5', fontSize: 12, padding: '4px 8px' }}>{renameError}</div>}
        </>
      )}
    </div>
  );
}
