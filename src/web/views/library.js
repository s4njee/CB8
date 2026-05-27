/**
 * views/library.js — Library grid view (entry point).
 *
 * Renders the header, filter strips, optional Continue-Reading shelf, and
 * the infinitely-scrolling grid of comic/book cards. Card builders live in
 * library/cards.js, selection state in library/selection.js, the empty
 * state in library/empty.js, and the chrome (strips, header actions) in
 * library/strips.js.
 */

import * as api from '../api.js';
import { isAuthenticated, onAdminChange } from '../admin.js';

import {
  resetSelection, setGrid, trackId, clearSelection,
  ensureCheckbox, syncCardSelection,
} from './library/selection.js';
import {
  createCard, createFolderCard, createGroupCard,
} from './library/cards.js';
import {
  buildMediaStrip, buildFileTypeStrip, buildReadStatusStrip,
  routeTitle, buildCollectionActions,
} from './library/strips.js';
import {
  renderEmpty, emptyReasonForRoute,
} from './library/empty.js';

const PAGE_SIZE = 48;
const SHELF_LIMIT = 20;
const GROUP_NONE_KEY = '__none__';

let offset = 0;
let totalCount = 0;
let loading = false;
let sentinel = null;
let observer = null;
let currentRoute = null;
let currentOptions = null;
let grid = null;
let renderEpoch = 0;

let adminUnsubscribe = null;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function renderLibrary(el, route, options) {
  const epoch = ++renderEpoch;
  currentRoute = route;
  currentOptions = { ...options };
  offset = 0;
  totalCount = 0;
  loading = false;

  resetSelection();

  // Subscribe once to admin auth changes so entering/leaving admin mode
  // re-renders the selection affordances on the grid.
  if (!adminUnsubscribe) {
    adminUnsubscribe = onAdminChange(() => {
      clearSelection();
      if (grid) {
        grid.querySelectorAll('.comic-card').forEach((card) => {
          syncCardSelection(card);
          ensureCheckbox(card);
        });
      }
    });
  }

  // Disconnect any previous observer
  if (observer) { observer.disconnect(); observer = null; }

  el.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'library-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'library-title';
  titleEl.textContent = routeTitle(route);

  const countEl = document.createElement('div');
  countEl.className = 'library-count';
  countEl.id = 'grid-count';
  countEl.textContent = '';

  header.appendChild(titleEl);
  header.appendChild(countEl);

  // Admin affordance: a visible Delete button when viewing a specific
  // collection or folder. Same confirm + navigation flow as the sidebar
  // context menu; added here because the context menu isn't discoverable.
  if (isAuthenticated() && (route.type === 'library' || route.type === 'folder')) {
    header.appendChild(buildCollectionActions(route));
  }

  el.appendChild(header);

  el.appendChild(buildMediaStrip());
  el.appendChild(buildFileTypeStrip());
  if (isAuthenticated()) {
    el.appendChild(buildReadStatusStrip());
  }

  // Continue-reading shelf — only on the main "all" view, only when signed in.
  // Separate element so we can update/remove it without re-rendering the header.
  if (route.type === 'all' && isAuthenticated()) {
    const shelfHost = document.createElement('div');
    shelfHost.id = 'continue-shelf-host';
    el.appendChild(shelfHost);
    // Fire-and-forget: don't block grid render on shelf fetch.
    renderContinueShelf(shelfHost, options, epoch).catch((err) => {
      console.error('[CB8] continue shelf load failed:', err);
      shelfHost.remove();
    });
  }

  grid = document.createElement('div');
  grid.className = 'comics-grid';
  grid.id = 'comics-grid';
  el.appendChild(grid);
  setGrid(grid, route);

  // Infinite scroll sentinel
  sentinel = document.createElement('div');
  sentinel.id = 'load-sentinel';
  el.appendChild(sentinel);

  const spinnerEl = document.createElement('div');
  spinnerEl.className = 'spinner';
  spinnerEl.id = 'grid-spinner';
  spinnerEl.hidden = true;
  el.appendChild(spinnerEl);

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !loading && offset < totalCount) {
        loadNextPage(epoch);
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinel);

  installPullToRefresh();

  await loadNextPage(epoch);
}

// ---------------------------------------------------------------------------
// Pull-to-refresh (mobile)
// ---------------------------------------------------------------------------

function installPullToRefresh() {
  const scrollEl = document.getElementById('main-content');
  if (!scrollEl || scrollEl._ptrInstalled) return;
  scrollEl._ptrInstalled = true;

  const PULL_THRESHOLD = 70;
  const MAX_PULL = 120;
  let ptrStartY = 0;
  let ptrDelta = 0;
  let pulling = false;

  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<div class="ptr-spinner"></div>';
  indicator.style.transform = 'translateY(-60px)';
  scrollEl.prepend(indicator);

  const isReaderOpen = () => document.body.classList.contains('reader-open');

  scrollEl.addEventListener('touchstart', (e) => {
    if (isReaderOpen()) { pulling = false; return; }
    if (scrollEl.scrollTop === 0 && e.touches.length === 1) {
      ptrStartY = e.touches[0].clientY;
      pulling = true;
      ptrDelta = 0;
    } else {
      pulling = false;
    }
  }, { passive: true });

  scrollEl.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    ptrDelta = Math.min(MAX_PULL, e.touches[0].clientY - ptrStartY);
    if (ptrDelta > 0) {
      indicator.style.transform = `translateY(${ptrDelta - 60}px)`;
      indicator.classList.toggle('ready', ptrDelta >= PULL_THRESHOLD);
    } else {
      indicator.style.transform = 'translateY(-60px)';
    }
  }, { passive: true });

  scrollEl.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (ptrDelta >= PULL_THRESHOLD) {
      indicator.classList.add('refreshing');
      indicator.style.transform = 'translateY(10px)';
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      setTimeout(() => {
        indicator.classList.remove('refreshing', 'ready');
        indicator.style.transform = 'translateY(-60px)';
      }, 600);
    } else {
      indicator.style.transform = 'translateY(-60px)';
      indicator.classList.remove('ready');
    }
    ptrDelta = 0;
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Continue-reading shelf (inline, on #/ only)
// ---------------------------------------------------------------------------

async function renderContinueShelf(host, options, epoch) {
  const records = await api.fetchContinueReading(SHELF_LIMIT, options.mediaType || undefined);
  if (epoch !== renderEpoch || !host.isConnected) return;
  if (!records || records.length === 0) {
    host.remove();
    return;
  }

  const shelf = document.createElement('section');
  shelf.className = 'continue-shelf';
  shelf.setAttribute('aria-label', 'Continue reading');

  const header = document.createElement('div');
  header.className = 'continue-shelf-header';
  const title = document.createElement('h2');
  title.className = 'continue-shelf-title';
  title.textContent = 'Continue Reading';
  const seeAll = document.createElement('a');
  seeAll.className = 'continue-shelf-seeall';
  seeAll.href = '#/continue';
  seeAll.textContent = 'See all';
  header.appendChild(title);
  header.appendChild(seeAll);

  const track = document.createElement('div');
  track.className = 'continue-shelf-track';
  for (const record of records) {
    const card = createCard(record);
    card.classList.add('continue-shelf-card');
    track.appendChild(card);
  }

  shelf.appendChild(header);
  shelf.appendChild(track);
  host.appendChild(shelf);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function routePart(value) {
  return encodeURIComponent(value);
}

function itemCountLabel(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function renderGroupCards(groups, toCardOptions, singularLabel, pluralLabel = `${singularLabel}s`, emptyReason = 'empty') {
  totalCount = groups.length;
  offset = groups.length;

  const countEl = document.getElementById('grid-count');
  if (countEl) countEl.textContent = `${groups.length.toLocaleString()} ${groups.length === 1 ? singularLabel : pluralLabel}`;

  if (groups.length === 0) {
    renderEmpty(grid, emptyReason);
    return;
  }

  for (const group of groups) {
    grid.appendChild(createGroupCard(toCardOptions(group)));
  }
}

function folderSeriesHref(folderId, seriesKey) {
  return `#/folder/${folderId}/series/${routePart(seriesKey)}`;
}

function folderVolumeHref(folderId, seriesKey, volumeKey) {
  return `${folderSeriesHref(folderId, seriesKey)}/volume/${routePart(volumeKey)}`;
}

function folderChapterHref(folderId, seriesKey, volumeKey, chapterKey) {
  return `${folderVolumeHref(folderId, seriesKey, volumeKey)}/chapter/${routePart(chapterKey)}`;
}

function browseSeriesHref(seriesKey) {
  return `#/browse/series/${routePart(seriesKey)}`;
}

function browseVolumeHref(seriesKey, volumeKey) {
  return `${browseSeriesHref(seriesKey)}/volume/${routePart(volumeKey)}`;
}

function browseChapterHref(seriesKey, volumeKey, chapterKey) {
  return `${browseVolumeHref(seriesKey, volumeKey)}/chapter/${routePart(chapterKey)}`;
}

/**
 * Returns true when a volume groups response should be bypassed — i.e. the
 * series has only one volume and it is the synthetic "no volume" bucket.  In
 * that case we skip straight to the comics level so the user never sees a
 * single-card "Unnumbered Volume" dead-end.
 */
function isSingleUnnumberedVolume(groups) {
  return groups.length === 1 && groups[0].key === GROUP_NONE_KEY;
}

function groupFilterOptions() {
  return {
    mediaType: currentOptions.mediaType || undefined,
    search: currentOptions.search || undefined,
    fileExt: currentOptions.fileExt || undefined,
    readStatus: currentOptions.readStatus || undefined,
    favorites: currentOptions.favorites ? true : undefined,
  };
}

/**
 * Render a series-level view that mixes named volume group cards with
 * individual comic cards for unnumbered issues (volume_number = null).
 *
 * @param {number} epoch - render epoch for stale-render guard
 * @param {Array}  namedGroups - volume groups whose key !== GROUP_NONE_KEY
 * @param {Function} volumeHrefFn - (group) => href string for each volume card
 * @param {Function|null} fetchUnnumbered - async () => { records } or null
 */
async function renderMixedSeries(epoch, namedGroups, volumeHrefFn, fetchUnnumbered) {
  let unnumberedComics = [];
  if (fetchUnnumbered) {
    const res = await fetchUnnumbered();
    if (epoch !== renderEpoch) return;
    unnumberedComics = res.records ?? [];
  }

  const totalItems = namedGroups.length + unnumberedComics.length;
  totalCount = totalItems;
  offset = totalItems;

  const countEl = document.getElementById('grid-count');
  if (countEl) countEl.textContent = itemCountLabel(totalItems);

  if (totalItems === 0) {
    renderEmpty(grid, 'empty');
    return;
  }

  for (const group of namedGroups) {
    grid.appendChild(createGroupCard({
      key: group.key,
      title: group.label,
      meta: group.chapterCount > 1 ? `${group.chapterCount} chapters` : itemCountLabel(group.count),
      badgeLabel: 'Volume',
      thumbnailUrl: group.thumbnailUrl,
      href: volumeHrefFn(group),
    }));
  }
  for (const record of unnumberedComics) {
    grid.appendChild(createCard(record));
    trackId(record.id);
  }
}

async function loadNextPage(epoch = renderEpoch) {
  if (loading) return;
  loading = true;

  const spinner = document.getElementById('grid-spinner');
  if (spinner) spinner.hidden = false;

  try {
    const opts = {
      ...currentOptions,
      offset,
      limit: PAGE_SIZE,
      sortBy: currentOptions.sortBy || 'title',
      sortOrder:
        currentOptions.sortBy === 'dateAdded' || currentOptions.sortBy === 'lastRead'
          ? 'desc'
          : undefined,
    };

    let result;

    // The "all" view (no library, no folder, no search/tag) hides comics
    // that already live inside a virtual folder, the same way the Electron
    // grid does. Folder cards then take their place — see folder load below.
    const isAllView = !currentRoute || currentRoute.type === 'all';

    if (currentRoute.type === 'recent') {
      const records = await api.fetchRecentlyRead(PAGE_SIZE + offset, currentOptions.mediaType || undefined);
      result = { records: records.slice(offset, offset + PAGE_SIZE), totalCount: records.length };
    } else if (currentRoute.type === 'continue') {
      const records = await api.fetchContinueReading(PAGE_SIZE + offset, currentOptions.mediaType || undefined);
      result = { records: records.slice(offset, offset + PAGE_SIZE), totalCount: records.length };
    } else if (currentRoute.type === 'library') {
      result = await api.fetchLibraryComics(currentRoute.id, opts);
    } else if (currentRoute.type === 'folder') {
      const response = await api.fetchFolderSeries(currentRoute.id, groupFilterOptions());
      if (epoch !== renderEpoch) return;
      renderGroupCards(response.groups ?? [], (group) => ({
        key: group.key,
        title: group.name,
        meta: itemCountLabel(group.count),
        badgeLabel: 'Series',
        thumbnailUrl: group.thumbnailUrl,
        href: folderSeriesHref(currentRoute.id, group.key),
      }), 'series', 'series');
      return;
    } else if (currentRoute.type === 'folderSeries') {
      const response = await api.fetchFolderSeriesVolumes(currentRoute.id, currentRoute.seriesKey, groupFilterOptions());
      if (epoch !== renderEpoch) return;
      const fsGroups = response.groups ?? [];
      if (isSingleUnnumberedVolume(fsGroups)) {
        // Nothing but unnumbered issues — skip the volume level entirely.
        result = await api.fetchFolderVolumeComics(currentRoute.id, currentRoute.seriesKey, GROUP_NONE_KEY, opts);
      } else {
        // Named volumes + any unnumbered issues rendered inline beneath them.
        const namedVols = fsGroups.filter((g) => g.key !== GROUP_NONE_KEY);
        const hasUnnumbered = fsGroups.some((g) => g.key === GROUP_NONE_KEY);
        await renderMixedSeries(
          epoch,
          namedVols,
          (group) => folderVolumeHref(currentRoute.id, currentRoute.seriesKey, group.key),
          hasUnnumbered
            ? () => api.fetchFolderVolumeComics(
                currentRoute.id, currentRoute.seriesKey, GROUP_NONE_KEY, { ...opts, limit: 200 },
              )
            : null,
        );
        return;
      }
    } else if (currentRoute.type === 'folderVolume') {
      const chapters = await api.fetchFolderVolumeChapters(
        currentRoute.id,
        currentRoute.seriesKey,
        currentRoute.volumeKey,
        groupFilterOptions(),
      );
      if (epoch !== renderEpoch) return;
      const chapterGroups = chapters.groups ?? [];
      const shouldShowChapters = chapterGroups.length > 1
        || (chapterGroups.length === 1 && chapterGroups[0].key !== GROUP_NONE_KEY && chapterGroups[0].count > 1);
      if (shouldShowChapters) {
        renderGroupCards(chapterGroups, (group) => ({
          key: group.key,
          title: group.label,
          meta: itemCountLabel(group.count),
          badgeLabel: 'Chapter',
          thumbnailUrl: group.thumbnailUrl,
          href: group.singleComicId && group.count === 1
            ? `#/read/${group.singleComicId}`
            : folderChapterHref(currentRoute.id, currentRoute.seriesKey, currentRoute.volumeKey, group.key),
        }), 'chapter');
        return;
      }
      result = await api.fetchFolderVolumeComics(currentRoute.id, currentRoute.seriesKey, currentRoute.volumeKey, opts);
    } else if (currentRoute.type === 'folderChapter') {
      result = await api.fetchFolderChapterComics(
        currentRoute.id,
        currentRoute.seriesKey,
        currentRoute.volumeKey,
        currentRoute.chapterKey,
        opts,
      );
    } else if (currentRoute.type === 'browseSeries') {
      const response = await api.fetchBrowseSeriesVolumes(currentRoute.seriesKey, groupFilterOptions());
      if (epoch !== renderEpoch) return;
      const bsGroups = response.groups ?? [];
      if (isSingleUnnumberedVolume(bsGroups)) {
        result = await api.fetchBrowseVolumeComics(currentRoute.seriesKey, GROUP_NONE_KEY, opts);
      } else {
        const namedVols = bsGroups.filter((g) => g.key !== GROUP_NONE_KEY);
        const hasUnnumbered = bsGroups.some((g) => g.key === GROUP_NONE_KEY);
        await renderMixedSeries(
          epoch,
          namedVols,
          (group) => browseVolumeHref(currentRoute.seriesKey, group.key),
          hasUnnumbered
            ? () => api.fetchBrowseVolumeComics(currentRoute.seriesKey, GROUP_NONE_KEY, { ...opts, limit: 200 })
            : null,
        );
        return;
      }
    } else if (currentRoute.type === 'browseVolume') {
      const bvChapters = await api.fetchBrowseVolumeChapters(
        currentRoute.seriesKey, currentRoute.volumeKey, groupFilterOptions(),
      );
      if (epoch !== renderEpoch) return;
      const bvChapterGroups = bvChapters.groups ?? [];
      const bvShowChapters = bvChapterGroups.length > 1
        || (bvChapterGroups.length === 1 && bvChapterGroups[0].key !== GROUP_NONE_KEY && bvChapterGroups[0].count > 1);
      if (bvShowChapters) {
        renderGroupCards(bvChapterGroups, (group) => ({
          key: group.key,
          title: group.label,
          meta: itemCountLabel(group.count),
          badgeLabel: 'Chapter',
          thumbnailUrl: group.thumbnailUrl,
          href: group.singleComicId && group.count === 1
            ? `#/read/${group.singleComicId}`
            : browseChapterHref(currentRoute.seriesKey, currentRoute.volumeKey, group.key),
        }), 'chapter');
        return;
      }
      result = await api.fetchBrowseVolumeComics(currentRoute.seriesKey, currentRoute.volumeKey, opts);
    } else if (currentRoute.type === 'browseChapter') {
      result = await api.fetchBrowseChapterComics(
        currentRoute.seriesKey,
        currentRoute.volumeKey,
        currentRoute.chapterKey,
        opts,
      );
    } else if (currentRoute.type === 'tag') {
      result = await api.fetchComics({ ...opts, tag: currentRoute.tag });
    } else if (currentOptions.search) {
      // Search is active on the all-items view → show series groups so the
      // user can drill down via the same series → volume → chapter hierarchy
      // that the folder view uses.
      const response = await api.fetchBrowseSeries(groupFilterOptions());
      if (epoch !== renderEpoch) return;
      const searchGroups = (response.groups ?? []).filter((g) => g.key !== GROUP_NONE_KEY);
      renderGroupCards(searchGroups, (group) => ({
        key: group.key,
        title: group.name,
        meta: itemCountLabel(group.count),
        badgeLabel: 'Series',
        thumbnailUrl: group.thumbnailUrl,
        href: browseSeriesHref(group.key),
      }), 'series', 'series');
      return;
    } else {
      result = await api.fetchComics({ ...opts, excludeFoldered: true });
    }
    if (epoch !== renderEpoch) return;

    // First page of the all view: render folder cards before the comic cards
    // so virtual folders behave like actual containers.
    if (isAllView && offset === 0) {
      try {
        const folders = await api.fetchFolders();
        if (epoch !== renderEpoch) return;
        for (const folder of folders ?? []) {
          grid.appendChild(createFolderCard(folder));
        }
      } catch (err) {
        console.warn('[CB8] Failed to load folders for all view:', err);
      }
    }

    totalCount = result.totalCount || result.records.length;
    offset += result.records.length;

    const countEl = document.getElementById('grid-count');
    if (countEl) countEl.textContent = `${totalCount.toLocaleString()} item${totalCount !== 1 ? 's' : ''}`;

    if (result.records.length === 0 && offset === 0) {
      renderEmpty(grid, emptyReasonForRoute(currentRoute));
    } else {
      for (const record of result.records) {
        grid.appendChild(createCard(record));
        trackId(record.id);
      }
    }
  } catch (err) {
    console.error('[CB8] Library load error:', err);
    if (offset === 0) {
      const reason =
        err?.status === 401 || err?.status === 403 ? 'signed-out'
        : err?.status >= 400 && err?.status < 500 ? 'empty'
        : 'offline';
      renderEmpty(grid, reason);
    }
  } finally {
    if (epoch === renderEpoch) {
      loading = false;
      const spinner = document.getElementById('grid-spinner');
      if (spinner) spinner.hidden = true;
    }
  }
}
