export type SqlParam = string | number | bigint | Buffer | null;

export interface ComicRow {
  id: number;
  file_path: string;
  title: string;
  page_count: number;
  file_size: number;
  cover_thumbnail: Buffer | null;
  date_added: string;
  last_page: number | null;
  last_location: string | null;
  last_read: string | null;
  media_type: string;
  /** v7+ intrinsic chapter/issue number; populated by every comic SELECT. */
  chapter_number?: number | null;
  series_id?: number | null;
  volume_id?: number | null;
}

export interface ComicListRow extends Omit<ComicRow, 'cover_thumbnail'> {
  has_thumbnail: number;
  thumbnail_version: number;
}

export interface CountRow {
  cnt: number;
}

export interface TagIdRow {
  id: number;
}

export interface TagNameRow {
  name: string;
}

export interface LibraryRow {
  id: number;
  name: string;
  comic_count: number;
  media_type: string;
}

export const SORT_COLUMN_MAP: Record<string, string> = {
  title: 'c.title COLLATE NOCASE',
  dateAdded: 'c.date_added',
  fileSize: 'c.file_size',
  pageCount: 'c.page_count',
  lastRead: "COALESCE(c.last_read, '')",
};
