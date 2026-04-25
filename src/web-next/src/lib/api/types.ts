export interface SessionUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface Session {
  authenticated: boolean;
  user: SessionUser | null;
  host: boolean;
  guestAccess: boolean;
}

export interface ComicListRecord {
  id: number;
  title: string;
  filePath?: string;
  fileExt?: string;
  mediaType: 'comic' | 'book';
  pageCount: number;
  fileSize: number;
  dateAdded: string;
  lastPage: number | null;
  lastLocation: string | null;
  lastRead: string | null;
  completed?: boolean;
  tags: string[];
  favorited?: boolean;
  thumbnailUrl?: string | null;
}

export interface ComicListResponse {
  records: ComicListRecord[];
  totalCount: number;
}

export interface LibrarySummary {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book';
}

export interface FolderSummary {
  id: number;
  name: string;
  comicCount: number;
  mediaType: 'comic' | 'book' | 'mixed' | 'empty';
  thumbnailUrl: string | null;
}

export interface Bookmark {
  id: number;
  page: number;
  note: string | null;
  createdAt: string;
}

export interface HistoryEntry {
  id: number;
  comicId: number;
  comicTitle: string;
  action: string;
  page: number | null;
  timestamp: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
  totalCount: number;
}

export interface SeriesSummary {
  name: string;
  count: number;
  thumbnailUrl: string | null;
}

export interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface ApiOk {
  ok: true;
}

export interface QueryOptions {
  search?: string;
  tag?: string;
  sortBy?: 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead';
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  mediaType?: 'comic' | 'book';
  excludeFoldered?: boolean;
  fileExt?: string;
  readStatus?: 'unread' | 'in-progress' | 'completed';
  favorites?: boolean;
}

export interface HostInfo {
  homePath: string;
  lanIp: string;
  lanPort: number | null;
  lanUrl: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ListDirResponse {
  dir: string;
  entries: DirEntry[];
}

export interface IngestProgressEvent {
  type: 'progress';
  phase: 'comics' | 'books' | 'file';
  discovered: number;
  processed: number;
  currentFile: string;
}

export interface IngestErrorEvent {
  type: 'error';
  message: string;
}

export interface IngestDoneEvent {
  type: 'done';
  added: number;
}

export type IngestEvent = IngestProgressEvent | IngestErrorEvent | IngestDoneEvent;

export interface IngestResult {
  added: number;
  errors: string[];
}

export interface UploadResult {
  added: boolean;
  skipped?: boolean;
  reason?: string;
  filePath: string;
}

export interface MetadataSearchResult {
  [key: string]: unknown;
}
