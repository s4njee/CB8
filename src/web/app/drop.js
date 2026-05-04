/**
 * app/drop.js — Window-level drag-and-drop that routes through the
 * server-path ingest flow.
 *
 * Only active inside the Electron host (the only context where dropped
 * File objects expose a real filesystem path) and only for superadmins
 * (the audience the /api/admin/add-path route is gated to). In a remote
 * browser this module installs no listeners — drops fall through to the
 * default browser behavior.
 */

import * as api from '../api.js';
import { showToast } from './toast.js';
import { isElectron, getPathForFile } from '../host/index.js';
import { isAdmin } from '../admin.js';

export function wireDrop() {
  if (!isElectron()) return;

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
    if (!isAdmin()) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    overlay.hidden = false;
  });

  document.addEventListener('dragleave', () => {
    if (!isAdmin()) return;
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.hidden = true; }
  });

  document.addEventListener('dragover', (e) => {
    if (!isAdmin()) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', async (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dragCounter = 0;
    overlay.hidden = true;
    if (!isAdmin()) return;

    const paths = [];
    for (const file of e.dataTransfer.files) {
      const p = getPathForFile(file);
      if (p) paths.push(p);
    }
    if (paths.length === 0) {
      showToast('Could not resolve dropped paths');
      return;
    }

    showToast(`Scanning ${paths.length} path${paths.length !== 1 ? 's' : ''}…`);
    let totalAdded = 0;
    let failed = 0;
    for (const p of paths) {
      try {
        const result = await api.adminAddPath(p);
        totalAdded += result.added || 0;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      showToast(totalAdded > 0
        ? `Added ${totalAdded.toLocaleString()} item${totalAdded === 1 ? '' : 's'}`
        : 'No new items found');
    } else {
      showToast(`Added ${totalAdded}, failed ${failed} of ${paths.length}`);
    }
    if (totalAdded > 0) window.dispatchEvent(new CustomEvent('cb8:library-changed'));
  });
}
