import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebComicRecord } from '@/lib/api';
import { comicCaption, isFinished, progressPercentFor, PLACEHOLDER_BOOK_SVG_DATA_URI } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Heart } from 'lucide-react';
import { useSelectionStore } from '@/store/selectionStore';
import { cn } from '@/lib/utils';

interface ComicCardProps {
  record: WebComicRecord;
  isAdmin: boolean;
  orderedIds: number[];
  onContextMenu: (e: React.MouseEvent, record: WebComicRecord) => void;
}

export default function ComicCard({ record, isAdmin, orderedIds, onContextMenu }: ComicCardProps) {
  const navigate = useNavigate();
  const [imgSrc, setImgSrc] = useState<string>(
    `/api/comics/${record.id}/thumbnail?v=${encodeURIComponent(record.dateAdded)}`
  );
  const [imgLoading, setImgLoading] = useState(true);

  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const toggleSelect = useSelectionStore((state) => state.toggleSelect);
  const selectRange = useSelectionStore((state) => state.selectRange);

  const isSelected = selectedIds.includes(record.id);

  // Gesture handling for mobile long-press context menu
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    pressTimer.current = setTimeout(() => {
      // Synthesize context menu event
      const touch = e.touches[0];
      const mockEvent = {
        preventDefault: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent;
      onContextMenu(mockEvent, record);
    }, 600); // 600ms threshold for long press
  };

  const cancelLongPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleTouchEnd = cancelLongPress;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey) {
      selectRange(record.id, orderedIds);
    } else {
      toggleSelect(record.id);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If in bulk selection mode, clicking the card toggles selection instead of opening
    if (selectedIds.length > 0 && isAdmin) {
      handleCheckboxClick(e);
    } else {
      // Normal navigate
      navigate(`/read/${record.id}`);
    }
  };

  const isCompleted = isFinished(record);
  const progressPercent = progressPercentFor(record);

  return (
    <div
      onClick={handleCardClick}
      onContextMenu={(e) => onContextMenu(e, record)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      className={cn(
        "relative flex flex-col group rounded-lg overflow-hidden bg-card border transition-all duration-200 shadow-md select-none cursor-pointer h-full",
        isSelected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-primary/50"
      )}
      data-id={record.id}
    >
      {/* 1. Thumbnail Area */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary border-b border-border">
        {/* Lazy loaded thumbnail image */}
        <img
          src={imgSrc}
          alt={record.title}
          loading="lazy"
          className={cn(
            "object-cover w-full h-full transition-transform duration-300 group-hover:scale-105",
            imgLoading ? "opacity-30 blur-xs" : isCompleted ? "opacity-55" : "opacity-100"
          )}
          onLoad={() => setImgLoading(false)}
          onError={() => {
            setImgLoading(false);
            setImgSrc(PLACEHOLDER_BOOK_SVG_DATA_URI);
          }}
        />

        {/* Checkbox (Admin bulk select) */}
        {isAdmin && (
          <div
            onClick={handleCheckboxClick}
            className={cn(
              "absolute top-2 left-2 z-10 transition-opacity duration-200",
              isSelected || selectedIds.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <Checkbox
              checked={isSelected}
              className="bg-card border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5 rounded-md"
            />
          </div>
        )}

        {/* Finished check chip */}
        {isCompleted && (
          <div className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border">
            <Check className="h-3 w-3 text-muted-foreground" />
          </div>
        )}

        {/* Favorites Overlay heart icon */}
        {record.favorited && (
          <div className="absolute bottom-2 right-2 z-10 bg-black/60 backdrop-blur-xs p-1 rounded-full border border-white/10">
            <Heart className="h-3 w-3 fill-red-500 text-red-500" />
          </div>
        )}

        {/* Reading progress bar */}
        {progressPercent > 0 && !isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div
              className="h-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* 2. Info Area */}
      <div className="p-2 flex-1 flex flex-col justify-between gap-1">
        <h4 className="text-xs font-semibold line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
          {record.title}
        </h4>
        {/* Reading state caption */}
        <span className="text-[10px] text-muted-foreground mt-auto">
          {comicCaption(record)}
        </span>
      </div>
    </div>
  );
}
