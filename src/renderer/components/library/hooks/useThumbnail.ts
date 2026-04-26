import { useEffect, useState } from 'react';
import { getThumbnail } from '../../../ipcClient';
import { parseThumb } from '../utils';

const MAX_CACHED_THUMBNAILS = 300;

const thumbnailUrls = new Map<string, string>();
const pendingThumbnails = new Map<string, Promise<string | null>>();

function thumbnailKey(comicId: number, version: number): string {
  return `${comicId}:${version}`;
}

function getCachedThumbnail(key: string): string | null {
  const url = thumbnailUrls.get(key);
  if (!url) return null;
  thumbnailUrls.delete(key);
  thumbnailUrls.set(key, url);
  return url;
}

function rememberThumbnail(key: string, url: string): void {
  thumbnailUrls.set(key, url);

  while (thumbnailUrls.size > MAX_CACHED_THUMBNAILS) {
    const oldest = thumbnailUrls.entries().next().value as [string, string] | undefined;
    if (!oldest) return;
    thumbnailUrls.delete(oldest[0]);
    URL.revokeObjectURL(oldest[1]);
  }
}

function loadThumbnail(comicId: number, version: number): Promise<string | null> {
  const key = thumbnailKey(comicId, version);
  const cached = getCachedThumbnail(key);
  if (cached) return Promise.resolve(cached);

  const pending = pendingThumbnails.get(key);
  if (pending) return pending;

  const request = getThumbnail(comicId)
    .then((data) => {
      const url = parseThumb(data);
      if (url) rememberThumbnail(key, url);
      return url;
    })
    .catch((err) => {
      console.error('Failed to load thumbnail:', err);
      return null;
    })
    .finally(() => {
      pendingThumbnails.delete(key);
    });

  pendingThumbnails.set(key, request);
  return request;
}

export function useThumbnail(comicId: number, version: number, enabled: boolean): string | null {
  const [url, setUrl] = useState(() => (enabled ? getCachedThumbnail(thumbnailKey(comicId, version)) : null));

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setUrl(null);
      return undefined;
    }

    const cached = getCachedThumbnail(thumbnailKey(comicId, version));
    if (cached) {
      setUrl(cached);
      return undefined;
    }

    setUrl(null);
    loadThumbnail(comicId, version).then((loadedUrl) => {
      if (!cancelled) setUrl(loadedUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [comicId, version, enabled]);

  return url;
}
