/**
 * views/series.js — Series detail view (R-18). Reachable via #/series/:id.
 *
 * Fetches detail / volumes / chapters in parallel on mount. Renders:
 *   - header (cover, name, summary, status, age rating, counts)
 *   - per-volume collapsible groups for numbered volumes
 *   - the implicit volume (R-3) renders flat directly under the header,
 *     no "Volume null" group
 *   - chapter rows are clickable; clicking opens the reader
 *   - admin-only "show hidden" toggle reveals soft-deleted chapters
 *     (R-8 / R-18 acceptance)
 *   - empty-series placeholder (all chapters soft-deleted) instead of 404
 */

import * as api from '../api.js';
import { isAdmin, onAdminChange } from '../admin.js';

let unsubscribeAdmin = null;

export async function renderSeries(el, id) {
  el.innerHTML = '';
  const includeDeleted = isAdmin();

  // Subscribe once so toggling admin reveal re-renders chapters in place.
  if (!unsubscribeAdmin) {
    unsubscribeAdmin = onAdminChange(() => {
      // Re-render the current series view if we're still on it.
      const m = (window.location.hash || '').match(/^#\/series\/(\d+)$/);
      if (m) renderSeries(el, parseInt(m[1], 10));
    });
  }

  let series;
  let volumes;
  let chapters;
  try {
    [series, volumes, chapters] = await Promise.all([
      api.fetchSeries(id),
      api.fetchSeriesVolumes(id, { include_implicit: true }),
      api.fetchSeriesChapters(id, includeDeleted ? { include_deleted: 1 } : {}),
    ]);
  } catch (err) {
    console.error('[CB8] failed to load series', id, err);
    el.appendChild(buildError(`Failed to load series ${id}`, err));
    return;
  }

  el.appendChild(buildHeader(series));

  // Bucket chapters by volume so we can render numbered volumes as groups
  // and the implicit volume as a flat list.
  const byVolume = new Map();
  for (const c of chapters) {
    const key = c.volumeId ?? 'implicit-no-volume-id';
    const arr = byVolume.get(key) ?? [];
    arr.push(c);
    byVolume.set(key, arr);
  }

  const numberedVolumes = volumes.filter((v) => v.number !== null)
    .sort((a, b) => a.number - b.number);
  const implicitVolume = volumes.find((v) => v.number === null) ?? null;

  // R-18: implicit volume renders flat under the header, no group header.
  if (implicitVolume) {
    const list = byVolume.get(implicitVolume.id) ?? [];
    if (list.length > 0) {
      el.appendChild(buildChapterList(list));
    }
  }

  for (const v of numberedVolumes) {
    const list = byVolume.get(v.id) ?? [];
    el.appendChild(buildVolumeGroup(v, list));
  }

  if (chapters.length === 0) {
    el.appendChild(buildEmptyPlaceholder(series));
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function buildHeader(series) {
  const wrap = document.createElement('div');
  wrap.className = 'series-header';

  if (series.coverComicId) {
    const img = document.createElement('img');
    img.className = 'series-cover';
    img.alt = '';
    img.src = api.thumbnailUrl(series.coverComicId, 360);
    img.loading = 'eager';
    wrap.appendChild(img);
  }

  const meta = document.createElement('div');
  meta.className = 'series-meta';

  const title = document.createElement('h1');
  title.className = 'series-title';
  title.textContent = series.name;
  meta.appendChild(title);

  const counts = document.createElement('div');
  counts.className = 'series-counts';
  const parts = [];
  parts.push(`${series.chapterCount} chapter${series.chapterCount === 1 ? '' : 's'}`);
  if (series.volumeCount > 0) parts.push(`${series.volumeCount} volume${series.volumeCount === 1 ? '' : 's'}`);
  if (series.status && series.status !== 'unknown') parts.push(series.status);
  if (series.ageRating && series.ageRating !== 'unknown') parts.push(series.ageRating);
  counts.textContent = parts.join(' · ');
  meta.appendChild(counts);

  if (series.summary) {
    const summary = document.createElement('p');
    summary.className = 'series-summary';
    summary.textContent = series.summary;
    meta.appendChild(summary);
  }

  if (series.deletedAt) {
    const flag = document.createElement('div');
    flag.className = 'series-deleted-flag';
    flag.textContent = `Soft-deleted: ${series.deletedAt}`;
    meta.appendChild(flag);
  }

  wrap.appendChild(meta);
  return wrap;
}

// ---------------------------------------------------------------------------
// Volume group (collapsible)
// ---------------------------------------------------------------------------

function buildVolumeGroup(volume, chapters) {
  const details = document.createElement('details');
  details.className = 'volume-group';
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'volume-summary';
  const label = volume.name ?? `Volume ${volume.number}`;
  const count = `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`;
  summary.textContent = `${label} · ${count}`;
  details.appendChild(summary);

  details.appendChild(buildChapterList(chapters));
  return details;
}

// ---------------------------------------------------------------------------
// Chapter list
// ---------------------------------------------------------------------------

function buildChapterList(chapters) {
  const list = document.createElement('ol');
  list.className = 'series-chapter-list';
  for (const c of chapters) {
    list.appendChild(buildChapterRow(c));
  }
  return list;
}

function buildChapterRow(chapter) {
  const row = document.createElement('li');
  row.className = 'series-chapter-row';
  if (chapter.deletedAt) row.classList.add('series-chapter-deleted');

  const link = document.createElement('a');
  link.className = 'series-chapter-link';
  link.href = `#/read/${chapter.id}`;

  if (chapter.thumbnailUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'series-chapter-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.src = chapter.thumbnailUrl;
    link.appendChild(thumb);
  }

  const text = document.createElement('div');
  text.className = 'series-chapter-text';

  const title = document.createElement('div');
  title.className = 'series-chapter-title';
  title.textContent = chapter.title || `Chapter ${chapter.chapterNumber ?? '?'}`;
  text.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'series-chapter-meta';
  const parts = [];
  if (chapter.chapterNumber != null) parts.push(`#${chapter.chapterNumber}`);
  if (chapter.pageCount != null) parts.push(`${chapter.pageCount} pages`);
  if (chapter.deletedAt) parts.push('hidden');
  meta.textContent = parts.join(' · ');
  text.appendChild(meta);

  link.appendChild(text);
  row.appendChild(link);
  return row;
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

function buildEmptyPlaceholder(series) {
  const wrap = document.createElement('div');
  wrap.className = 'series-empty';
  const msg = document.createElement('p');
  msg.textContent = 'No chapters available.';
  wrap.appendChild(msg);
  if (series.deletedAt && !isAdmin()) {
    const hint = document.createElement('p');
    hint.className = 'series-empty-hint';
    hint.textContent = 'Sign in as admin to reveal soft-deleted chapters.';
    wrap.appendChild(hint);
  }
  return wrap;
}

function buildError(message, err) {
  const wrap = document.createElement('div');
  wrap.className = 'series-error empty-state';
  const p = document.createElement('p');
  p.textContent = message;
  wrap.appendChild(p);
  if (err && err.message) {
    const detail = document.createElement('p');
    detail.className = 'series-error-detail';
    detail.textContent = err.message;
    wrap.appendChild(detail);
  }
  return wrap;
}
