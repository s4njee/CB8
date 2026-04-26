/**
 * views/library/selection.js — multi-select state for the library grid.
 *
 * Owns the selection Set, the ordered-id list (for shift-click ranges),
 * the floating "N selected" bar, and the right-click context-menu hand-off
 * to admin.js. The grid element is provided per-render via setGrid() — the
 * library entry point owns the actual DOM.
 */

import { isAuthenticated, bulkDeleteComics } from '../../admin.js';

const selection = new Set();
const orderedIds = [];
let lastClickedId = null;
let selectionBar = null;
let grid = null;
let currentRoute = null;

export function setGrid(el, route) {
  grid = el;
  currentRoute = route;
}

export function resetSelection() {
  selection.clear();
  orderedIds.length = 0;
  lastClickedId = null;
  updateSelectionBar();
}

export function trackId(id) {
  orderedIds.push(id);
}

export function isSelected(id) { return selection.has(id); }
export function selectionSize() { return selection.size; }

export function ensureCheckbox(card) {
  const id = Number(card.dataset.id);
  const existing = card.querySelector('.card-checkbox');
  if (!isAuthenticated()) {
    existing?.remove();
    card.classList.remove('selected');
    return;
  }
  if (existing) {
    syncCardSelection(card);
    return;
  }
  const box = document.createElement('button');
  box.type = 'button';
  box.className = 'card-checkbox';
  box.setAttribute('aria-label', 'Select');
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.shiftKey) selectRangeTo(id);
    else toggleSelection(id);
  });
  const thumbWrap = card.querySelector('.card-thumb-wrap');
  thumbWrap?.appendChild(box);
  syncCardSelection(card);
}

export function syncCardSelection(card) {
  const id = Number(card.dataset.id);
  const selected = selection.has(id);
  card.classList.toggle('selected', selected);
  card.setAttribute('aria-selected', selected ? 'true' : 'false');
}

export function toggleSelection(id) {
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  lastClickedId = id;
  const card = grid?.querySelector(`.comic-card[data-id="${id}"]`);
  if (card) syncCardSelection(card);
  updateSelectionBar();
}

export function selectRangeTo(id) {
  if (lastClickedId == null) {
    toggleSelection(id);
    return;
  }
  const from = orderedIds.indexOf(lastClickedId);
  const to = orderedIds.indexOf(id);
  if (from < 0 || to < 0) {
    toggleSelection(id);
    return;
  }
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  for (let i = lo; i <= hi; i++) selection.add(orderedIds[i]);
  grid?.querySelectorAll('.comic-card').forEach(syncCardSelection);
  updateSelectionBar();
}

export function clearSelection() {
  selection.clear();
  lastClickedId = null;
  grid?.querySelectorAll('.comic-card.selected').forEach((card) => {
    card.classList.remove('selected');
    card.setAttribute('aria-selected', 'false');
  });
  updateSelectionBar();
}

function removeIds(ids) {
  for (const id of ids) {
    selection.delete(id);
    grid?.querySelector(`.comic-card[data-id="${id}"]`)?.remove();
    const idx = orderedIds.indexOf(id);
    if (idx >= 0) orderedIds.splice(idx, 1);
  }
  lastClickedId = null;
  updateSelectionBar();
}

export function openContextMenu(x, y, targetId) {
  const targets = selection.has(targetId) ? Array.from(selection) : [targetId];
  import('../../admin.js').then(({ openCardContextMenu }) => {
    openCardContextMenu(x, y, {
      targetId,
      targets,
      isSelected: selection.has(targetId),
      grid,
      route: currentRoute,
      onToggleSelect: (id) => toggleSelection(id),
      onRemoved: removeIds,
      onDelete: async (ids) => {
        const { removed } = await bulkDeleteComics(ids);
        removeIds(removed);
      },
    });
  });
}

function updateSelectionBar() {
  if (selection.size === 0) {
    selectionBar?.remove();
    selectionBar = null;
    return;
  }
  if (!selectionBar) {
    selectionBar = document.createElement('div');
    selectionBar.className = 'selection-bar';
    selectionBar.innerHTML = `
      <span class="selection-count"></span>
      <div class="selection-actions">
        <button type="button" class="selection-btn-secondary" data-action="clear">Cancel</button>
        <button type="button" class="selection-btn-danger" data-action="delete">Delete</button>
      </div>
    `;
    document.body.appendChild(selectionBar);
    selectionBar.querySelector('[data-action="clear"]').addEventListener('click', clearSelection);
    selectionBar.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ids = Array.from(selection);
      const { removed } = await bulkDeleteComics(ids);
      removeIds(removed);
    });
  }
  selectionBar.querySelector('.selection-count').textContent =
    `${selection.size} selected`;
}
