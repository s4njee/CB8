import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useUiStore, TabPanelType } from '@/store/uiStore';
import * as api from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Library, FolderOpen, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TabPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabPanel, setTabPanel } = useUiStore();

  const open = tabPanel !== null;

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

  const getTitle = () => {
    if (tabPanel === 'collections') return 'Collections';
    if (tabPanel === 'folders') return 'Folders';
    if (tabPanel === 'tags') return 'Tags';
    return '';
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-xl p-4 h-[50vh] flex flex-col">
        <SheetHeader className="pb-3 shrink-0">
          <SheetTitle className="text-foreground text-left">{getTitle()}</SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-1 py-1">
            {tabPanel === 'collections' && libraries.map((lib) => (
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

            {tabPanel === 'folders' && folders.map((folder) => (
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

            {tabPanel === 'tags' && tags.map((t) => (
              <Button
                key={t}
                variant="ghost"
                onClick={() => handleItemClick(`/tag/${t}`)}
                className={itemClass(isItemActive(`/tag/${t}`))}
              >
                <div className="flex items-center gap-3 truncate">
                  <Tag className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t}</span>
                </div>
              </Button>
            ))}

            {tabPanel === 'collections' && libraries.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No collections found</p>
            )}
            {tabPanel === 'folders' && folders.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No folders found</p>
            )}
            {tabPanel === 'tags' && tags.length === 0 && (
              <p className="text-sm text-muted-foreground/60 text-center py-8 italic">No tags found</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
