import React from 'react';
import { ContextMenuGroup, ContextMenuItem, ContextCreateForm } from './ContextMenuPrimitives';
import type { ComicContextMenuState } from './types';

type CreateMode = 'library' | 'folder' | null;

export function ComicContextMenu({
  state,
  activeLibraryId,
  createMode,
  createName,
  createError,
  creating,
  onCreateModeChange,
  onCreateNameChange,
  onCreateCancel,
  onAddToLibrary,
  onCreateLibrary,
  onAddToFolder,
  onCreateFolder,
  onViewDetails,
  onDelete,
}: {
  state: ComicContextMenuState;
  activeLibraryId: number | null;
  createMode: CreateMode;
  createName: string;
  createError: string | null;
  creating: boolean;
  onCreateModeChange: (mode: CreateMode) => void;
  onCreateNameChange: (value: string) => void;
  onCreateCancel: () => void;
  onAddToLibrary: (libraryId: number) => void;
  onCreateLibrary: () => void;
  onAddToFolder: (folderId: number) => void;
  onCreateFolder: () => void;
  onViewDetails: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'fixed', left: state.x, top: state.y, zIndex: 1000,
        minWidth: 220, maxWidth: 300, backgroundColor: '#202020', color: '#ddd',
        border: '1px solid #444', borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        padding: 6, fontSize: 13,
      }}
    >
      <div style={{ padding: '6px 8px', color: '#9ca3af', borderBottom: '1px solid #333', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {state.comicIds.length > 1 ? `${state.comicIds.length} comics selected` : state.comic.title}
      </div>

      <ContextMenuGroup title="Add to library">
        {state.loading ? (
          <ContextMenuItem label="Loading..." disabled />
        ) : (
          <>
            {state.libraries.length ? (
              state.libraries.map((library) => (
                <ContextMenuItem key={library.id} label={library.name} onClick={() => onAddToLibrary(library.id)} />
              ))
            ) : (
              <ContextMenuItem label="No libraries" disabled />
            )}
            <ContextMenuItem
              label="Add to new library..."
              onClick={() => {
                onCreateModeChange('library');
                onCreateNameChange('');
              }}
            />
            {createMode === 'library' && (
              <ContextCreateForm
                placeholder="Library name"
                value={createName}
                error={createError}
                creating={creating}
                onChange={onCreateNameChange}
                onSubmit={onCreateLibrary}
                onCancel={onCreateCancel}
              />
            )}
          </>
        )}
      </ContextMenuGroup>

      <ContextMenuGroup title="Add to virtual folder">
        {state.loading ? (
          <ContextMenuItem label="Loading..." disabled />
        ) : (
          <>
            {state.folders.length ? (
              state.folders.map((folder) => (
                <ContextMenuItem key={folder.id} label={folder.name} onClick={() => onAddToFolder(folder.id)} />
              ))
            ) : (
              <ContextMenuItem label="No folders" disabled />
            )}
            <ContextMenuItem
              label="Add to new folder..."
              onClick={() => {
                onCreateModeChange('folder');
                onCreateNameChange('');
              }}
            />
            {createMode === 'folder' && (
              <ContextCreateForm
                placeholder="Folder name"
                value={createName}
                error={createError}
                creating={creating}
                onChange={onCreateNameChange}
                onSubmit={onCreateFolder}
                onCancel={onCreateCancel}
              />
            )}
          </>
        )}
      </ContextMenuGroup>

      <div style={{ height: 1, backgroundColor: '#333', margin: '4px 0' }} />
      <ContextMenuItem label="View details" onClick={onViewDetails} />
      <ContextMenuItem label={activeLibraryId != null ? 'Remove from this library' : 'Delete from database'} danger onClick={onDelete} />
    </div>
  );
}
