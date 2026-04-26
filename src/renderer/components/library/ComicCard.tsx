import React, { memo } from 'react';
import { CELL_WIDTH } from './types';
import type { ComicEntry } from './types';
import { useThumbnail } from './hooks/useThumbnail';

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

export const ComicCard = memo(function ComicCard({
  comic,
  index,
  isSelected,
  onDragStart,
  onClick,
  onContextMenu,
  onDoubleClick,
  onCheckboxClick,
}: ComicCardProps) {
  const thumbnailUrl = useThumbnail(comic.id, comic.thumbnailVersion, comic.hasThumbnail);

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
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={comic.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
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
