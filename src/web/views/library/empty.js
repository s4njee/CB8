/**
 * views/library/empty.js — empty-state rendering.
 */

import { getState } from '../../app.js';

export function emptyReasonForRoute(currentRoute) {
  const s = getState();
  const hasFilter = Boolean(
    s.search || s.mediaType || s.fileExt ||
    (currentRoute && currentRoute.type === 'tag'),
  );
  if (hasFilter) return 'no-results';
  if (currentRoute && currentRoute.type === 'recent') return 'no-recent';
  if (currentRoute && currentRoute.type === 'continue') return 'no-continue';
  return 'empty';
}

export function renderEmpty(grid, reason) {
  if (!grid) return;
  grid.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = emptyStateMarkup(reason);
  grid.appendChild(empty);
}

function emptyStateMarkup(reason) {
  const svgAttrs = 'width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  switch (reason) {
    case 'offline':
      return `
        <svg ${svgAttrs}>
          <path d="M2 2l20 20"/>
          <path d="M8.5 16.5A5 5 0 0 1 12 15a5 5 0 0 1 3.5 1.5"/>
          <path d="M5 12.5A8 8 0 0 1 10 10"/>
          <path d="M19 12a8 8 0 0 0-5.5-7.6"/>
          <path d="M2 8.8A13 13 0 0 1 7 6"/>
        </svg>
        <p>Cannot reach the server. Check your connection.</p>
      `;
    case 'signed-out':
      return `
        <svg ${svgAttrs}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>No books in the library.</p>
      `;
    case 'no-results':
      return `
        <svg ${svgAttrs}>
          <circle cx="11" cy="11" r="7"/>
          <path d="m20 20-3.5-3.5"/>
        </svg>
        <p>No items match your search or filters.</p>
      `;
    case 'no-recent':
      return `
        <svg ${svgAttrs}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
        <p>Nothing read yet. Open a book or comic to get started.</p>
      `;
    case 'no-continue':
      return `
        <svg ${svgAttrs}>
          <path d="M8 5v14l11-7z"/>
        </svg>
        <p>Nothing in progress. Start a book to see it here.</p>
      `;
    case 'empty':
    default:
      return `
        <svg ${svgAttrs}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>No items found.</p>
      `;
  }
}
