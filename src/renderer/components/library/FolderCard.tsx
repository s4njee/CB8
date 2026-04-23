import React, { memo } from 'react';
import { CELL_WIDTH } from './types';
import type { FolderEntry } from './types';

const FOLDER_ICON_URL = new URL('../../../../folder.png', import.meta.url).href;

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

export const FolderCard = memo(function FolderCard({
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
