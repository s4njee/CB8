/**
 * admin/forgotPassword.js — Request a password-reset email.
 *
 * The actual reset happens at #/reset-password?token=..., which the server
 * points at from the email link.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { closeModal } from './modal.js';
import { renderLogin } from './login.js';

export function renderForgotPassword(body, { onSuccess } = {}) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Reset password</h2>
    <p class="admin-modal-desc">Enter your email and we'll send you a link to reset your password.</p>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="fp-email">Email</label>
      <input id="fp-email" type="email" class="admin-input" autocomplete="email" required autofocus />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
        <button type="submit" class="admin-btn-primary">Send link</button>
      </div>
    </form>
    <div class="admin-alt-link">
      <button type="button" class="admin-link-btn" data-action="login">Back to sign in</button>
    </div>
  `;
  const form = body.querySelector('form');
  const emailInput = body.querySelector('#fp-email');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="back"]').addEventListener('click', closeModal);
  body.querySelector('[data-action="login"]').addEventListener('click', () => {
    renderLogin(body, { onSuccess });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api.requestPasswordReset(emailInput.value.trim());
    } catch (resetErr) {
      err.textContent = resetErr.message || 'Could not send reset link';
      err.hidden = false;
      return;
    }
    showToast('Reset link sent — check your inbox.');
    closeModal();
  });
}
