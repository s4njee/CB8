import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { showToast } from '@/hooks/useToast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BookOpen,
  Clock,
  Bookmark,
  FolderOpen,
  Library as LibraryIcon,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarEmptyState,
  SidebarLoadingState,
  SidebarNavLink,
  SidebarSection,
} from './SidebarNav';
import { formatFolderRescanMessage, isSidebarPathActive } from './sidebarHelpers';

interface SidebarProps {
  onOpenAdminModal: (panel: string) => void;
}

export default function Sidebar({ onOpenAdminModal }: SidebarProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [folderMenu, setFolderMenu] = useState<{ id: number; name: string; x: number; y: number } | null>(null);
  const [rescanningId, setRescanningId] = useState<number | null>(null);

  const handleFolderContextMenu = (e: React.MouseEvent, folder: api.Folder) => {
    e.preventDefault();
    setFolderMenu({ id: folder.id, name: folder.name, x: e.clientX, y: e.clientY });
  };

  const handleRescan = async (folderId: number, folderName: string) => {
    setFolderMenu(null);
    setRescanningId(folderId);
    try {
      const result = await api.rescanFolder(folderId);
      queryClient.invalidateQueries();
      showToast(formatFolderRescanMessage(result.added, folderName));
    } catch (err) {
      showToast(`Rescan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRescanningId(null);
    }
  };

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

  // Creating collections/folders hits requireAdmin routes, and the admin modal
  // renders nothing for non-admin sessions. Only show the add buttons to admins
  // (matches the Navbar upload-button gating).
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
  });
  const isAdmin = session?.user?.isAdmin === true;

  const isActive = (path: string) => isSidebarPathActive(location.pathname, path);

  return (
    <aside className="hidden md:flex self-stretch min-h-0 flex-col w-56 shrink-0 border-r border-border bg-card select-none">
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-6">
          {/* Main Library links */}
          <SidebarSection title="Library">
            <SidebarNavLink
              to="/"
              active={isActive('/')}
              icon={<BookOpen className="h-4 w-4" />}
              label="All Books"
            />
            <SidebarNavLink
              to="/recent"
              active={isActive('/recent')}
              icon={<Clock className="h-4 w-4" />}
              label="Recently Read"
            />
            <SidebarNavLink
              to="/continue"
              active={isActive('/continue')}
              icon={<Bookmark className="h-4 w-4" />}
              label="Continue Reading"
            />
          </SidebarSection>

          {/* Collections / Libraries Section */}
          <SidebarSection
            title="Collections"
            addLabel="Create collection"
            onAdd={isAdmin ? () => onOpenAdminModal('create-collection') : undefined}
          >
            {loadingLibraries ? (
              <SidebarLoadingState />
            ) : libraries.length === 0 ? (
              <SidebarEmptyState>No collections</SidebarEmptyState>
            ) : (
              libraries.map((lib) => (
                <SidebarNavLink
                  key={lib.id}
                  to={`/library/${lib.id}`}
                  active={isActive(`/library/${lib.id}`)}
                  icon={<LibraryIcon className="h-4 w-4" />}
                  label={lib.name}
                  count={lib.comicCount}
                />
              ))
            )}
          </SidebarSection>

          {/* Folders Section */}
          <SidebarSection
            title="Folders"
            addLabel="Create folder"
            onAdd={isAdmin ? () => onOpenAdminModal('create-folder') : undefined}
          >
            {loadingFolders ? (
              <SidebarLoadingState />
            ) : folders.length === 0 ? (
              <SidebarEmptyState>No folders</SidebarEmptyState>
            ) : (
              folders.map((folder) => (
                <SidebarNavLink
                  key={folder.id}
                  to={`/folder/${folder.id}`}
                  active={isActive(`/folder/${folder.id}`)}
                  icon={<FolderOpen className={cn('h-4 w-4', rescanningId === folder.id && 'animate-spin')} />}
                  label={folder.name}
                  count={folder.comicCount}
                  onContextMenu={(event) => handleFolderContextMenu(event, folder)}
                />
              ))
            )}
          </SidebarSection>

          {/* Tags Section */}
          <SidebarSection title="Tags">
            {loadingTags ? (
              <SidebarLoadingState />
            ) : tags.length === 0 ? (
              <SidebarEmptyState>No tags</SidebarEmptyState>
            ) : (
              <div className="flex flex-wrap gap-1 px-2">
                {tags.map((tagName) => {
                  const tagPath = `/tag/${encodeURIComponent(tagName)}`;
                  return (
                    <Link
                      key={tagName}
                      to={tagPath}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors",
                        isActive(tagPath)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Tag className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-28">{tagName}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </SidebarSection>
        </div>
      </ScrollArea>

      <DropdownMenu open={!!folderMenu} onOpenChange={(open) => { if (!open) setFolderMenu(null); }}>
        <DropdownMenuTrigger
          style={{
            position: 'fixed',
            left: `${folderMenu?.x ?? 0}px`,
            top: `${folderMenu?.y ?? 0}px`,
            width: '1px',
            height: '1px',
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        />
        <DropdownMenuContent align="start" className="bg-card border-border w-44">
          <DropdownMenuItem
            onClick={() => folderMenu && handleRescan(folderMenu.id, folderMenu.name)}
            className="gap-2 cursor-pointer focus:bg-muted"
            disabled={rescanningId === folderMenu?.id}
          >
            <RefreshCw className="h-4 w-4" />
            <span>Rescan Folder</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
