/**
 * app/sideContextMenu.js — Small floating menu used by sidebar / tab-panel
 * rows, plus a long-press helper for touch devices.
 */

let _sideMenu = null;

export function closeSideMenu() {
  _sideMenu?.remove();
  _sideMenu = null;
  document.removeEventListener('click', _onSideDocClick, true);
  document.removeEventListener('keydown', _onSideKey, true);
  window.removeEventListener('scroll', closeSideMenu, true);
  window.removeEventListener('resize', closeSideMenu);
}

function _onSideDocClick(e) { if (_sideMenu && !_sideMenu.contains(e.target)) closeSideMenu(); }
function _onSideKey(e) { if (e.key === 'Escape') closeSideMenu(); }

export function isSideMenuOpen() { return _sideMenu != null; }

export function openSideContextMenu(x, y, items) {
  closeSideMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    if (it.danger) btn.className = 'danger';
    btn.textContent = it.label;
    btn.addEventListener('click', () => { closeSideMenu(); it.onClick(); });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
  _sideMenu = menu;
  setTimeout(() => {
    document.addEventListener('click', _onSideDocClick, true);
    document.addEventListener('keydown', _onSideKey, true);
    window.addEventListener('scroll', closeSideMenu, true);
    window.addEventListener('resize', closeSideMenu);
  }, 0);
}

export function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0, startY = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; handler(startX, startY, e); }, 500);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
}
