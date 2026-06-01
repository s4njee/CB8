import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useUiStore, MediaTypeFilter, SortByFilter, ThemeType } from '@/store/uiStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Palette, User, Plus, SlidersHorizontal } from 'lucide-react';

interface NavbarProps {
  onOpenSortSheet: () => void;
  onOpenAdminModal: (panel: string) => void;
}

const THEME_LABELS: Record<ThemeType, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  orange: 'Orange',
  teal: 'Teal',
};

const THEME_DOT_CLASSES: Record<ThemeType, string> = {
  red: 'bg-[#ef4d4d]',
  blue: 'bg-[#4a9eff]',
  green: 'bg-[#34c759]',
  purple: 'bg-[#a374ff]',
  orange: 'bg-[#f59342]',
  teal: 'bg-[#2dd4bf]',
};

export default function Navbar({ onOpenSortSheet, onOpenAdminModal }: NavbarProps) {
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: api.getSession,
    staleTime: 30_000,
  });

  const isAuthenticated = session?.authenticated ?? false;

  const {
    mediaType,
    sortBy,
    search,
    theme,
    setMediaType,
    setSortBy,
    setSearch,
    setTheme,
  } = useUiStore();

  const [localSearch, setLocalSearch] = useState(search);

  // Sync local search input with global search state if it changes externally
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounce local search updates to store
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(localSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, setSearch]);

  return (
    <header className="sticky top-0 z-40 w-full h-13 border-b border-border bg-background/80 backdrop-blur-md px-4 flex items-center justify-between gap-4">
      {/* Brand Logo */}
      <a href="#/" className="text-xl font-bold tracking-wider text-primary hover:opacity-90 shrink-0">
        CB8
      </a>

      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="pl-9 bg-secondary border-border h-9 w-full"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
        />
      </div>

      {/* Desktop Filters / Actions */}
      <div className="flex items-center gap-3">
        {/* Mobile Sort Trigger */}
        <Button
          variant="outline"
          size="icon"
          onClick={onOpenSortSheet}
          className="md:hidden h-9 w-9 bg-secondary border-border"
          aria-label="Sort options"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </Button>

        {/* Desktop Sort Select */}
        <div className="hidden md:block w-40">
          <Select
            value={sortBy}
            onValueChange={(val) => setSortBy(val as SortByFilter)}
          >
            <SelectTrigger className="h-9 bg-secondary border-border">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border-border">
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="dateAdded">Date added</SelectItem>
              <SelectItem value="fileSize">File size</SelectItem>
              <SelectItem value="pageCount">Pages</SelectItem>
              <SelectItem value="lastRead">Recently Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Media Toggle Segmented Control (Desktop only) */}
        <div className="hidden md:flex bg-secondary border border-border rounded-lg p-0.5 h-9 items-center">
          <Button
            variant={mediaType === '' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMediaType('')}
            className="h-8 text-xs px-3"
          >
            All
          </Button>
          <Button
            variant={mediaType === 'comic' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMediaType('comic')}
            className="h-8 text-xs px-3"
          >
            Comics
          </Button>
          <Button
            variant={mediaType === 'book' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMediaType('book')}
            className="h-8 text-xs px-3"
          >
            Books
          </Button>
        </div>

        {/* Admin actions & tools */}
        <div className="flex items-center gap-1.5">
          {/* Add Comic / Upload Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onOpenAdminModal(isAuthenticated ? 'upload' : 'login')}
            className="h-9 w-9 bg-secondary border-border hover:bg-muted"
            aria-label="Add comic or book"
          >
            <Plus className="h-4.5 w-4.5 text-foreground" />
          </Button>

          {/* User / Admin Login Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onOpenAdminModal(isAuthenticated ? 'menu' : 'login')}
            className="h-9 w-9 bg-secondary border-border hover:bg-muted"
            aria-label="Admin settings"
          >
            <User className="h-4.5 w-4.5 text-foreground" />
          </Button>

          {/* Theme Dropdown Picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 bg-secondary border-border hover:bg-muted"
                aria-label="Choose color theme"
              >
                <Palette className="h-4.5 w-4.5 text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-secondary border-border">
              {(Object.keys(THEME_LABELS) as ThemeType[]).map((t) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() => setTheme(t)}
                  className="flex items-center gap-2 cursor-pointer text-foreground focus:bg-muted focus:text-foreground"
                >
                  <span className={`h-3 w-3 rounded-full ${THEME_DOT_CLASSES[t]}`} />
                  <span className={theme === t ? 'font-bold' : ''}>
                    {THEME_LABELS[t]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
