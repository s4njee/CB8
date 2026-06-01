import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Clock,
  Bookmark,
  FolderOpen,
  Library as LibraryIcon,
  Tag,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  onOpenAdminModal: (panel: string) => void;
}

export default function Sidebar({ onOpenAdminModal }: SidebarProps) {
  const location = useLocation();

  // Queries for sidebar dynamic contents
  const { data: folders = [], isLoading: loadingFolders } = useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
  });

  const { data: libraries = [], isLoading: loadingLibraries } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.fetchLibraries(),
  });

  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['tags'],
    queryFn: api.fetchTags,
  });

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === '';
    }
    return location.pathname === path;
  };

  const navItemClass = (active: boolean) =>
    cn(
      "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card h-[calc(100dvh-3.25rem)] sticky top-13 select-none">
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-6">
          {/* Main Library links */}
          <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Library
            </h3>
            <Link to="/" className={navItemClass(isActive('/'))}>
              <BookOpen className="h-4 w-4" />
              All Books
            </Link>
            <Link to="/recent" className={navItemClass(isActive('/recent'))}>
              <Clock className="h-4 w-4" />
              Recently Read
            </Link>
            <Link to="/continue" className={navItemClass(isActive('/continue'))}>
              <Bookmark className="h-4 w-4" />
              Continue Reading
            </Link>
          </div>

          {/* Collections / Libraries Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Collections
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenAdminModal('create-collection')}
                className="h-4 w-4 p-0 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                aria-label="Create collection"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {loadingLibraries ? (
              <p className="px-3 text-xs text-muted-foreground/60">Loading...</p>
            ) : libraries.length === 0 ? (
              <p className="px-3 text-xs text-muted-foreground/60 italic">No collections</p>
            ) : (
              libraries.map((lib) => (
                <Link
                  key={lib.id}
                  to={`/library/${lib.id}`}
                  className={navItemClass(isActive(`/library/${lib.id}`))}
                >
                  <LibraryIcon className="h-4 w-4" />
                  <span className="truncate flex-1">{lib.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded border border-border group-hover:bg-primary/20">
                    {lib.comicCount}
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Folders Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Folders
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenAdminModal('create-folder')}
                className="h-4 w-4 p-0 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                aria-label="Create folder"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {loadingFolders ? (
              <p className="px-3 text-xs text-muted-foreground/60">Loading...</p>
            ) : folders.length === 0 ? (
              <p className="px-3 text-xs text-muted-foreground/60 italic">No folders</p>
            ) : (
              folders.map((folder) => (
                <Link
                  key={folder.id}
                  to={`/folder/${folder.id}`}
                  className={navItemClass(isActive(`/folder/${folder.id}`))}
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="truncate flex-1">{folder.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded border border-border">
                    {folder.comicCount}
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Tags Section */}
          <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Tags
            </h3>
            {loadingTags ? (
              <p className="px-3 text-xs text-muted-foreground/60">Loading...</p>
            ) : tags.length === 0 ? (
              <p className="px-3 text-xs text-muted-foreground/60 italic">No tags</p>
            ) : (
              <div className="flex flex-wrap gap-1 px-2">
                {tags.map((tagName) => (
                  <Link
                    key={tagName}
                    to={`/tag/${tagName}`}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors",
                      isActive(`/tag/${tagName}`)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-28">{tagName}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
