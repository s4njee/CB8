/**
 * admin/session.js — Session state + auth predicates.
 *
 * Central store for who-the-current-user-is. Listeners subscribe via
 * onAdminChange and are notified when refreshSession mutates state.
 */

import * as api from '../api.js';

export const state = {
  authenticated: false,
  host: false,
  user: null,
  guestAccess: false,
  listeners: new Set(),
};

export function isAuthenticated() {
  return state.authenticated;
}

export function isAdmin() {
  return Boolean(state.user?.isAdmin);
}

export function isSuperadmin() {
  return state.authenticated && state.host && isAdmin();
}

export function getCurrentUser() { return state.user; }
export function isGuestAccessEnabled() { return state.guestAccess; }

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
    const resp = await api.getSession();
    state.authenticated = Boolean(resp.authenticated);
    state.host = Boolean(resp.host);
    state.user = resp.user ?? null;
    state.guestAccess = Boolean(resp.guestAccess);
  } catch {
    state.authenticated = false;
    state.host = false;
    state.user = null;
    state.guestAccess = false;
  }
  notify();
  return state.authenticated;
}
