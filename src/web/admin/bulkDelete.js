/**
 * admin/bulkDelete.js — Confirm-and-delete helper used by selection bulk ops.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { state } from './session.js';

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
