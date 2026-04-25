import { deleteJson, getJson, putJson } from './client';
import type { ApiOk } from './types';

export function fetchTags(): Promise<string[]> {
  return getJson<string[]>('/api/tags');
}

export function setComicTags(comicId: number, tags: string[]): Promise<ApiOk & { tags: string[] }> {
  return putJson<ApiOk & { tags: string[] }, { tags: string[] }>(`/api/comics/${comicId}/tags`, { tags });
}

export function renameTag(oldName: string, newName: string): Promise<ApiOk> {
  return putJson<ApiOk, { newName: string }>(`/api/tags/${encodeURIComponent(oldName)}`, { newName });
}

export function deleteTag(name: string): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/tags/${encodeURIComponent(name)}`);
}
