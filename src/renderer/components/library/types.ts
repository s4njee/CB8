import type { LibrarySummary } from '../../../shared/ipcTypes';

export interface ComicEntry {
  id: number;
  title: string;
  pageCount: number;
  fileSize: number;
  filePath: string;
  thumbnailUrl: string | null;
  mediaType: 'comic' | 'book';
}

export interface FolderEntry {
  id: number;
  name: string;
  comicCount: number;
  thumbnailUrl: string | null;
}

export interface ComicContextMenuState {
  x: number;
  y: number;
  comic: ComicEntry;
  comicIds: number[];
  libraries: LibrarySummary[];
  folders: FolderEntry[];
  loading: boolean;
}

export interface FolderContextMenuState {
  x: number;
  y: number;
  folder: FolderEntry;
}

export const CELL_WIDTH = 180;
export const GAP = 12;
export const PAGE_SIZE = 50;
export const CELL_HEIGHT = Math.round(CELL_WIDTH * 1.4) + 30;
export const ROW_HEIGHT = CELL_HEIGHT + GAP;
