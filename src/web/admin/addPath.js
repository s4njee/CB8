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
      <label class="admin-label" for="admin-folder">Folder (optional)</label>
      <input id="admin-folder" type="text" class="admin-input" list="admin-folder-options" placeholder="Leave empty to add to main library" autocomplete="off" spellcheck="false" />
      <datalist id="admin-folder-options"></datalist>
      <p class="admin-hint">Existing folders are suggested; a new name creates an empty folder. Foldered items don't appear in the main library view.</p>
      <label class="admin-check">
        <input id="admin-use-folder-series" type="checkbox" />
        <span>Use folder names as series</span>
      </label>
      <p class="admin-hint">Leave off for omnibus folders where each archive should stand alone.</p>
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
  const folderInput = body.querySelector('#admin-folder');
  const useFolderSeriesInput = body.querySelector('#admin-use-folder-series');
  const folderOptions = body.querySelector('#admin-folder-options');
  const err = body.querySelector('.admin-error');
  const submit = form.querySelector('button[type="submit"]');
  const cancelBtn = body.querySelector('[data-action="cancel"]');
  const progress = body.querySelector('.admin-progress');
  const progressPhase = body.querySelector('.admin-progress-phase');
  const progressFill = body.querySelector('.admin-progress-fill');
  const progressMeta = body.querySelector('.admin-progress-meta');
  const progressFile = body.querySelector('.admin-progress-file');

  cancelBtn.addEventListener('click', () => openModal(renderMenu));

  api.fetchFolders()
    .then((folders) => {
      folderOptions.innerHTML = (folders || [])
        .map((f) => `<option value="${f.name.replace(/"/g, '&quot;')}"></option>`)
        .join('');
    })
    .catch(() => { /* leave empty */ });

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
    folderInput.disabled = true;
    useFolderSeriesInput.disabled = true;
    submit.textContent = 'Scanning…';
    progress.hidden = false;
    progressPhase.textContent = 'Starting…';
    progressFill.style.width = '0%';
    progressMeta.textContent = '';
    progressFile.textContent = '';

    try {
      const folderName = folderInput.value.trim();
      const useFolderNamesAsSeries = useFolderSeriesInput.checked;
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
      }, { folderName, useFolderNamesAsSeries });
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));

      const failureTotal = result.failuresSummary?.total ?? 0;
      if (failureTotal > 0) {
        // Don't auto-close — show the breakdown so the user can see WHY some
        // files failed instead of just "Added N items" and a silent gap.
        renderFailureReport(body, result, folderName);
        return;
      }

      const msg = result.added > 0
        ? `Added ${result.added.toLocaleString()} item${result.added === 1 ? '' : 's'}`
        : 'No new items found';
      closeModal();
      showToast(msg);
    } catch (e2) {
      err.textContent = e2.message || 'Failed to add path';
      err.hidden = false;
      progress.hidden = true;
    } finally {
      submit.disabled = false;
      input.disabled = false;
      folderInput.disabled = false;
      useFolderSeriesInput.disabled = false;
      submit.textContent = 'Add';
    }
  });
}

function classLabel(c) {
  switch (c) {
    case 'wasm_oom':       return 'WASM out-of-memory (try CB8_INGEST_CONCURRENCY=4)';
    case 'archive_open':   return 'Archive open failed (corrupt / encrypted / unsupported)';
    case 'fs_missing':     return 'File disappeared between scan and ingest';
    case 'fs_permission':  return 'Permission denied';
    case 'timeout':        return 'Cover / page-count extraction timed out';
    case 'unknown':        return 'Other / unclassified';
    default:               return c;
  }
}

function renderFailureReport(body, result, folderName) {
  const summary = result.failuresSummary;
  const breakdown = Object.entries(summary.byClass || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<li><strong>${v.toLocaleString()}</strong> &middot; ${classLabel(k)}</li>`)
    .join('');
  const sample = (summary.sample || [])
    .slice(0, 8)
    .map((f) => {
      const name = f.path.split(/[\\/]/).pop();
      const msg = (f.message || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      return `<li title="${f.path.replace(/"/g, '&quot;')}">
        <code>${name}</code> &mdash; <span class="settings-initial-password-hint">[${f.errorClass}] ${msg}</span>
      </li>`;
    })
    .join('');

  body.innerHTML = `
    <h2 class="admin-modal-title">Scan finished with errors</h2>
    <p class="admin-hint">
      Added <strong>${result.added.toLocaleString()}</strong> item${result.added === 1 ? '' : 's'} &middot;
      <strong>${summary.total.toLocaleString()}</strong> file${summary.total === 1 ? '' : 's'} failed.
      Full list is in <code>ingest-errors.jsonl</code> under the app's user-data directory.
    </p>
    <div class="settings-initial-password">
      <div class="settings-initial-password-label">By reason</div>
      <ul style="margin: 0; padding-left: 18px; font-size: 0.86rem;">${breakdown}</ul>
    </div>
    ${sample ? `
      <div class="settings-initial-password">
        <div class="settings-initial-password-label">First ${Math.min(summary.sample.length, 8)} failures</div>
        <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; line-height: 1.5;">${sample}</ul>
      </div>
    ` : ''}
    <div class="admin-actions">
      <button type="button" class="admin-btn-secondary" data-action="clear-log">Clear log</button>
      <button type="button" class="admin-btn-primary" data-action="close">Close</button>
    </div>
  `;
  void folderName;
  body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  body.querySelector('[data-action="clear-log"]').addEventListener('click', async () => {
    try {
      await api.adminClearIngestErrors();
      showToast('Ingest error log cleared');
    } catch (clearErr) {
      showToast(clearErr.message || 'Failed to clear log');
    }
  });
}
