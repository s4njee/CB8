/**
 * admin/signup.js — Create-account form rendered inside the admin modal.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { closeModal } from './modal.js';
import { refreshSession } from './session.js';
import { renderLogin } from './login.js';

export function renderSignup(body, { onSuccess } = {}) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Create account</h2>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="signup-username">Username</label>
      <input id="signup-username" type="text" class="admin-input" autocomplete="username" minlength="3" maxlength="30" required autofocus />
      <label class="admin-label" for="signup-email">Email</label>
      <input id="signup-email" type="email" class="admin-input" autocomplete="email" required />
      <label class="admin-label" for="signup-password">Password</label>
      <input id="signup-password" type="password" class="admin-input" autocomplete="new-password" minlength="8" required />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
        <button type="submit" class="admin-btn-primary">Create account</button>
      </div>
    </form>
    <div class="admin-alt-link">
      <button type="button" class="admin-link-btn" data-action="login">Already have an account? Sign in</button>
    </div>
  `;
  const form = body.querySelector('form');
  const usernameInput = body.querySelector('#signup-username');
  const emailInput = body.querySelector('#signup-email');
  const passwordInput = body.querySelector('#signup-password');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="back"]').addEventListener('click', closeModal);
  body.querySelector('[data-action="login"]').addEventListener('click', () => {
    renderLogin(body, { onSuccess });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api.signup({
        username: usernameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
      });
    } catch (signupErr) {
      err.textContent = signupErr.message || 'Sign-up failed';
      err.hidden = false;
      return;
    }
    await refreshSession();
    showToast('Account created — check your inbox to verify your email.');
    if (onSuccess) onSuccess();
    else closeModal();
  });
}
