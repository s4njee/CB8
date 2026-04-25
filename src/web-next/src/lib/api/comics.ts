import { buildQuery, deleteJson, getJson, putJson } from './client';
import type { ApiOk, ComicListRecord, ComicListResponse, MetadataSearchResult, QueryOptions } from './types';

export function fetchComics(options: QueryOptions = {}): Promise<ComicListResponse> {
  return getJson<ComicListResponse>('/api/comics', buildQuery(options));
}

export function fetchComic(id: number): Promise<ComicListRecord> {
  return getJson<ComicListRecord>(`/api/comics/${id}`);
}

export function deleteComic(id: number): Promise<ApiOk> {
  return deleteJson<ApiOk>(`/api/comics/${id}`);
}

export function thumbnailUrl(id: number, width?: number): string {
  return width ? `/api/comics/${id}/thumbnail?width=${width | 0}` : `/api/comics/${id}/thumbnail`;
}

export function pageUrl(id: number, page: number, width?: number): string {
  return width ? `/api/comics/${id}/pages/${page}?width=${width | 0}` : `/api/comics/${id}/pages/${page}`;
}

export function fileUrl(id: number): string {
  return `/api/comics/${id}/file`;
}

export function searchMetadata(
  comicId: number,
  query: string,
  sources?: Array<'comicvine' | 'anilist' | 'mangadex'>,
): Promise<MetadataSearchResult> {
  return getJson<MetadataSearchResult>(
    `/api/comics/${comicId}/metadata-search`,
    sources?.length ? { q: query, sources: sources.join(',') } : { q: query },
  );
}

export interface MetadataUpdate {
  title?: string;
  author?: string | null;
  artist?: string | null;
  genre?: string | string[] | null;
  year?: number | null;
  summary?: string | null;
  externalId?: string | null;
  externalSource?: string | null;
  seriesName?: string | null;
  volumeNumber?: number | null;
  chapterNumber?: number | null;
  coverUrl?: string | null;
}

export function applyMetadata(comicId: number, metadata: MetadataUpdate): Promise<ApiOk> {
  return putJson<ApiOk, MetadataUpdate>(`/api/comics/${comicId}/metadata`, metadata);
}
