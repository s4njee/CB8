import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '@/store/uiStore';
import * as api from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Library, FolderOpen, Tag, Clock, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

type BrowsePivot = 'collections' | 'folders' | 'tags';

const PIVOTS: { id: BrowsePivot; label: string }[] = [
  { id: 'collections', label: 'Collections' },
  { id: 'folders', label: 'Folders' },
  { id: 'tags', label: 'Tags' },
];

export default function TabPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabPanel, setTabPanel } = useUiStore();
  const [pivot, setPivot] = useState<BrowsePivot>('collections');

  const open = tabPanel === 'browse';

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setTabPanel(null);
    }
  };

  // Queries (re-uses cached query data from Sidebar query client)
  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
    enabled: open,
  });

  const { data: libraries = [] } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.fetchLibraries(),
    enabled: open,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: api.fetchTags,
    enabled: open,
  });

  const handleItemClick = (path: string) => {
    setTabPanel(null);
    navigate(path);
  };

  const isItemActive = (path: string) => {
    return location.pathname === path;
  };

  const itemClass = (active: boolean) =>
    cn(
      "w-full flex items-center justify-between text-left h-12 px-3 text-sm font-medium rounded-lg transition-colors border border-transparent",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
    );

  const chipClass = (selected: boolean) =>
    cn(
      "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
      selected
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-secondary text-muted-foreground border-border hover:bg-muted hover:text-foreground"
    );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-xl p-4 h-[50vh] flex flex-col">
        <SheetHeader className="pb-3 shrink-0">
          <SheetTitle className="text-foreground text-left">Browse</SheetTitle>
        </SheetHeader>

        {/* Quick links */}
        <div className="flex flex-col gap-1 shrink-0 pb-2">
          <Button
            variant="ghost"
            onClick={() => handleItemClick('/recent')}
            className={itemClass(isItemActive('/recent'))}
          >
            <div className="flex items-center gap-3 truncate">
              <Clock className="h-5 w-5 shrink-0" />
              <span className="truncate">Recently read</span>
            </div>
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleItemClick('/continue')}
            className={itemClass(isItemActive('/continue'))}
          >
            <div className="flex items-center gap-3 truncate">
              <BookOpen className="h-5 w-5 shrink-0" />
              <span className="truncate">Continue reading</span>
            </div>
          </Button>
        </div>

        {/* Pivot chips */}
        <div className="flex items-center gap-1.5 shrink-0 border-t border-border pt-3 pb-2">
          {PIVOTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPivot(p.id)}
              className={chipClass(pivot === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-1 py-1">
            {pivot === 'collections' && libraries.map((lib) => (
              <Button
                key={lib.id}
                variant="ghost"
                onClick={() => handleItemClick(`/library/${lib.id}`)}
                className={itemClass(isItemActive(`/library/${lib.id}`))}
              >
                <div className="flex items-center gap-3 truncate">
                  <Library className="h-5 w-5 shrink-0" />
                  <span className="truncate">{lib.name}</span>
                </div>
                <span className="text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                  {lib.comicCount}
                </span>
              </Button>
            ))}

            {pivot === 'folders' && folders.map((folder) => (
              <Button
                key={folder.id}
                variant="ghost"
                onClick={() => handleItemClick(`/folder/${folder.id}`)}
                className={itemClass(isItemActive(`/folder/${folder.id}`))}
              >
                <div className="flex items-center gap-3 truncate">
                  <FolderOpen className="h-5 w-5 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </div>
                <span className="text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                  {folder.comicCount}
                </span>
              </Button>
            ))}

            {pivot === 'tags' && tags.map((t) => {
              const tagPath = `/tag/${encodeURIComponent(t)}`;
              return (
                <Button
                  key={t}
                  variant="ghost"
                  onClick={() => handleItemClick(tagPath)}
                  className={itemClass(isItemActive(tagPath))}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Tag className="h-5 w-5 shrink-0" />
                    <span className="truncate">{t}</span>
                  </div>
                </Button>
              );
            })}

            {pivot === 'collections' && libraries.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No collections found</p>
            )}
            {pivot === 'folders' && folders.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No folders found</p>
            )}
            {pivot === 'tags' && tags.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No tags found</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
