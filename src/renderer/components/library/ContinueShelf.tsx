import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useUiStore } from '@/store/uiStore';
import ComicCard from './ComicCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

const SHELF_LIMIT = 20;

export default function ContinueShelf() {
  const { mediaType } = useUiStore();

  // Query for continue reading items
  const { data: records = [], isLoading } = useQuery<api.WebComicRecord[]>({
    queryKey: ['continue-reading', mediaType],
    queryFn: () => api.fetchContinueReading(SHELF_LIMIT, mediaType || undefined),
    staleTime: 30000,
  });

  // Check if admin is logged in (to enable checkbox multi-select)
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 60000,
  });
  const isAdmin = !!session?.authenticated && session?.user?.isAdmin === true;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 h-24 text-muted-foreground text-xs select-none">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading shelf...</span>
      </div>
    );
  }

  if (records.length === 0) return null;

  // Ordered IDs for selection tracking on this shelf
  const orderedIds = records.map((c) => c.id);

  return (
    <section className="p-4 border-b border-border/80 bg-card/20 select-none">
      {/* Header title */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
          Continue Reading
        </h2>
        <Link
          to="/continue"
          className="text-xs font-semibold text-primary hover:underline hover:opacity-90"
        >
          See all
        </Link>
      </div>

      {/* Horizontal Scroll Track */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-3">
          {records.map((comic) => (
            <div key={comic.id} className="w-[140px] shrink-0 inline-block align-top">
              <ComicCard
                record={comic}
                isAdmin={isAdmin}
                orderedIds={orderedIds}
                // No contextual operations supported directly in shelf grid to keep simple, 
                // or we can pass a dummy context handler
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="bg-border/20" />
      </ScrollArea>
    </section>
  );
}
