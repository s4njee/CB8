/**
 * admin.js — CB8 admin panel (login + add path + logout)
 *
 * Exposes a small module around a single session-cookie-backed admin state.
 * The admin button in the nav toggles either a login modal (if logged out)
 * or an action menu (if logged in).
 */

import * as api from './api.js';
import { showToast } from './app.js';

const state = {
  authenticated: false,
  host: false,
  listeners: new Set(),
};

export function isAuthenticated() {
  return state.authenticated;
}

export function isSuperadmin() {
  return state.authenticated && state.host;
}

export function onAdminChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function notify() {
  for (const fn of state.listeners) {
    try { fn(state.authenticated); } catch (err) { console.error(err); }
  }
}

export async function refreshSession() {
  try {
    const { authenticated, host } = await api.adminSession();
    state.authenticated = Boolean(authenticated);
    state.host = Boolean(host);
  } catch {
    state.authenticated = false;
    state.host = false;
  }
  notify();
  return state.authenticated;
}

// ---------------------------------------------------------------------------
// DOM scaffolding
// ---------------------------------------------------------------------------

function ensureModal() {
  let modal = document.getElementById('admin-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'admin-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-panel" role="document">
      <div class="admin-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.admin-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  return modal;
}

function openModal(renderBody) {
  const modal = ensureModal();
  const body = modal.querySelector('.admin-modal-body');
  body.innerHTML = '';
  renderBody(body);
  modal.hidden = false;
}

function closeModal() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.hidden = true;
}

// ---------------------------------------------------------------------------
// Views inside the modal
// ---------------------------------------------------------------------------

function renderLogin(body, { onSuccess } = {}) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Admin login</h2>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="admin-pass">Password</label>
      <input id="admin-pass" type="password" class="admin-input" autofocus />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
        <button type="submit" class="admin-btn-primary">Sign in</button>
      </div>
    </form>
  `;
  const form = body.querySelector('form');
  const input = body.querySelector('#admin-pass');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="back"]').addEventListener('click', () => openModal(renderMenu));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const ok = await api.adminLogin(input.value);
    if (!ok) {
      err.textContent = 'Incorrect password';
      err.hidden = false;
      input.select();
      return;
    }
    await refreshSession();
    showToast('Signed in as admin');
    if (onSuccess) onSuccess();
    else closeModal();
  });
}

function renderMenu(body) {
  const authed = state.authenticated;
  const superadmin = state.authenticated;
  body.innerHTML = `
    <h2 class="admin-modal-title">Admin</h2>
    <div class="admin-menu">
      <button type="button" class="admin-menu-btn" data-action="upload">
        <span>Upload comics</span>
        ${authed ? '' : '<span class="admin-lock" aria-hidden="true">🔒</span>'}
      </button>
      ${superadmin ? `
        <button type="button" class="admin-menu-btn" data-action="add-path">
          <span>Add from server path</span>
        </button>
      ` : ''}
      ${authed ? `
        <button type="button" class="admin-menu-btn" data-action="logout">
          Sign out
        </button>
      ` : `
        <button type="button" class="admin-menu-btn" data-action="login">
          Log in as admin
        </button>
      `}
    </div>
    <div class="admin-footer">
      <button type="button" class="admin-btn-secondary admin-close-btn" data-action="close">Close</button>
    </div>
  `;

  body.querySelector('[data-action="upload"]').addEventListener('click', () => {
    if (state.authenticated) {
      openModal(renderUpload);
    } else {
      openModal((b) => renderLogin(b, { onSuccess: () => openModal(renderUpload) }));
    }
  });

  const addPathBtn = body.querySelector('[data-action="add-path"]');
  if (addPathBtn) {
    addPathBtn.addEventListener('click', () => openModal(renderAddPath));
  }

  const loginBtn = body.querySelector('[data-action="login"]');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      openModal((b) => renderLogin(b, { onSuccess: () => openModal(renderMenu) }));
    });
  }

  const logoutBtn = body.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api.adminLogout();
      await refreshSession();
      openModal(renderMenu);
      showToast('Signed out');
    });
  }

  body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
}

const ACCEPTED_EXTS = ['cbz', 'cbr', 'epub', 'pdf', 'mobi'];
const ACCEPT_ATTR = ACCEPTED_EXTS.map((e) => `.${e}`).join(',');

function isAccepted(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((e) => name.endsWith(`.${e}`));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function gatherFromDataTransferItem(item, pathPrefix, out) {
  if (item.isFile) {
    await new Promise((resolve) => {
      item.file((file) => {
        if (isAccepted(file)) {
          out.push({ file, relPath: pathPrefix + file.name });
        }
        resolve();
      }, () => resolve());
    });
  } else if (item.isDirectory) {
    const reader = item.createReader();
    const readAll = () => new Promise((resolve) => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) return resolve();
        for (const entry of entries) {
          await gatherFromDataTransferItem(entry, pathPrefix + item.name + '/', out);
        }
        resolve(readAll());
      }, () => resolve());
    });
    await readAll();
  }
}

async function gatherFromDrop(dt) {
  const out = [];
  if (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function') {
    const entries = [];
    for (const item of dt.items) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      await gatherFromDataTransferItem(entry, '', out);
    }
  } else {
    for (const file of dt.files) {
      if (isAccepted(file)) out.push({ file, relPath: file.name });
    }
  }
  return out;
}

function renderUpload(body) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Upload comics</h2>
    <p class="admin-hint">Drop files or folders here. Supported: .cbz .cbr .epub .pdf .mobi</p>

    <div class="upload-dropzone" tabindex="0">
      <div class="upload-dropzone-text">Drop files or folders</div>
      <div class="upload-dropzone-or">or</div>
      <div class="upload-picker-row">
        <button type="button" class="admin-btn-secondary" data-action="pick-files">Choose files…</button>
        <button type="button" class="admin-btn-secondary" data-action="pick-folder">Choose folder…</button>
      </div>
      <input type="file" class="upload-file-input" multiple accept="${ACCEPT_ATTR}" hidden />
      <input type="file" class="upload-folder-input" webkitdirectory multiple hidden />
    </div>

    <div class="upload-summary" hidden></div>
    <div class="upload-overall" hidden>
      <div class="admin-progress-phase"></div>
      <div class="admin-progress-track"><div class="admin-progress-fill"></div></div>
    </div>
    <div class="upload-list" hidden></div>
    <div class="admin-error" hidden></div>

    <div class="admin-actions">
      <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
      <button type="button" class="admin-btn-primary" data-action="start" disabled>Upload</button>
    </div>
  `;

  const dropzone = body.querySelector('.upload-dropzone');
  const fileInput = body.querySelector('.upload-file-input');
  const folderInput = body.querySelector('.upload-folder-input');
  const summary = body.querySelector('.upload-summary');
  const overall = body.querySelector('.upload-overall');
  const overallPhase = overall.querySelector('.admin-progress-phase');
  const overallFill = overall.querySelector('.admin-progress-fill');
  const listEl = body.querySelector('.upload-list');
  const errEl = body.querySelector('.admin-error');
  const startBtn = body.querySelector('[data-action="start"]');
  const backBtn = body.querySelector('[data-action="back"]');

  let queue = [];
  let uploading = false;

  const refreshSummary = () => {
    if (queue.length === 0) {
      summary.hidden = true;
      startBtn.disabled = true;
      return;
    }
    const total = queue.reduce((s, q) => s + q.file.size, 0);
    summary.hidden = false;
    summary.textContent = `${queue.length} file${queue.length === 1 ? '' : 's'} · ${formatBytes(total)} queued`;
    startBtn.disabled = uploading;
  };

  const addFiles = (items) => {
    const seen = new Set(queue.map((q) => q.relPath));
    for (const item of items) {
      if (!isAccepted(item.file)) continue;
      if (seen.has(item.relPath)) continue;
      seen.add(item.relPath);
      queue.push({ ...item, status: 'pending', loaded: 0 });
    }
    renderList();
    refreshSummary();
  };

  const renderList = () => {
    if (queue.length === 0) {
      listEl.hidden = true;
      listEl.innerHTML = '';
      return;
    }
    listEl.hidden = false;
    listEl.innerHTML = queue.map((q, i) => {
      const pct = q.file.size > 0 ? Math.round((q.loaded / q.file.size) * 100) : 0;
      const statusClass = `upload-item-${q.status}`;
      const statusText = q.status === 'pending' ? ''
        : q.status === 'uploading' ? `${pct}%`
        : q.status === 'done' ? 'Added'
        : q.status === 'skipped' ? 'Already in library'
        : q.status === 'error' ? (q.error || 'Failed') : '';
      return `
        <div class="upload-item ${statusClass}" data-index="${i}">
          <div class="upload-item-head">
            <span class="upload-item-name" title="${q.relPath}">${q.relPath}</span>
            <span class="upload-item-meta">${formatBytes(q.file.size)}</span>
          </div>
          <div class="upload-item-bar"><div class="upload-item-fill" style="width:${pct}%"></div></div>
          <div class="upload-item-status">${statusText}</div>
        </div>
      `;
    }).join('');
  };

  const updateItemProgress = (i, loaded) => {
    queue[i].loaded = loaded;
    const item = listEl.querySelector(`[data-index="${i}"]`);
    if (!item) return;
    const pct = queue[i].file.size > 0 ? Math.round((loaded / queue[i].file.size) * 100) : 0;
    item.querySelector('.upload-item-fill').style.width = `${pct}%`;
    if (queue[i].status === 'uploading') {
      item.querySelector('.upload-item-status').textContent = `${pct}%`;
    }
  };

  const setItemStatus = (i, status, extra) => {
    queue[i].status = status;
    if (extra?.error) queue[i].error = extra.error;
    const item = listEl.querySelector(`[data-index="${i}"]`);
    if (!item) return;
    item.className = `upload-item upload-item-${status}`;
    const text = status === 'done' ? 'Added'
      : status === 'skipped' ? 'Already in library'
      : status === 'error' ? (extra?.error || 'Failed')
      : status === 'uploading' ? '0%' : '';
    item.querySelector('.upload-item-status').textContent = text;
  };

  // Drag & drop
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    stop(e); dropzone.classList.add('is-dragover');
  }));
  ['dragleave', 'dragend'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    stop(e); dropzone.classList.remove('is-dragover');
  }));
  dropzone.addEventListener('drop', async (e) => {
    stop(e);
    dropzone.classList.remove('is-dragover');
    try {
      const items = await gatherFromDrop(e.dataTransfer);
      if (items.length === 0) {
        errEl.textContent = 'No supported files in drop';
        errEl.hidden = false;
      } else {
        errEl.hidden = true;
        addFiles(items);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Failed to read drop';
      errEl.hidden = false;
    }
  });

  body.querySelector('[data-action="pick-files"]').addEventListener('click', () => fileInput.click());
  body.querySelector('[data-action="pick-folder"]').addEventListener('click', () => folderInput.click());

  fileInput.addEventListener('change', () => {
    const items = Array.from(fileInput.files).map((file) => ({ file, relPath: file.name }));
    addFiles(items);
    fileInput.value = '';
  });
  folderInput.addEventListener('change', () => {
    const items = Array.from(folderInput.files).map((file) => ({
      file,
      relPath: file.webkitRelativePath || file.name,
    }));
    addFiles(items);
    folderInput.value = '';
  });

  backBtn.addEventListener('click', () => {
    if (uploading) return;
    openModal(renderMenu);
  });

  startBtn.addEventListener('click', async () => {
    if (uploading || queue.length === 0) return;
    uploading = true;
    startBtn.disabled = true;
    backBtn.disabled = true;
    errEl.hidden = true;
    overall.hidden = false;

    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === 'done' || item.status === 'skipped') continue;
      setItemStatus(i, 'uploading');
      overallPhase.textContent = `Uploading ${i + 1} of ${queue.length} — ${item.relPath}`;
      overallFill.style.width = `${Math.round((i / queue.length) * 100)}%`;
      try {
        const result = await api.adminUploadFile(item.file, item.relPath, (loaded) => {
          updateItemProgress(i, loaded);
        });
        updateItemProgress(i, item.file.size);
        if (result.skipped) { setItemStatus(i, 'skipped'); skippedCount++; }
        else if (result.added) { setItemStatus(i, 'done'); addedCount++; }
        else { setItemStatus(i, 'skipped'); skippedCount++; }
      } catch (err) {
        setItemStatus(i, 'error', { error: err.message });
        failedCount++;
      }
    }

    overallFill.style.width = '100%';
    overallPhase.textContent = `Done — ${addedCount} added, ${skippedCount} skipped, ${failedCount} failed`;
    uploading = false;
    backBtn.disabled = false;

    if (addedCount > 0) {
      showToast(`Added ${addedCount} item${addedCount === 1 ? '' : 's'}`);
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
    }
    if (failedCount === 0 && addedCount + skippedCount === queue.length) {
      // Auto-close on clean run
      setTimeout(closeModal, 800);
    } else {
      startBtn.textContent = 'Done';
      startBtn.disabled = false;
      startBtn.onclick = closeModal;
    }
  });
}

function renderAddPath(body) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Add to library</h2>
    <p class="admin-hint">Enter a file or directory path on the server. Files are added in place.</p>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="admin-path">Path</label>
      <div class="path-autocomplete">
        <input id="admin-path" type="text" class="admin-input" placeholder="/home/user/Comics" autocomplete="off" spellcheck="false" autofocus />
        <ul class="path-suggestions" hidden></ul>
      </div>
      <div class="admin-picker-row">
        <button type="button" class="admin-btn-secondary" data-action="pick-file">Choose file…</button>
        <button type="button" class="admin-btn-secondary" data-action="pick-folder">Choose folder…</button>
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
    // If the user picked a directory, fetch its children for further completion.
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
    e.preventDefault(); // keep focus on input
    applySuggestion(parseInt(li.dataset.index, 10));
  });

  input.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });

  const pickAndFill = async (kind) => {
    err.hidden = true;
    try {
      const { path: picked } = await api.adminPickPath(kind);
      if (picked) input.value = picked;
    } catch (e2) {
      err.textContent = e2.message || 'Picker unavailable';
      err.hidden = false;
    }
  };
  body.querySelector('[data-action="pick-file"]').addEventListener('click', () => pickAndFill('file'));
  body.querySelector('[data-action="pick-folder"]').addEventListener('click', () => pickAndFill('directory'));

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

// ---------------------------------------------------------------------------
// Public entry point: called from the nav button
// ---------------------------------------------------------------------------

export function toggleAdminPanel() {
  openModal(renderMenu);
}

export async function bulkDeleteComics(ids) {
  if (!state.authenticated || ids.length === 0) return { removed: [], failed: [] };
  const plural = ids.length === 1 ? 'item' : 'items';
  const ok = window.confirm(
    `Remove ${ids.length} ${plural} from the library?\n\nThis only updates the database — files on disk are not touched.`,
  );
  if (!ok) return { removed: [], failed: [] };

  const removed = [];
  const failed = [];
  for (const id of ids) {
    try {
      await api.deleteComic(id);
      removed.push(id);
    } catch (err) {
      console.error('[CB8] delete failed', id, err);
      failed.push(id);
    }
  }

  if (removed.length > 0) {
    showToast(`Removed ${removed.length} ${removed.length === 1 ? 'item' : 'items'}`);
    window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  }
  if (failed.length > 0) {
    showToast(`${failed.length} failed to delete`);
  }
  return { removed, failed };
}
