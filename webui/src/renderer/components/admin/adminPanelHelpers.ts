/**
 * @module
 * Admin Panel Routing & Access Helpers
 *
 * Architecture overview for Junior Devs:
 * The admin area is a single component that swaps between several "panels" (menu,
 * login, settings, upload, etc.). This module is the source of truth for which
 * panels exist, which require authentication, and what each one is titled — plus
 * the small rules for validating a requested panel and deciding which panel to
 * show given the auth state. Centralising this keeps the routing decisions
 * consistent and unit-testable, separate from the rendering component.
 */

/** Every admin panel the admin area can display, in definition order. */
export const ADMIN_PANELS = [
  'menu',
  'login',
  'forgot',
  'reset',
  'add-path',
  'upload',
  'users',
  'settings',
  'create-collection',
  'create-folder',
] as const;

/** Union of valid admin panel identifiers. */
export type AdminPanel = typeof ADMIN_PANELS[number];

/** Fast lookup set for validating arbitrary panel strings. */
const adminPanelSet = new Set<string>(ADMIN_PANELS);

/** Panels that require an authenticated user. */
const protectedPanels = new Set<AdminPanel>([
  'upload',
  'add-path',
  'settings',
  'users',
  'create-collection',
  'create-folder',
]);

/** Panels backed by admin-only server APIs. */
const adminOnlyPanels = new Set<AdminPanel>([
  'upload',
  'add-path',
  'users',
  'create-collection',
  'create-folder',
]);

/** Display title for each admin panel. */
const panelTitles: Record<AdminPanel, string> = {
  menu: 'Admin',
  login: 'Sign in',
  forgot: 'Reset password',
  reset: 'Set a new password',
  'add-path': 'Add from server path',
  upload: 'Upload comics',
  users: 'User Management',
  settings: 'Settings',
  'create-collection': 'New collection',
  'create-folder': 'New folder',
};

/**
 * Validate an arbitrary string as a known admin panel.
 * @param panel The candidate panel string.
 * @returns The typed panel if recognised, otherwise `null`.
 */
export function toAdminPanel(panel: string | null | undefined): AdminPanel | null {
  return panel && adminPanelSet.has(panel) ? (panel as AdminPanel) : null;
}

/**
 * Whether a panel requires authentication to view (type guard).
 * @param panel The panel to check.
 * @returns `true` (narrowing to `AdminPanel`) if the panel is protected.
 */
export function isProtectedAdminPanel(panel: AdminPanel | null | undefined): panel is AdminPanel {
  return Boolean(panel && protectedPanels.has(panel));
}

/**
 * Whether a panel is only available to admin users.
 * @param panel The panel to check.
 * @returns `true` when the panel is admin-only.
 */
export function isAdminOnlyPanel(panel: AdminPanel | null | undefined): panel is AdminPanel {
  return Boolean(panel && adminOnlyPanels.has(panel));
}

/**
 * Choose the panel to show for an initial request, enforcing auth.
 * Redirects unauthenticated protected requests to `login`, blocks signed-in
 *          non-admin users from admin-only panels, otherwise honours the request
 *          or falls back to `menu`.
 * @param requestedPanel The panel the user asked for, if any.
 * @param isAuthenticated Whether the user is signed in.
 * @param isAdmin Whether the signed-in user has admin rights.
 * @returns The panel to display.
 */
export function initialAdminPanelForRequest(
  requestedPanel: AdminPanel | null,
  isAuthenticated: boolean,
  isAdmin: boolean
): AdminPanel {
  if (isProtectedAdminPanel(requestedPanel) && !isAuthenticated) {
    return 'login';
  }
  if (isAdminOnlyPanel(requestedPanel) && !isAdmin) {
    return 'menu';
  }
  return requestedPanel ?? 'menu';
}

/**
 * Choose the panel to show after a successful login.
 * Returns the originally requested protected panel only when the signed-in user
 *          is allowed to view it, or `menu` otherwise.
 * @param requestedPanel The panel requested before login, if any.
 * @param isAdmin Whether the signed-in user has admin rights.
 * @returns The panel to display post-login.
 */
export function adminPanelAfterLogin(requestedPanel: AdminPanel | null, isAdmin: boolean): AdminPanel {
  if (requestedPanel && isProtectedAdminPanel(requestedPanel)) {
    if (isAdminOnlyPanel(requestedPanel) && !isAdmin) {
      return 'menu';
    }
    return requestedPanel;
  }
  return 'menu';
}

/**
 * Get the display title for a panel.
 * @param panel The panel.
 * @returns The human-readable title.
 */
export function adminPanelTitle(panel: AdminPanel): string {
  return panelTitles[panel];
}
