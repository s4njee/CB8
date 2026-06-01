import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const GROUP_NONE_KEY = '__none__';

export const PLACEHOLDER_BOOK_SVG_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" preserveAspectRatio="xMidYMid slice">
       <rect width="64" height="96" fill="#1c1c1c"/>
       <g fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
         <path d="M18 24h28v48H18z"/>
         <path d="M18 24v48"/><path d="M22 32h20"/><path d="M22 40h20"/><path d="M22 48h14"/>
       </g>
     </svg>`,
  );

export function itemCountLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

export function numberLabel(key: string | null | undefined, fallback: string, noun: string): string {
  if (!key || key === GROUP_NONE_KEY) return fallback;
  const value = Number(key);
  if (!Number.isFinite(value)) return fallback;
  return `${noun} ${Number.isInteger(value) ? value.toFixed(0) : String(value)}`;
}

export function formatBadgeFor(record: { fileExt?: string; mediaType: 'comic' | 'book' }) {
  const ext = (record.fileExt || '').toLowerCase();
  const isBookExt = ext === 'epub' || ext === 'pdf' || ext === 'mobi';
  const isComicExt = ext === 'cbz' || ext === 'cbr';
  const label = ext
    ? ext.toUpperCase()
    : (record.mediaType === 'book' ? 'Book' : 'Comic');
  const bookClass = isBookExt || (!ext && record.mediaType === 'book');
  const comicClass = isComicExt || (!ext && record.mediaType === 'comic');
  return { label, bookClass, comicClass };
}

export function progressLabelFor(record: { pageCount: number; lastPage: number | null; lastLocation?: string | null }) {
  // lastPage is 0-indexed, so pages-read = lastPage + 1.
  if (record.pageCount > 0 && record.lastPage != null && record.lastPage >= 0) {
    const pct = Math.max(1, Math.min(100, Math.round(((record.lastPage + 1) / record.pageCount) * 100)));
    return `${pct}%`;
  }
  if (record.lastLocation) return 'In progress';
  return null;
}
