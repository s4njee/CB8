/**
 * admin.js — Public entry for the admin panel.
 *
 * Re-exports the surface that app.js (and any future caller) imports.
 * The implementation lives under admin/ — see individual modules for
 * login, menu, add-path, bulk delete, and the card context menu.
 */

export {
  isAuthenticated,
  isAdmin,
  isSuperadmin,
  getCurrentUser,
  isGuestAccessEnabled,
  onAdminChange,
  refreshSession,
} from './admin/session.js';

export { toggleAdminPanel, openAddComic } from './admin/menu.js';
export { bulkDeleteComics } from './admin/bulkDelete.js';
export { openCardContextMenu } from './admin/contextMenu.js';
