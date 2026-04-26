import { useState, useCallback, useRef } from 'react';
import type { QueryOptions } from '../../../../shared/types';
import { PAGE_SIZE, type ComicEntry, type FolderEntry } from '../types';
import { parseThumb } from '../utils';
import {
  queryComics,
  queryFolderComics,
  queryLibraryComics,
  getFolders,
} from '../../../ipcClient';

interface UseLibraryQueryParams {
  activeFolder: { id: number; name: string } | null;
  activeLibraryId: number | null;
  activeView: 'all' | 'comics' | 'books';
  sortBy: QueryOptions['sortBy'];
  sortOrder: 'asc' | 'desc';
  readStatus: QueryOptions['readStatus'] | undefined;
  fileExt: string | undefined;
  filterTag: string | undefined;
}

interface UseLibraryQueryResult {
  comics: ComicEntry[];
  folders: FolderEntry[];
  totalCount: number;
  loadingMore: boolean;
  hasMore: boolean;
  loadInitial: (search?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  setComics: React.Dispatch<React.SetStateAction<ComicEntry[]>>;
  setTotalCount: React.Dispatch<React.SetStateAction<number>>;
}

export function useLibraryQuery(params: UseLibraryQueryParams): UseLibraryQueryResult {
  const { activeFolder, activeLibraryId, activeView, sortBy, sortOrder, readStatus, fileExt, filterTag } = params;

  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentSearch = useRef('');

  const hasMore = comics.length < totalCount;

  const fetchPage = useCallback(async (search: string, offset: number): Promise<{ entries: ComicEntry[]; total: number }> => {
    const trimmedSearch = search.trim();
    const opts: QueryOptions = {
      search: trimmedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
      sortBy,
      sortOrder,
      readStatus,
      fileExt,
      tag: filterTag,
      excludeFoldered: activeFolder == null && activeLibraryId == null && !trimmedSearch,
      mediaType: activeView === 'all' ? undefined : (activeView === 'books' ? 'book' : 'comic'),
    };
    const result = activeFolder != null
      ? await queryFolderComics(activeFolder.id, opts)
      : activeLibraryId != null
      ? await queryLibraryComics(activeLibraryId, opts)
      : await queryComics(opts);
    if (!result?.records) return { entries: [], total: 0 };
    const entries: ComicEntry[] = result.records.map((rec) => ({
      id: rec.id, title: rec.title, pageCount: rec.pageCount,
      fileSize: rec.fileSize, filePath: rec.filePath,
      hasThumbnail: rec.hasThumbnail ?? rec.coverThumbnail != null,
      thumbnailVersion: rec.thumbnailVersion ?? (rec.coverThumbnail?.byteLength ?? 0),
      mediaType: rec.mediaType,
    }));
    return { entries, total: result.totalCount };
  }, [activeFolder, activeLibraryId, activeView, sortBy, sortOrder, readStatus, fileExt, filterTag]);

  const loadFolders = useCallback(async (search?: string) => {
    if (activeFolder || activeLibraryId != null) {
      setFolders([]);
      return;
    }

    const query = (search ?? '').trim().toLowerCase();
    try {
      const result = await getFolders();
      setFolders(result
        .filter((folder) => !query || folder.name.toLowerCase().includes(query))
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          comicCount: folder.comicCount,
          thumbnailUrl: parseThumb(folder.coverThumbnail),
        })));
    } catch (err) {
      console.error('Failed to load folders:', err);
      setFolders([]);
    }
  }, [activeFolder, activeLibraryId]);

  const loadInitial = useCallback(async (search?: string) => {
    const s = search ?? '';
    currentSearch.current = s;
    const [{ entries, total }] = await Promise.all([
      fetchPage(s, 0),
      loadFolders(s),
    ]);
    setComics(entries);
    setTotalCount(total);
  }, [fetchPage, loadFolders]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { entries, total } = await fetchPage(currentSearch.current, comics.length);
      setComics((prev) => [...prev, ...entries]);
      setTotalCount(total);
    } catch (err) { console.error('Failed to load more:', err); }
    finally { setLoadingMore(false); }
  }, [fetchPage, comics.length, hasMore, loadingMore]);

  return {
    comics,
    folders,
    totalCount,
    loadingMore,
    hasMore,
    loadInitial,
    loadMore,
    setComics,
    setTotalCount,
  };
}
