import {
  fetchContinueReading,
  fetchFolders,
  fetchLibraries,
  fetchTags,
  type ComicListRecord,
  type FolderSummary,
  type LibrarySummary,
  type Session,
} from '../lib/api';
import {
  fetchBatch,
  type Mode,
  type QueryState,
  type ReadStatus,
  type SortBy,
  type SortOrder,
} from '../lib/libraryQuery';

export type { QueryState, Mode, SortBy, SortOrder, ReadStatus };

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMode(value: string | null): Mode {
  return value === 'continue' || value === 'recent' ? value : 'all';
}

function parseMediaType(value: string | null): '' | 'comic' | 'book' {
  return value === 'comic' || value === 'book' ? value : '';
}

function parseSortBy(value: string | null): SortBy {
  const valid: SortBy[] = ['title', 'dateAdded', 'fileSize', 'pageCount', 'lastRead'];
  return valid.includes(value as SortBy) ? (value as SortBy) : 'title';
}

function parseSortOrder(value: string | null): SortOrder {
  return value === 'desc' ? 'desc' : 'asc';
}

function parseReadStatus(value: string | null): ReadStatus {
  const valid: ReadStatus[] = ['unread', 'in-progress', 'completed'];
  return valid.includes(value as ReadStatus) ? (value as ReadStatus) : '';
}

export async function load({
  url,
  parent,
}: {
  url: URL;
  parent: () => Promise<{ session: Session | null; sessionError: string | null }>;
}) {
  const parentData = await parent();
  const selection: QueryState = {
    fileExt: url.searchParams.get('fileExt')?.trim().toLowerCase() ?? '',
    folderId: parsePositiveInt(url.searchParams.get('folder')),
    libraryId: parsePositiveInt(url.searchParams.get('library')),
    mediaType: parseMediaType(url.searchParams.get('mediaType')),
    mode: parseMode(url.searchParams.get('mode')),
    search: url.searchParams.get('search')?.trim() ?? '',
    tag: url.searchParams.get('tag')?.trim() ?? '',
    sortBy: parseSortBy(url.searchParams.get('sortBy')),
    sortOrder: parseSortOrder(url.searchParams.get('sortOrder')),
    readStatus: parseReadStatus(url.searchParams.get('readStatus')),
    favorites: url.searchParams.get('favorites') === '1',
  };

  const [libraries, folders, tags, batchResult, continueReading] = await Promise.all([
    fetchLibraries().catch(() => [] as LibrarySummary[]),
    fetchFolders().catch(() => [] as FolderSummary[]),
    fetchTags().catch(() => [] as string[]),
    fetchBatch(selection, 0).catch(() => ({ records: [] as ComicListRecord[], totalCount: 0 })),
    selection.mode === 'all' && !selection.libraryId && !selection.folderId && !selection.tag
      ? fetchContinueReading(10, selection.mediaType || undefined).catch(() => [] as ComicListRecord[])
      : Promise.resolve([] as ComicListRecord[]),
  ]);

  return {
    ...parentData,
    folders,
    libraries,
    records: batchResult.records,
    totalCount: batchResult.totalCount,
    continueReading,
    selection,
    tags,
  };
}
