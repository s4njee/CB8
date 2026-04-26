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

function renderUnavailable(body) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Settings</h2>
    <p style="margin: 0 0 12px 0; color: var(--text-dim);">
      Web Server settings are only configurable from the desktop app.
    </p>
    <div class="admin-actions">
      <button type="button" class="admin-btn-primary" data-action="close">Close</button>
    </div>
  `;
  body.querySelector('[data-action="close"]').addEventListener('click', closeModal);
}

function renderForm(body, settings) {
  body.innerHTML = `
    <h2 class="admin-modal-title">Web Server</h2>
    <form class="admin-form" autocomplete="off">
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
    </form>
  `;
  const enabledInput = body.querySelector('#ws-enabled');
  const portInput = body.querySelector('#ws-port');
  const statusEl = body.querySelector('#ws-status');
  const err = body.querySelector('.admin-error');
  const form = body.querySelector('form');

  function paint(s) {
    enabledInput.checked = s.enabled;
    portInput.value = String(s.port);
    const lines = [];
    if (s.url) lines.push(`Local: ${s.url}`);
    if (s.enabled && s.lanUrl) lines.push(`LAN: ${s.lanUrl}`);
    statusEl.textContent = lines.join('  •  ');
  }
  paint(settings);

  body.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);

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

export async function renderSettings(body) {
  if (!isElectron()) {
    renderUnavailable(body);
    return;
  }
  body.innerHTML = `<p style="margin: 0; color: var(--text-dim);">Loading…</p>`;
  let settings;
  try {
    settings = await getWebServerSettings();
  } catch (err) {
    body.innerHTML = `<p class="admin-error">${err.message || 'Failed to load settings.'}</p>`;
    return;
  }
  if (!settings) {
    renderUnavailable(body);
    return;
  }
  renderForm(body, settings);
}
