/**
 * admin/login.js — Sign-in form rendered inside the admin modal.
 */

import * as api from '../api.js';
import { showToast } from '../app.js';
import { closeModal } from './modal.js';
import { refreshSession } from './session.js';
import { renderSignup } from './signup.js';
import { renderForgotPassword } from './forgotPassword.js';

export function renderLogin(body, { onSuccess } = {}) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Sign in</h2>
    <form class="admin-form" autocomplete="off">
      <label class="admin-label" for="admin-user">Username or email</label>
      <input id="admin-user" type="text" class="admin-input" autofocus autocomplete="username" />
      <label class="admin-label" for="admin-pass">Password</label>
      <input id="admin-pass" type="password" class="admin-input" autocomplete="current-password" />
      <div class="admin-error" hidden></div>
      <div class="admin-actions">
        <button type="button" class="admin-btn-secondary" data-action="back">Back</button>
        <button type="submit" class="admin-btn-primary">Sign in</button>
      </div>
    </form>
    <div class="admin-alt-link">
      <button type="button" class="admin-link-btn" data-action="signup">Create an account</button>
      <button type="button" class="admin-link-btn" data-action="forgot">Forgot password?</button>
    </div>
  `;
  const form = body.querySelector('form');
  const userInput = body.querySelector('#admin-user');
  const passInput = body.querySelector('#admin-pass');
  const err = body.querySelector('.admin-error');
  body.querySelector('[data-action="back"]').addEventListener('click', closeModal);
  body.querySelector('[data-action="signup"]').addEventListener('click', () => {
    renderSignup(body, { onSuccess });
  });
  body.querySelector('[data-action="forgot"]').addEventListener('click', () => {
    renderForgotPassword(body, { onSuccess });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api.login(userInput.value.trim(), passInput.value);
    } catch (loginErr) {
      err.innerHTML = '';
      err.appendChild(document.createTextNode(loginErr.message || 'Sign-in failed'));
      // When the server says the email isn't verified, offer a one-click
      // resend — we can only attempt it if the user typed their email
      // directly into the identifier field.
      const isEmailError = loginErr.code === 'EMAIL_NOT_VERIFIED'
        || /not verified|verify your email/i.test(loginErr.message || '');
      if (isEmailError && userInput.value.includes('@')) {
        const resend = document.createElement('button');
        resend.type = 'button';
        resend.className = 'admin-link-btn';
        resend.style.marginLeft = '8px';
        resend.textContent = 'Resend verification email';
        resend.addEventListener('click', async () => {
          try {
            await api.sendVerificationEmail(userInput.value.trim());
            showToast('Verification email sent — check your inbox.');
          } catch (resendErr) {
            showToast(resendErr.message || 'Could not resend verification email');
          }
        });
        err.appendChild(resend);
      }
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
