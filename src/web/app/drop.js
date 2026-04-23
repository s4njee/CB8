/**
 * app/drop.js — Window-level drag-and-drop for bulk upload.
 *
 * Only active when the current user is authenticated. Uses the admin
 * module's gatherFromDrop to walk webkitGetAsEntry dirs, then streams
 * each file via api.adminUploadFile.
 */

import * as api from '../api.js';
import { showToast } from './toast.js';
import { isAuthenticated, gatherFromDrop } from '../admin.js';

export function wireDrop() {
  const overlay = document.getElementById('drop-overlay') || (() => {
    const el = document.createElement('div');
    el.id = 'drop-overlay';
    el.hidden = true;
    el.innerHTML = '<span>Drop to add to library</span>';
    document.body.appendChild(el);
    return el;
  })();

  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    dragCounter++;
    overlay.hidden = false;
  });

  document.addEventListener('dragleave', () => {
    if (!isAuthenticated()) return;
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.hidden = true; }
  });

  document.addEventListener('dragover', (e) => {
    if (!isAuthenticated()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.hidden = true;
    if (!isAuthenticated()) return;

    let items;
    try {
      items = await gatherFromDrop(e.dataTransfer);
    } catch (err) {
      showToast(`Drop failed: ${err.message}`);
      return;
    }
    if (items.length === 0) {
      showToast('No supported files in drop (.cbz .cbr .epub .pdf .mobi)');
      return;
    }

    showToast(`Uploading ${items.length} file${items.length !== 1 ? 's' : ''}…`);
    let added = 0;
    let failed = 0;
    for (const { file, relPath } of items) {
      try {
        await api.adminUploadFile(file, relPath);
        added++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      showToast(`Added ${added} file${added !== 1 ? 's' : ''}`);
    } else {
      showToast(`Added ${added}, failed ${failed}`);
    }
    if (added > 0) window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  });
}
