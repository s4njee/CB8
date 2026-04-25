import { deleteJson, getJson, postJson, putJson } from './client';
import type {
  ApiOk,
  Bookmark,
  ComicListRecord,
  HistoryResponse,
  SeriesSummary,
} from './types';

export function updateProgress(comicId: number, page: number): Promise<ApiOk> {
  return putJson<ApiOk, { page: number }>(`/api/comics/${comicId}/progress`, { page });
}

export function updateLocation(comicId: number, location: string): Promise<ApiOk> {
  return putJson<ApiOk, { location: string }>(`/api/comics/${comicId}/progress`, { location });
}

export function setCompleted(comicId: number, completed: boolean): Promise<ApiOk> {
  return putJson<ApiOk, { completed: boolean }>(`/api/comics/${comicId}/progress`, { completed });
}

export function clearProgress(comicId: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/comics/${comicId}/progress`);
}

export function addFavorite(comicId: number): Promise<ApiOk> {
  return postJson<ApiOk>(`/api/comics/${comicId}/favorite`);
}

export function removeFavorite(comicId: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/comics/${comicId}/favorite`);
}

export function getBookmarks(comicId: number): Promise<Bookmark[]> {
  return getJson<Bookmark[]>(`/api/comics/${comicId}/bookmarks`);
}

export function createBookmark(comicId: number, page: number, note: string | null = null): Promise<Bookmark> {
  return postJson<Bookmark, { page: number; note: string | null }>(`/api/comics/${comicId}/bookmarks`, {
    page,
    note,
  });
}

export function updateBookmark(comicId: number, bookmarkId: number, note: string | null): Promise<ApiOk> {
  return putJson<ApiOk, { note: string | null }>(`/api/comics/${comicId}/bookmarks/${bookmarkId}`, { note });
}

export function deleteBookmark(comicId: number, bookmarkId: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/comics/${comicId}/bookmarks/${bookmarkId}`);
}

export function logHistory(comicId: number, action: string, page: number | null = null): Promise<ApiOk> {
  return postJson<ApiOk, { comicId: number; action: string; page: number | null }>('/api/history', {
    comicId,
    action,
    page,
  });
}

export function getHistory(offset = 0, limit = 50): Promise<HistoryResponse> {
  return getJson<HistoryResponse>('/api/history', { offset, limit });
}

export function getSeries(): Promise<SeriesSummary[]> {
  return getJson<SeriesSummary[]>('/api/series');
}

export function getSeriesComics(name: string): Promise<ComicListRecord[]> {
  return getJson<ComicListRecord[]>(`/api/series/${encodeURIComponent(name)}/comics`);
}

export function fetchRecentlyRead(limit = 20, mediaType?: 'comic' | 'book'): Promise<ComicListRecord[]> {
  return getJson<ComicListRecord[]>('/api/recently-read', mediaType ? { limit, mediaType } : { limit });
}

export function fetchContinueReading(limit = 20, mediaType?: 'comic' | 'book'): Promise<ComicListRecord[]> {
  return getJson<ComicListRecord[]>('/api/continue-reading', mediaType ? { limit, mediaType } : { limit });
}
