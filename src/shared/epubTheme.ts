export interface FontFamily {
  label: string;
  value: string;
}

export const FONT_FAMILIES: FontFamily[] = [
  { label: 'System', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Mono', value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
];

export const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130];
export const EPUB_BASE_FONT_SCALE = 0.85;

export type ThemeMode = 'black' | 'white';

export interface ThemeColors {
  background: string;
  text: string;
  link: string;
}

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === 'black'
    ? { background: '#000000', text: '#f3f4f6', link: '#93c5fd' }
    : { background: '#ffffff', text: '#111827', link: '#1d4ed8' };
}

export function buildEpubTheme(mode: ThemeMode, fontFamily: string) {
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

export function toEpubFontSizePercent(fontSize: number): string {
  return `${Math.round(fontSize * EPUB_BASE_FONT_SCALE)}%`;
}

export function forceThemeOnContent(
  contents: { document?: Document } | null | undefined,
  mode: ThemeMode,
  fontFamily?: string
): void {
  const colors = getThemeColors(mode);
  const doc = contents?.document;
  if (!doc) return;
  const body = doc.body;
  if (body) {
    body.style.setProperty('background-color', colors.background, 'important');
    if (fontFamily) body.style.setProperty('font-family', fontFamily, 'important');
  }
  doc.documentElement?.style.setProperty('background-color', colors.background, 'important');
  const elements = doc.querySelectorAll('*');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG' || tag === 'PICTURE' || tag === 'VIDEO') continue;
    el.style.setProperty('color', colors.text, 'important');
    el.style.setProperty('background-color', 'transparent', 'important');
    if (fontFamily) el.style.setProperty('font-family', fontFamily, 'important');
  }
}
