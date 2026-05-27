/**
 * views/library/cards.js — comic + folder card builders.
 *
 * createCard() / createFolderCard() return DOM nodes for the grid; they
 * delegate selection state to selection.js and routing to window.location.
 */

import * as api from '../../api.js';
import { isAuthenticated } from '../../admin.js';
import {
  ensureCheckbox,
  toggleSelection, selectRangeTo, openContextMenu,
} from './selection.js';

// Inline neutral book placeholder (used when a thumbnail fails to load).
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

export function formatBadgeFor(record) {
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

export function progressLabelFor(record) {
  // lastPage is 0-indexed, so pages-read = lastPage + 1.
  if (record.pageCount > 0 && record.lastPage != null && record.lastPage > 0) {
    const pct = Math.max(1, Math.min(100, Math.round(((record.lastPage + 1) / record.pageCount) * 100)));
    return `${pct}%`;
  }
  if (record.lastLocation) return 'In progress';
  return null;
}

export function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'comic-card folder-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Folder: ${folder.name}`);
  card.dataset.folderId = folder.id;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb-wrap';

  const img = document.createElement('img');
  img.className = 'card-thumb loading';
  img.alt = folder.name;
  img.loading = 'lazy';
  img.decoding = 'async';
  // The folder thumbnail endpoint returns the cover comic's thumb when set,
  // or a generic folder placeholder otherwise.
  img.src = `/api/folders/${folder.id}/thumbnail`;
  img.addEventListener('load', () => img.classList.remove('loading'));
  img.addEventListener('error', () => {
    img.classList.remove('loading');
    img.src = PLACEHOLDER_BOOK_SVG_DATA_URI;
  });

  const badge = document.createElement('div');
  badge.className = 'card-badge folder';
  badge.textContent = 'Folder';

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = folder.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const count = folder.comicCount ?? 0;
  meta.textContent = `${count} item${count === 1 ? '' : 's'}`;

  info.appendChild(title);
  info.appendChild(meta);

  card.appendChild(thumbWrap);
  card.appendChild(info);

  const open = () => { window.location.hash = `#/folder/${folder.id}`; };
  card.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  return card;
}

export function createGroupCard(group) {
  const card = document.createElement('div');
  card.className = 'comic-card folder-card group-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${group.badgeLabel}: ${group.title}`);
  card.dataset.groupKey = group.key;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb-wrap';

  const img = document.createElement('img');
  img.className = 'card-thumb loading';
  img.alt = group.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = group.thumbnailUrl || PLACEHOLDER_BOOK_SVG_DATA_URI;
  img.addEventListener('load', () => img.classList.remove('loading'));
  img.addEventListener('error', () => {
    img.classList.remove('loading');
    img.src = PLACEHOLDER_BOOK_SVG_DATA_URI;
  });

  const badge = document.createElement('div');
  badge.className = 'card-badge folder';
  badge.textContent = group.badgeLabel;

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = group.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = group.meta || '';

  info.appendChild(title);
  info.appendChild(meta);
  card.appendChild(thumbWrap);
  card.appendChild(info);

  const open = () => { window.location.hash = group.href; };
  card.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  return card;
}

export function createCard(record) {
  const card = document.createElement('div');
  card.className = 'comic-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', record.title);
  card.dataset.id = record.id;

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'card-thumb-wrap';

  const img = document.createElement('img');
  img.className = 'card-thumb loading';
  img.alt = record.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = record.thumbnailUrl;
  img.addEventListener('load', () => img.classList.remove('loading'));
  img.addEventListener('error', () => {
    img.classList.remove('loading');
    img.src = PLACEHOLDER_BOOK_SVG_DATA_URI;
  });

  const { label: badgeLabel, bookClass, comicClass } = formatBadgeFor(record);
  const badge = document.createElement('div');
  badge.className = `card-badge${bookClass ? ' book' : comicClass ? ' comic' : ''}`;
  badge.textContent = badgeLabel;

  thumbWrap.appendChild(img);
  thumbWrap.appendChild(badge);

  if (record.favorited) card.classList.add('favorited');
  if (isAuthenticated()) {
    const heart = document.createElement('div');
    heart.className = 'card-fav-heart';
    heart.textContent = record.favorited ? '♥' : '♡';
    heart.title = 'Toggle favorite';
    heart.addEventListener('click', async (e) => {
      e.stopPropagation();
      const on = card.classList.contains('favorited');
      try {
        if (on) await api.removeFavorite(record.id);
        else await api.addFavorite(record.id);
        card.classList.toggle('favorited', !on);
        heart.textContent = !on ? '♥' : '♡';
      } catch (err) {
        console.error('[CB8] favorite toggle failed:', err);
      }
    });
    thumbWrap.appendChild(heart);
  }

  ensureCheckbox(card);

  // Progress badge
  const progressLabel = progressLabelFor(record);
  if (progressLabel) {
    const pb = document.createElement('div');
    pb.className = 'progress-badge';
    pb.textContent = progressLabel;
    thumbWrap.appendChild(pb);
  }

  // Progress bar
  if (record.lastPage && record.pageCount > 0) {
    const pct = Math.min(100, Math.round(((record.lastPage + 1) / record.pageCount) * 100));
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${pct}%`;
    bar.setAttribute('title', `${pct}% read`);
    thumbWrap.appendChild(bar);
  }

  const info = document.createElement('div');
  info.className = 'card-info';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = record.title;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = record.pageCount > 0 ? `${record.pageCount} pages` : '';

  info.appendChild(title);
  info.appendChild(meta);

  card.appendChild(thumbWrap);
  card.appendChild(info);

  // Navigation / selection
  const open = () => { window.location.hash = `#/read/${record.id}`; };
  card.addEventListener('click', (e) => {
    if (!isAuthenticated()) { open(); return; }
    e.preventDefault();
    if (e.shiftKey) selectRangeTo(record.id);
    else toggleSelection(record.id);
  });
  card.addEventListener('dblclick', (e) => {
    e.preventDefault();
    open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  card.addEventListener('contextmenu', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, record.id);
  });

  return card;
}
