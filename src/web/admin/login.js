/**
 * admin/login.js — Sign-in form rendered inside the admin modal.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { closeModal } from './modal.js';
import { refreshSession } from './session.js';

export function renderLogin(body, { onSuccess } = {}) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Sign in</h2>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="admin-user">Username</label>
      <input id="admin-user" type="text" class="admin-input" value="admin" autofocus />
      <label class="admin-label" for="admin-pass">Password</label>
      <input id="admin-pass" type="password" class="admin-input" />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
        <button type="submit" class="admin-btn-primary">Sign in</button>
      </div>
    </form>
  `;
  const form = body.querySelector('form');
  const userInput = body.querySelector('#admin-user');
  const passInput = body.querySelector('#admin-pass');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="back"]').addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api.login(userInput.value.trim(), passInput.value);
    } catch (loginErr) {
      err.textContent = loginErr.message || 'Sign-in failed';
      err.hidden = false;
      passInput.select();
      return;
    }
    await refreshSession();
    showToast('Signed in');
    if (onSuccess) onSuccess();
    else closeModal();
  });
}
