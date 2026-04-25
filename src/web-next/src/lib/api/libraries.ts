import { buildQuery, deleteJson, getJson, postJson, putJson } from './client';
import type { ApiOk, ComicListResponse, LibrarySummary, QueryOptions } from './types';

export function fetchLibraries(mediaType?: 'comic' | 'book'): Promise<LibrarySummary[]> {
  return getJson<LibrarySummary[]>('/api/libraries', mediaType ? { mediaType } : undefined);
}

export function createLibrary(name: string, mediaType: 'comic' | 'book'): Promise<LibrarySummary> {
  return postJson<LibrarySummary, { name: string; mediaType: 'comic' | 'book' }>('/api/libraries', {
    name,
    mediaType,
  });
}

export function renameLibrary(id: number, name: string): Promise<ApiOk> {
  return putJson<ApiOk, { name: string }>(`/api/libraries/${id}`, { name });
}

export function deleteLibrary(id: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/libraries/${id}`);
}

export function addComicsToLibrary(libraryId: number, comicIds: number[]): Promise<ApiOk> {
  return postJson<ApiOk, { comicIds: number[] }>(`/api/libraries/${libraryId}/comics`, { comicIds });
}

export function removeComicsFromLibrary(libraryId: number, comicIds: number[]): Promise<ApiOk> {
  return deleteJson<ApiOk, { comicIds: number[] }>(`/api/libraries/${libraryId}/comics`, { comicIds });
}

export function fetchLibraryComics(libraryId: number, options: QueryOptions = {}): Promise<ComicListResponse> {
  return getJson<ComicListResponse>(`/api/libraries/${libraryId}/comics`, buildQuery(options));
}
