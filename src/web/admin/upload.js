/**
 * admin/upload.js — File/folder upload flow inside the admin modal.
 *
 * Drag-drop or pick files, then stream them to /api/admin/upload one by
 * one with per-file progress + an overall progress bar.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { openModal, closeModal } from './modal.js';
import { ACCEPT_ATTR, isAccepted, formatBytes, gatherFromDrop } from './drop.js';
import { renderMenu } from './menu.js';

export function renderUpload(body) {
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
      setTimeout(closeModal, 800);
    } else {
      startBtn.textContent = 'Done';
      startBtn.disabled = false;
      startBtn.onclick = closeModal;
    }
  });
}
