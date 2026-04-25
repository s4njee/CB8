import { buildQuery, deleteJson, getJson, postJson, putJson } from './client';
import type { ApiOk, ComicListResponse, FolderSummary, QueryOptions } from './types';

export function fetchFolders(): Promise<FolderSummary[]> {
  return getJson<FolderSummary[]>('/api/folders');
}

export function createFolder(name: string, comicIds: number[] = []): Promise<{ id: number; name: string }> {
  return postJson<{ id: number; name: string }, { name: string; comicIds: number[] }>('/api/folders', {
    name,
    comicIds,
  });
}

export function renameFolder(id: number, name: string): Promise<ApiOk> {
  return putJson<ApiOk, { name: string }>(`/api/folders/${id}`, { name });
}

export function deleteFolder(id: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/folders/${id}`);
}

export function addComicsToFolder(folderId: number, comicIds: number[]): Promise<ApiOk> {
  return postJson<ApiOk, { comicIds: number[] }>(`/api/folders/${folderId}/comics`, { comicIds });
}

export function removeComicsFromFolder(folderId: number, comicIds: number[]): Promise<ApiOk> {
  return deleteJson<ApiOk, { comicIds: number[] }>(`/api/folders/${folderId}/comics`, { comicIds });
}

export function fetchFolderComics(folderId: number, options: QueryOptions = {}): Promise<ComicListResponse> {
  return getJson<ComicListResponse>(`/api/folders/${folderId}/comics`, buildQuery(options));
}

export function folderThumbnailUrl(id: number): string {
  return `/api/folders/${id}/thumbnail`;
}
