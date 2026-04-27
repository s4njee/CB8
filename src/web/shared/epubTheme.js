/**
 * shared/epubTheme.js — colors, fonts, and the inline-style theme walker
 * shared between the Electron renderer and the embedded web UI's EPUB
 * reader. Plain JS so the browser can fetch it without a transpile step.
 *
 * Lives under src/web/ rather than src/shared/ for one reason: src/web/
 * is the only directory the embedded HTTP server serves and packages.
 */

export const FONT_FAMILIES = [
  { label: 'System', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Mono', value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
];

export const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130];
export const EPUB_BASE_FONT_SCALE = 0.85;

/**
 * @typedef {'black' | 'white'} ThemeMode
 */

/** @param {ThemeMode} mode */
export function getThemeColors(mode) {
  return mode === 'black'
    ? { background: '#000000', text: '#f3f4f6', link: '#93c5fd' }
    : { background: '#ffffff', text: '#111827', link: '#1d4ed8' };
}

/**
 * Build the stylesheet rules epubjs's `themes.default(rules)` expects.
 * Inline `!important` everywhere so we beat author stylesheets at the
 * stylesheet specificity level — the iframe-DOM walker below is the
 * fallback when even that loses.
 *
 * @param {ThemeMode} mode
 * @param {string} fontFamily
 */
export function buildEpubTheme(mode, fontFamily) {
  const colors = getThemeColors(mode);
  const hPad = '2.75rem';
  const textRule = {
    color: `${colors.text} !important`,
    'background-color': 'transparent !important',
  };
  return {
    html: {
      background: `${colors.background} !important`,
      'background-color': `${colors.background} !important`,
    },
    body: {
      background: `${colors.background} !important`,
      'background-color': `${colors.background} !important`,
      color: `${colors.text} !important`,
      'font-family': fontFamily,
      'line-height': '1.6',
      margin: '0',
      padding: `2rem ${hPad}`,
      'box-sizing': 'border-box',
    },
    'body *': textRule,
    'p, div, span, section, article, aside, li, blockquote, h1, h2, h3, h4, h5, h6': textRule,
    a: {
      color: `${colors.link} !important`,
      'background-color': 'transparent !important',
    },
    img: {
      'max-width': '100%',
      'max-height': '100%',
    },
    p: {
      'margin-top': '0',
      'margin-bottom': '1em',
    },
  };
}

/** @param {number} fontSize percentage 0–200 */
export function toEpubFontSizePercent(fontSize) {
  return `${Math.round(fontSize * EPUB_BASE_FONT_SCALE)}%`;
}

/**
 * Force theme colors (and optional font-family) onto every element in a
 * rendered section's iframe document, using inline style with !important.
 * This is the only way to beat epub author stylesheets that declare color
 * with a class-scoped !important rule — those outrank our theme stylesheet
 * on specificity, but inline !important beats any stylesheet.
 *
 * Mounted from epubjs's `rendered` hook on each section.
 *
 * @param {{ document?: Document } | null | undefined} contents — epubjs Contents-like
 * @param {ThemeMode} mode
 * @param {string} [fontFamily] — when provided, also stamps font-family inline
 */
export function forceThemeOnContent(contents, mode, fontFamily) {
  const colors = getThemeColors(mode);
  const doc = contents?.document;
  if (!doc) return;
  const body = doc.body;
  if (body) {
    body.style.setProperty('background-color', colors.background, 'important');
    if (fontFamily) body.style.setProperty('font-family', fontFamily, 'important');
  }
  doc.documentElement?.style.setProperty('background-color', colors.background, 'important');
  for (const el of doc.querySelectorAll('*')) {
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG' || tag === 'PICTURE' || tag === 'VIDEO') continue;
    el.style.setProperty('color', colors.text, 'important');
    el.style.setProperty('background-color', 'transparent', 'important');
    if (fontFamily) el.style.setProperty('font-family', fontFamily, 'important');
  }
}
