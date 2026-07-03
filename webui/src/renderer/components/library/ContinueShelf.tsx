import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useUiStore } from '@/store/uiStore';
import { comicCaption, progressPercentFor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

const SHELF_LIMIT = 20;

function thumbnailSrc(record: api.WebComicRecord) {
  return `/api/comics/${record.id}/thumbnail?v=${encodeURIComponent(record.dateAdded)}`;
}

export default function ContinueShelf() {
  const navigate = useNavigate();
  const { mediaType } = useUiStore();

  // Query for continue reading items
  const { data: records = [], isLoading } = useQuery<api.WebComicRecord[]>({
    queryKey: ['continue-reading', mediaType],
    queryFn: () => api.fetchContinueReading(SHELF_LIMIT, mediaType || undefined),
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 h-24 text-muted-foreground text-xs select-none">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading shelf...</span>
      </div>
    );
  }

  if (records.length === 0) return null;

  // Most recent item gets the hero card; the rest queue up beneath it.
  const [hero, ...upNext] = records;

  return (
    <section className="p-4 border-b border-border/80 bg-card/20 select-none">
      {/* Header title */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-bold tracking-wide text-foreground">
          Continue reading
        </h2>
        <Link
          to="/continue"
          className="text-xs font-semibold text-primary hover:underline hover:opacity-90"
        >
          See all
        </Link>
      </div>

      {/* Hero card for the most recent in-progress item */}
      <div
        onClick={() => navigate(`/read/${hero.id}`)}
        onContextMenu={(e) => e.preventDefault()}
        className="flex items-center gap-4 bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-primary/50 transition-colors"
        data-id={hero.id}
      >
        <img
          src={thumbnailSrc(hero)}
          alt={hero.title}
          loading="lazy"
          className="w-20 aspect-[2/3] rounded-md object-cover shrink-0 bg-secondary"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <h3 className="text-sm font-medium line-clamp-2 text-foreground leading-tight">
            {hero.title}
          </h3>
          <span className="text-xs text-muted-foreground">{comicCaption(hero)}</span>
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${progressPercentFor(hero)}%` }}
            />
          </div>
        </div>
        <Button
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/read/${hero.id}`);
          }}
        >
          Resume
        </Button>
      </div>

      {/* Compact "up next" row for the remaining in-progress items */}
      {upNext.length > 0 && (
        <ScrollArea className="w-full whitespace-nowrap mt-3">
          <div className="flex gap-2 pb-3">
            {upNext.map((comic) => (
              <button
                key={comic.id}
                onClick={() => navigate(`/read/${comic.id}`)}
                onContextMenu={(e) => e.preventDefault()}
                className="flex items-center gap-2 w-[180px] shrink-0 text-left bg-card border border-border rounded-lg px-2 py-1.5 hover:border-primary/50 transition-colors"
                data-id={comic.id}
              >
                <img
                  src={thumbnailSrc(comic)}
                  alt={comic.title}
                  loading="lazy"
                  className="w-9 aspect-[2/3] rounded object-cover shrink-0 bg-secondary"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-xs font-medium truncate text-foreground">
                    {comic.title}
                  </span>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${progressPercentFor(comic)}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="bg-border/20" />
        </ScrollArea>
      )}
    </section>
  );
}
