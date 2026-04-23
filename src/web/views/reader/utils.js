/**
 * views/reader/utils.js — Shared helpers: toolbar builder, script loader, format guessing.
 */

export function buildToolbar(title, onBack) {
  const toolbar = document.createElement('div');
  toolbar.className = 'reader-toolbar';
  toolbar.style.zIndex = '50';

  const backBtn = document.createElement('a');
  backBtn.className = 'toolbar-back';
  backBtn.href = '#/';
  backBtn.innerHTML = '← Back';
  backBtn.addEventListener('click', (e) => { e.preventDefault(); onBack(); });

  const titleEl = document.createElement('div');
  titleEl.className = 'toolbar-title';
  titleEl.textContent = title;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'reader-page-slider';
  slider.value = 0;

  const pagesEl = document.createElement('div');
  pagesEl.className = 'toolbar-pages';

  toolbar.appendChild(backBtn);
  toolbar.appendChild(titleEl);
  toolbar.appendChild(slider);
  toolbar.appendChild(pagesEl);

  return toolbar;
}

export function guessExtension(record) {
  if (record.pageCount === 0 && !record.lastPage) return 'epub';
  if (record.lastLocation && record.lastLocation.includes('epubcfi')) return 'epub';
  if (record.pageCount > 0 && !record.lastLocation) return 'pdf';
  return 'epub'; // default for books
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}
