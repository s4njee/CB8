import React from 'react';
import { useUiStore, MediaTypeFilter, ReadStatusFilter } from '@/store/uiStore';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

const MEDIA_PILLS = [
  { type: '', label: 'All Types' },
  { type: 'comic', label: 'Comics' },
  { type: 'book', label: 'Books' },
];

const READ_STATUS_PILLS = [
  { status: '', label: 'All Status' },
  { status: 'unread', label: 'Unread' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
];

export default function FilterStrips() {
  const {
    mediaType,
    readStatus,
    favoritesOnly,
    setMediaType,
    setReadStatus,
    setFavoritesOnly,
  } = useUiStore();

  const filterButtonClass = (active: boolean) =>
    cn(
      "h-8 shrink-0 px-3 text-xs",
      active
        ? "font-semibold shadow-xs"
        : "border-border bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  return (
    <div className="bg-card/45 border-b border-border/80 p-3 select-none">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {MEDIA_PILLS.map((pill) => {
          const active = mediaType === pill.type;
          return (
            <Button
              key={pill.type}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMediaType(pill.type as MediaTypeFilter)}
              aria-pressed={active}
              className={filterButtonClass(active)}
            >
              {pill.label}
            </Button>
          );
        })}

        <div className="mx-1 h-6 w-px shrink-0 bg-border/80" />

        {READ_STATUS_PILLS.map((pill) => {
          const active = readStatus === pill.status;
          return (
            <Button
              key={pill.status}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReadStatus(pill.status as ReadStatusFilter)}
              aria-pressed={active}
              className={filterButtonClass(active)}
            >
              {pill.label}
            </Button>
          );
        })}

        <div className="mx-1 h-6 w-px shrink-0 bg-border/80" />

        <Button
          type="button"
          variant={favoritesOnly ? 'outline' : 'outline'}
          size="sm"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          aria-pressed={favoritesOnly}
          className={cn(
            "h-8 shrink-0 px-3 text-xs",
            favoritesOnly
              ? "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/15 hover:text-red-500"
              : "border-border bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", favoritesOnly ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
          <span>Favorites</span>
        </Button>
      </div>
    </div>
  );
}
