/**
 * admin/settings.js — Web Server settings dialog rendered inside the
 * shared admin modal.
 *
 * Reachable from the Electron `Settings → Web Server…` menu item, which
 * fires the `open-settings` host event and is wired in `src/web/app.js`.
 * Only meaningful when running inside Electron — in the browser the host
 * bridge returns null and we render an explanatory placeholder instead
 * (the embedded server is the host the browser is already connected to,
 * and end-users cannot reconfigure it from there).
 */

import { closeModal } from './modal.js';
import { showToast } from '../app/toast.js';
import { getWebServerSettings, setWebServerSettings, isElectron } from '../host/index.js';
import * as api from '../api.js';

async function renderInitialPasswordSection(container) {
  try {
    const { password } = await api.fetchInitialCredentials();
    if (!password) return;
    const section = document.createElement('div');
    section.className = 'settings-initial-password';
    section.innerHTML = `
      <div class="settings-initial-password-label">Temporary password</div>
      <div class="settings-initial-password-row">
        <code class="settings-initial-password-value">${password}</code>
        <button type="button" class="admin-btn-secondary settings-initial-password-copy">Copy</button>
        <button type="button" class="admin-btn-secondary settings-initial-password-clear">Clear</button>
      </div>
      <p class="settings-initial-password-hint">Change your password to invalidate this.</p>
    `;
    section.querySelector('.settings-initial-password-copy').addEventListener('click', () => {
      navigator.clipboard?.writeText(password).catch(() => {});
      showToast('Copied to clipboard');
    });
    section.querySelector('.settings-initial-password-clear').addEventListener('click', async () => {
      try {
        await api.clearInitialCredentials();
        section.remove();
        showToast('Temporary password cleared');
      } catch (err) { showToast(err.message); }
    });
    container.prepend(section);
  } catch { /* no initial password */ }
}

function renderWebServerForm(body, settings) {
  const form = document.createElement('form');
  form.className = 'admin-form';
  form.autocomplete = 'off';
  form.innerHTML = `
    <label class="admin-label" style="display: flex; align-items: center; gap: 10px;">
      <input id="ws-enabled" type="checkbox" />
      <span>Expose to local network</span>
    </label>
    <p style="margin: -4px 0 4px 24px; color: var(--text-dim); font-size: 12px;">
      When off, the server only listens on 127.0.0.1 (this machine).
    </p>

    <label class="admin-label" for="ws-port">Port</label>
    <input id="ws-port" type="number" class="admin-input" min="1024" max="65535" step="1" />

    <div id="ws-status" style="margin-top: 8px; font-size: 13px; color: var(--text-dim);"></div>

    <div class="admin-error" hidden></div>
    <div class="admin-actions">
      <button type="button" class="admin-btn-secondary" data-action="cancel">Close</button>
      <button type="submit" class="admin-btn-primary" data-action="save">Apply</button>
    </div>
  `;
  body.appendChild(form);

  const enabledInput = form.querySelector('#ws-enabled');
  const portInput = form.querySelector('#ws-port');
  const statusEl = form.querySelector('#ws-status');
  const err = form.querySelector('.admin-error');

  function paint(s) {
    enabledInput.checked = s.enabled;
    portInput.value = String(s.port);
    const lines = [];
    if (s.url) lines.push(`Local: ${s.url}`);
    if (s.enabled && s.lanUrl) lines.push(`LAN: ${s.lanUrl}`);
    statusEl.textContent = lines.join('  •  ');
  }
  paint(settings);

  form.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const port = parseInt(portInput.value, 10);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      err.textContent = 'Port must be a number between 1024 and 65535.';
      err.hidden = false;
      return;
    }
    try {
      const updated = await setWebServerSettings(enabledInput.checked, port);
      if (updated) paint(updated);
      showToast('Web server settings applied.');
    } catch (saveErr) {
      err.textContent = saveErr.message || 'Failed to apply settings.';
      err.hidden = false;
    }
  });
}

function renderLibraryDangerSection(body) {
  const section = document.createElement('section');
  section.className = 'settings-danger-section';
  section.innerHTML = `
    <div>
      <h3 class="settings-section-title">Library data</h3>
      <p class="settings-section-hint">
        Clear all comics, books, collections, folders, tags, reading progress, and watched folders from the library database. Files on disk are not deleted.
      </p>
    </div>
    <button type="button" class="admin-btn-danger" data-action="clear-library">Clear library</button>
    <div class="admin-error" hidden></div>
  `;

  const button = section.querySelector('[data-action="clear-library"]');
  const err = section.querySelector('.admin-error');
  button.addEventListener('click', async () => {
    err.hidden = true;
    const confirmation = window.prompt('Type CLEAR to remove all library data. Comic files on disk will not be deleted.');
    if (confirmation !== 'CLEAR') return;

    button.disabled = true;
    try {
      const { removed } = await api.clearLibrary();
      closeModal();
      window.dispatchEvent(new CustomEvent('cb8:library-changed'));
      showToast(`Library cleared (${removed?.comics ?? 0} items removed).`);
    } catch (clearErr) {
      err.textContent = clearErr.message || 'Failed to clear library.';
      err.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  body.appendChild(section);
}

export async function renderSettings(body) {
  body.innerHTML = `<h2 class="admin-modal-title">Settings</h2>`;

  await renderInitialPasswordSection(body);
  renderLibraryDangerSection(body);

  if (isElectron()) {
    let settings;
    try {
      settings = await getWebServerSettings();
    } catch { /* no web server settings */ }
    if (settings) {
      renderWebServerForm(body, settings);
      return;
    }
  }

  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  actions.innerHTML = `<button type="button" class="admin-btn-primary" data-action="close">Close</button>`;
  actions.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  body.appendChild(actions);
}
