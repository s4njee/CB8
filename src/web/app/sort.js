/**
 * app/sort.js — Sort sheet + label wiring.
 */

import { state, SORT_LABELS } from './state.js';
import { navigate } from './router.js';

export function openSortSheet() {
  const sheet = document.getElementById('sort-sheet');
  sheet.querySelectorAll('button[data-sort]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === state.sortBy);
  });
  sheet.hidden = false;
}

export function closeSortSheet() {
  const sheet = document.getElementById('sort-sheet');
  if (sheet) sheet.hidden = true;
}

export function updateSortLabel() {
  const label = document.querySelector('#sort-button .sort-button-label');
  if (label) label.textContent = SORT_LABELS[state.sortBy] || 'Title';
}

export function applySort(value) {
  state.sortBy = value;
  const select = document.getElementById('sort-select');
  if (select) select.value = value;
  updateSortLabel();
  navigate();
}
