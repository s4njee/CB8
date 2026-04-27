/**
 * admin/menu.js — Top-level admin menu + entry points (toggleAdminPanel,
 * openAddComic) that decide whether to show login or the menu.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { openModal, closeModal } from './modal.js';
import { state, isAdmin, refreshSession } from './session.js';
import { renderLogin } from './login.js';
import { renderUpload } from './upload.js';
import { renderAddPath } from './addPath.js';
import { renderSettings } from './settings.js';

export function renderMenu(body) {
  const authed = state.authenticated;
  const superadmin = isAdmin();
  body.innerHTML = `
    <h2 class="admin-modal-title">Admin</h2>
    <div class="admin-menu">
      ${authed ? `
        <button type="button" class="admin-menu-btn" data-action="upload">
          <span>Upload comics</span>
        </button>
      ` : ''}
      ${superadmin ? `
        <button type="button" class="admin-menu-btn" data-action="add-path">
          <span>Add from server path</span>
        </button>
      ` : ''}
      ${authed ? `
        <button type="button" class="admin-menu-btn" data-action="settings">
          Settings
        </button>
        <button type="button" class="admin-menu-btn" data-action="logout">
          Sign out
        </button>
      ` : `
        <button type="button" class="admin-menu-btn" data-action="login">
          Log in
        </button>
      `}
    </div>
    <div class="admin-footer">
      <button type="button" class="admin-btn-secondary admin-close-btn" data-action="close">Close</button>
    </div>
  `;

  const uploadBtn = body.querySelector('[data-action="upload"]');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => openModal(renderUpload));
  }

  const addPathBtn = body.querySelector('[data-action="add-path"]');
  if (addPathBtn) {
    addPathBtn.addEventListener('click', () => openModal(renderAddPath));
  }

  const settingsBtn = body.querySelector('[data-action="settings"]');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => openModal((b) => renderSettings(b)));
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
      await api.logout();
      await refreshSession();
      openModal(renderMenu);
      showToast('Signed out');
    });
  }

  body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
}

export function toggleAdminPanel() {
  if (!state.authenticated) {
    openModal((b) => renderLogin(b, { onSuccess: () => openModal(renderMenu) }));
  } else {
    openModal(renderMenu);
  }
}

/** Opens the upload flow directly (used by the "+" button in the nav). */
export function openAddComic() {
  if (state.authenticated) {
    openModal(renderUpload);
  } else {
    openModal((b) => renderLogin(b, { onSuccess: () => openModal(renderUpload) }));
  }
}
