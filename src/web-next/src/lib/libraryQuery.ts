import {
  fetchComics,
  fetchContinueReading,
  fetchFolderComics,
  fetchLibraryComics,
  fetchRecentlyRead,
  type ComicListRecord,
  type QueryOptions,
} from './api';

export type SortBy = 'title' | 'dateAdded' | 'fileSize' | 'pageCount' | 'lastRead';
export type SortOrder = 'asc' | 'desc';
export type ReadStatus = '' | 'unread' | 'in-progress' | 'completed';
export type Mode = 'all' | 'continue' | 'recent';

export interface QueryState {
  fileExt: string;
  folderId: number | null;
  libraryId: number | null;
  mediaType: '' | 'comic' | 'book';
  mode: Mode;
  search: string;
  tag: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  readStatus: ReadStatus;
  favorites: boolean;
}

export function buildQueryOptions(selection: QueryState, offset = 0, limit = 48): QueryOptions {
  return {
    fileExt: selection.fileExt || undefined,
    mediaType: selection.mediaType || undefined,
    search: selection.search || undefined,
    sortBy: selection.sortBy,
    sortOrder: selection.sortOrder,
    readStatus: selection.readStatus || undefined,
    favorites: selection.favorites || undefined,
    tag: selection.tag || undefined,
    offset,
    limit,
  };
}

export async function fetchBatch(
  selection: QueryState,
  offset: number,
  limit = 48,
): Promise<{ records: ComicListRecord[]; totalCount: number }> {
  const options = buildQueryOptions(selection, offset, limit);

  if (selection.libraryId) {
    return fetchLibraryComics(selection.libraryId, options);
  }
  if (selection.folderId) {
    return fetchFolderComics(selection.folderId, options);
  }
  if (selection.mode === 'continue') {
    const records = await fetchContinueReading(limit, selection.mediaType || undefined);
    return { records, totalCount: records.length };
  }
  if (selection.mode === 'recent') {
    const records = await fetchRecentlyRead(limit, selection.mediaType || undefined);
    return { records, totalCount: records.length };
  }
  return fetchComics({ ...options, excludeFoldered: selection.tag ? undefined : true });
}
