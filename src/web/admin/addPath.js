/**
 * admin/addPath.js — "Add from server path" flow.
 *
 * Admin-only. Takes a filesystem path on the server host, streams scan
 * progress via NDJSON, and indexes files in place. Includes a
 * filesystem autocomplete on the input powered by /api/admin/list-dir.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { openModal, closeModal } from './modal.js';
import { renderMenu } from './menu.js';

export function renderAddPath(body) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Add from server path</h2>
    <p class="admin-hint">Enter a file or directory path on the server host. Files are indexed in place.</p>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="admin-path">Server path</label>
      <div class="path-autocomplete">
        <input id="admin-path" type="text" class="admin-input" placeholder="Loading host path…" autocomplete="off" spellcheck="false" />
        <ul class="path-suggestions" hidden></ul>
      </div>
      <div class="admin-error" hidden></div>
      <div class="admin-progress" hidden>
        <div class="admin-progress-phase"></div>
        <div class="admin-progress-track"><div class="admin-progress-fill"></div></div>
        <div class="admin-progress-meta"></div>
        <div class="admin-progress-file"></div>
      </div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="cancel">Cancel</button>
        <button type="submit" class="admin-btn-primary">Add</button>
      </div>
    </form>
  `;
  const form = body.querySelector('form');
  const input = body.querySelector('#admin-path');
  const err = body.querySelector('.admin-error');
  const submit = form.querySelector('button[type="submit"]');
  const cancelBtn = body.querySelector('[data-action="cancel"]');
  const progress = body.querySelector('.admin-progress');
  const progressPhase = body.querySelector('.admin-progress-phase');
  const progressFill = body.querySelector('.admin-progress-fill');
  const progressMeta = body.querySelector('.admin-progress-meta');
  const progressFile = body.querySelector('.admin-progress-file');

  cancelBtn.addEventListener('click', () => openModal(renderMenu));

  api.adminHostInfo()
    .then(({ homePath }) => {
      if (!input.value) {
        input.value = homePath;
        input.placeholder = homePath;
        fetchSuggestions();
      }
    })
    .catch(() => {
      input.placeholder = '/';
    });

  // --- Path autocomplete --------------------------------------------------
  const suggestions = body.querySelector('.path-suggestions');
  let suggestionItems = [];
  let highlighted = -1;
  let debounceTimer = null;
  let fetchSeq = 0;

  const hideSuggestions = () => {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    suggestionItems = [];
    highlighted = -1;
  };

  const renderSuggestions = (entries) => {
    if (entries.length === 0) { hideSuggestions(); return; }
    suggestionItems = entries;
    highlighted = -1;
    suggestions.innerHTML = entries.map((e, i) => `
      <li class="path-suggestion" data-index="${i}">
        <span class="path-suggestion-icon">${e.isDir ? '📁' : '📄'}</span>
        <span class="path-suggestion-name">${e.name}${e.isDir ? '/' : ''}</span>
      </li>
    `).join('');
    suggestions.hidden = false;
  };

  const applySuggestion = (i) => {
    if (i < 0 || i >= suggestionItems.length) return;
    input.value = suggestionItems[i].path;
    hideSuggestions();
    if (suggestionItems[i].isDir) fetchSuggestions();
    input.focus();
  };

  const fetchSuggestions = () => {
    const value = input.value;
    if (!value) { hideSuggestions(); return; }
    const mySeq = ++fetchSeq;
    api.adminListDir(value)
      .then(({ entries }) => {
        if (mySeq !== fetchSeq) return;
        renderSuggestions(entries);
      })
      .catch(() => {
        if (mySeq !== fetchSeq) return;
        hideSuggestions();
      });
  };

  input.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchSuggestions, 120);
  });

  input.addEventListener('keydown', (e) => {
    if (suggestions.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = (highlighted + 1) % suggestionItems.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = (highlighted - 1 + suggestionItems.length) % suggestionItems.length;
    } else if (e.key === 'Tab' || (e.key === 'Enter' && highlighted >= 0)) {
      e.preventDefault();
      applySuggestion(highlighted >= 0 ? highlighted : 0);
      return;
    } else if (e.key === 'Escape') {
      hideSuggestions();
      return;
    } else {
      return;
    }
    suggestions.querySelectorAll('.path-suggestion').forEach((el, i) => {
      el.classList.toggle('is-active', i === highlighted);
    });
    const active = suggestions.querySelector('.is-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  });

  suggestions.addEventListener('mousedown', (e) => {
    const li = e.target.closest('.path-suggestion');
    if (!li) return;
    e.preventDefault();
    applySuggestion(parseInt(li.dataset.index, 10));
  });

  input.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });

  const phaseLabel = (phase) => {
    if (phase === 'books') return 'Scanning books…';
    if (phase === 'file') return 'Adding file…';
    return 'Scanning comics…';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const p = input.value.trim();
    if (!p) return;
    submit.disabled = true;
    input.disabled = true;
    submit.textContent = 'Scanning…';
    progress.hidden = false;
    progressPhase.textContent = 'Starting…';
    progressFill.style.width = '0%';
    progressMeta.textContent = '';
    progressFile.textContent = '';

    try {
      const result = await api.adminAddPath(p, (msg) => {
        progressPhase.textContent = phaseLabel(msg.phase);
        const pct = msg.discovered > 0
          ? Math.min(100, Math.round((msg.processed / msg.discovered) * 100))
          : 0;
        progressFill.style.width = `${pct}%`;
        progressMeta.textContent = msg.discovered > 0
          ? `${msg.processed.toLocaleString()} / ${msg.discovered.toLocaleString()}`
          : 'Discovering files…';
        progressFile.textContent = msg.currentFile || '';
      });
      const msg = result.added > 0
        ? `Added ${result.added.toLocaleString()} item${result.added === 1 ? '' : 's'}`
        : 'No new items found';
      closeModal();
      showToast(msg);
      if (result.errors?.length) console.warn('[CB8] Add path errors:', result.errors);
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
    } catch (e2) {
      err.textContent = e2.message || 'Failed to add path';
      err.hidden = false;
      progress.hidden = true;
    } finally {
      submit.disabled = false;
      input.disabled = false;
      submit.textContent = 'Add';
    }
  });
}
