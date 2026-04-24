import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub, { type Book, type Contents, type Location, type NavItem, type Rendition } from 'epubjs';
import { generateWindowTitle } from '../../shared/windowTitle';
import { readBookFile, updateReadingLocation } from '../ipcClient';

const DEFAULT_TITLE = 'CB8';
const READER_MARGIN_X = 72;
const READER_MARGIN_Y = 56;
const FONT_FAMILIES = [
  { label: 'System', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Mono', value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
] as const;
const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130] as const;
const EPUB_BASE_FONT_SCALE = 0.85;
type ThemeMode = 'black' | 'white';

function getThemeColors(mode: ThemeMode): { background: string; text: string; link: string } {
  return mode === 'black'
    ? { background: '#000000', text: '#f3f4f6', link: '#93c5fd' }
    : { background: '#ffffff', text: '#111827', link: '#1d4ed8' };
}

function buildEpubTheme(mode: ThemeMode, fontFamily: string): Record<string, Record<string, string>> {
  const colors = getThemeColors(mode);
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
      padding: '2rem 2.75rem',
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

function toEpubFontSizePercent(fontSize: number): string {
  return `${Math.round(fontSize * EPUB_BASE_FONT_SCALE)}%`;
}

/**
 * Force theme colors onto every element in a rendered section, using inline
 * style with !important. This is the only way to beat epub author stylesheets
 * that declare color with a class-scoped !important rule — those outrank our
 * theme stylesheet on specificity, but inline !important beats any stylesheet.
 *
 * Runs in the section iframe's document, invoked from epubjs's `rendered` hook.
 */
function forceThemeOnContent(contents: Contents, mode: ThemeMode): void {
  const colors = getThemeColors(mode);
  const doc = contents?.document;
  if (!doc) return;
  const body = doc.body;
  if (body) body.style.setProperty('background-color', colors.background, 'important');
  doc.documentElement?.style.setProperty('background-color', colors.background, 'important');
  const all = doc.querySelectorAll<HTMLElement>('*');
  for (const el of all) {
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG' || tag === 'PICTURE' || tag === 'VIDEO') continue;
    el.style.setProperty('color', colors.text, 'important');
    // Wipe any author-set background on individual elements so the page
    // background shows through consistently.
    el.style.setProperty('background-color', 'transparent', 'important');
  }
}

interface Props {
  filePath: string;
  comicId: number | null;
  initialLocation?: string | null;
  onBack: () => void;
}

function normalizeHref(href: string | null | undefined): string {
  return (href ?? '').split('#')[0].toLowerCase();
}

function findChapterLabel(items: NavItem[] | undefined, href: string | null | undefined): string | null {
  if (!items?.length) return null;
  const target = normalizeHref(href);
  if (!target) return null;
  for (const item of items) {
    if (normalizeHref(item.href) === target) return item.label;
    const nested = findChapterLabel(item.subitems, href);
    if (nested) return nested;
  }
  return null;
}

export const EpubReaderView: React.FC<Props> = ({ filePath, comicId, initialLocation, onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterLabel, setChapterLabel] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [fontFamily, setFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [fontSize, setFontSize] = useState<number>(100);
  const [themeMode, setThemeMode] = useState<ThemeMode>('black');
  // Keep the latest theme mode in a ref so the 'rendered' hook (registered
  // once during setup) always reads the current value without re-registering.
  const themeModeRef = useRef<ThemeMode>(themeMode);
  themeModeRef.current = themeMode;

  const filename = useMemo(() => filePath.split('/').pop()?.split('\\').pop() ?? filePath, [filePath]);

  useEffect(() => {
    document.title = generateWindowTitle(filePath);
    return () => { document.title = DEFAULT_TITLE; };
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const bytes = await readBookFile(filePath);
        if (cancelled) return;

        const book = ePub(bytes);
        bookRef.current = book;

        const container = containerRef.current;
        if (!container) throw new Error('Reader container is unavailable.');

        const rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
          spread: 'always',
          minSpreadWidth: 0,
          flow: 'paginated',
        });
        renditionRef.current = rendition;

        rendition.themes.default(buildEpubTheme(themeMode, fontFamily));
        rendition.themes.fontSize(toEpubFontSizePercent(fontSize));

        const toc = await book.loaded.navigation.catch(() => null);
        const handleRelocated = (href: string | null | undefined, percentage: number | null | undefined) => {
          const safeHref = href ?? '';
          const safePercentage = percentage ?? 0;
          const nextProgress = Math.max(0, Math.min(100, Math.round(safePercentage * 100)));
          setProgress(nextProgress);
          setChapterLabel(findChapterLabel(toc?.toc, safeHref) ?? normalizeHref(safeHref));
          if (comicId != null && safeHref) {
            updateReadingLocation(comicId, safeHref).catch(() => {});
          }
        };

        rendition.on('relocated', (location: Location) => {
          handleRelocated(location.start?.href ?? '', location.start?.percentage ?? 0);
        });
        rendition.on('rendered', (_section: unknown, view: { contents?: Contents }) => {
          if (renditionRef.current === rendition) setLoading(false);
          if (view?.contents) {
            try { forceThemeOnContent(view.contents, themeModeRef.current); }
            catch (err) { console.warn('[CB8] forceTheme (rendered) failed:', err); }
          }
        });

        await rendition.display(initialLocation ?? undefined);
        const current = await rendition.currentLocation();
        const resolved = current;
        if (resolved) {
          handleRelocated(resolved.href, resolved.percentage);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open EPUB.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
  }, [comicId, filePath, initialLocation]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    // Re-register the stylesheet theme and typography. The color / background
    // overrides are intentionally omitted — epubjs's `override()` calls
    // `content.css()` on every current Contents, which crashes with "cannot
    // read properties of null" when a Contents's iframe document is mid-swap.
    // `forceThemeOnContent` below applies colors inline with !important,
    // which is both safer and higher-specificity.
    //
    // Each call is wrapped individually so a transient null-doc crash in one
    // (typical during theme toggle) doesn't skip the others.
    try { rendition.themes.default(buildEpubTheme(themeMode, fontFamily)); }
    catch (err) { console.warn('[CB8] themes.default failed:', err); }
    try { rendition.themes.font(fontFamily); }
    catch (err) { console.warn('[CB8] themes.font failed:', err); }
    try { rendition.themes.fontSize(toEpubFontSizePercent(fontSize)); }
    catch (err) { console.warn('[CB8] themes.fontSize failed:', err); }
    // Walk each currently-rendered section and force theme colors as inline
    // !important styles. Author stylesheets with class-scoped !important rules
    // outrank our stylesheet, but inline !important beats any stylesheet.
    try {
      const contentsList = (rendition as unknown as { getContents?: () => Contents[] }).getContents?.() ?? [];
      for (const c of contentsList) {
        try { forceThemeOnContent(c, themeMode); }
        catch (err) { console.warn('[CB8] forceTheme failed on view:', err); }
      }
    } catch (err) {
      console.warn('[CB8] getContents failed (non-fatal):', err);
    }
  }, [fontFamily, fontSize, themeMode]);

  const navigate = useCallback(async (direction: 'next' | 'prev') => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      if (direction === 'next') await rendition.next();
      else await rendition.prev();
    } catch {
      // Ignore boundary errors from epubjs.
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        void navigate('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        void navigate('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, onBack]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const third = bounds.width / 3;
    if (x < third) void navigate('prev');
    else if (x > third * 2) void navigate('next');
  }, [navigate]);

  if (error) {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 18, marginBottom: 12 }}>{error}</div>
          <button onClick={onBack} style={{ backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: 4, padding: '8px 12px', cursor: 'pointer' }}>
            &larr; Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: themeMode === 'black' ? '#000' : '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: `${READER_MARGIN_Y}px ${READER_MARGIN_X}px 84px`,
          overflow: 'hidden',
        }}
        onClick={handleClick}
      />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex' }}>
        <div style={{ width: '33.333%', pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => void navigate('prev')} />
        <div style={{ flex: 1, pointerEvents: 'none' }} />
        <div style={{ width: '33.333%', pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => void navigate('next')} />
      </div>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
        <button onClick={onBack} style={{ backgroundColor: 'rgba(17,24,39,0.9)', color: '#fff', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 4, padding: '6px 10px', cursor: 'pointer' }}>
          &larr; Library
        </button>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, padding: '8px 14px', backgroundColor: themeMode === 'black' ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.88)', color: themeMode === 'black' ? '#e5e7eb' : '#111827', display: 'flex', justifyContent: 'space-between', fontSize: 13, pointerEvents: 'none' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
          {chapterLabel || filename}
        </span>
        <span>{progress}%</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, padding: '4px 14px', backgroundColor: themeMode === 'black' ? '#111827' : '#e5e7eb', borderTop: themeMode === 'black' ? '1px solid #374151' : '1px solid #cbd5e1', color: themeMode === 'black' ? '#e5e7eb' : '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Font</span>
          <select
            value={fontFamily}
            onChange={(event) => setFontFamily(event.target.value)}
            style={{ backgroundColor: themeMode === 'black' ? '#1f2937' : '#ffffff', color: themeMode === 'black' ? '#f9fafb' : '#111827', border: themeMode === 'black' ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font.label} value={font.value}>{font.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Size</span>
          <select
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            style={{ backgroundColor: themeMode === 'black' ? '#1f2937' : '#ffffff', color: themeMode === 'black' ? '#f9fafb' : '#111827', border: themeMode === 'black' ? '1px solid #4b5563' : '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}%</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setThemeMode('black')}
            style={{ backgroundColor: themeMode === 'black' ? '#2563eb' : 'transparent', color: themeMode === 'black' ? '#fff' : 'inherit', border: themeMode === 'black' ? '1px solid #3b82f6' : '1px solid #6b7280', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}
          >
            Black
          </button>
          <button
            onClick={() => setThemeMode('white')}
            style={{ backgroundColor: themeMode === 'white' ? '#2563eb' : 'transparent', color: themeMode === 'white' ? '#fff' : 'inherit', border: themeMode === 'white' ? '1px solid #3b82f6' : '1px solid #6b7280', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}
          >
            White
          </button>
        </div>
      </div>
      {(loading) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3f4f6', backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }}>
          Loading...
        </div>
      )}
    </div>
  );
};
