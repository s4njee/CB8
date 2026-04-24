/**
 * admin/resetPassword.js — "Set a new password" form rendered when the user
 * arrives via the email link at #/reset-password?token=....
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { closeModal } from './modal.js';

export function renderResetPassword(body, { token, onSuccess } = {}) {
  if (!token) {
    body.innerHTML = `
      <h2 class="admin-modal-title">Reset password</h2>
      <p class="admin-modal-desc">The reset link is missing its token — request a new email.</p>
      <div class="admin-actions"><button type="button" class="admin-btn-primary" data-action="close">Close</button></div>
    `;
    body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    return;
  }

  body.innerHTML = `
    <h2 class="admin-modal-title">Set a new password</h2>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="rp-password">New password</label>
      <input id="rp-password" type="password" class="admin-input" autocomplete="new-password" minlength="8" required autofocus />
      <label class="admin-label" for="rp-confirm">Confirm password</label>
      <input id="rp-confirm" type="password" class="admin-input" autocomplete="new-password" minlength="8" required />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="cancel">Cancel</button>
        <button type="submit" class="admin-btn-primary">Update password</button>
      </div>
    </form>
  `;
  const form = body.querySelector('form');
  const pw = body.querySelector('#rp-password');
  const confirm = body.querySelector('#rp-confirm');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    window.location.hash = '#/';
    closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (pw.value !== confirm.value) {
      err.textContent = 'Passwords do not match';
      err.hidden = false;
      return;
    }
    try {
      await api.resetPassword(pw.value, token);
    } catch (resetErr) {
      err.textContent = resetErr.message || 'Reset failed';
      err.hidden = false;
      return;
    }
    showToast('Password updated — please sign in.');
    window.location.hash = '#/';
    if (onSuccess) onSuccess();
    else closeModal();
  });
}
