/**
 * admin/modal.js — Shared modal scaffolding used by the admin flows.
 *
 * A single <div id="admin-modal"> is lazily attached to <body>. Each open()
 * call swaps in a fresh body, rendered by the passed callback.
 */

export function ensureModal() {
  let modal = document.getElementById('admin-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'admin-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-panel" role="document">
      <div class="admin-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.admin-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  return modal;
}

export function openModal(renderBody) {
  const modal = ensureModal();
  const body = modal.querySelector('.admin-modal-body');
  body.innerHTML = '';
  renderBody(body);
  modal.hidden = false;
}

export function closeModal() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.hidden = true;
}
