import type { ComicEntry } from './types';

function isSerializedBuffer(data: unknown): data is { type: 'Buffer'; data: number[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'data' in data &&
    data.type === 'Buffer' &&
    Array.isArray(data.data)
  );
}

export function parseThumb(data: unknown): string | null {
  if (!data) return null;
  try {
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (isSerializedBuffer(data)) bytes = new Uint8Array(data.data);
    else if (data instanceof Uint8Array) bytes = data;
    else if (typeof data === 'object') bytes = new Uint8Array(Object.values(data) as number[]);
    else return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return URL.createObjectURL(new Blob([copy.buffer]));
  } catch { return null; }
}

export function getFileExtension(filePath: string): string {
  const filename = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

export function formatPageDetails(comic: ComicEntry): string {
  if (comic.pageCount > 0) {
    return `${comic.pageCount} page${comic.pageCount === 1 ? '' : 's'}`;
  }

  const ext = getFileExtension(comic.filePath);
  if (comic.mediaType === 'book' && ext === 'epub') return 'Reflowable EPUB';
  return 'Unknown';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
