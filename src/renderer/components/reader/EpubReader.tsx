import React, { useEffect, useState, useRef, useCallback } from 'react';
import { List, Settings, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useReaderStore } from '@/store/readerStore';
import * as api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  getThemeColors,
  buildEpubTheme,
  toEpubFontSizePercent,
  forceThemeOnContent,
} from '../../../shared/epubTheme';

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const EPUBJS_CDN = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';

interface EpubReaderProps {
  record: api.WebComicRecord;
  initialLocation?: string;
  setExtraControls?: (controls: React.ReactNode) => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export default function EpubReader({
  record,
  initialLocation,
  setExtraControls,
}: EpubReaderProps) {
  const { epubPrefs, setEpubPrefs } = useReaderStore();

  const containerRef = useRef<HTMLDivElement | null>(null);

  // States
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookLoading, setBookLoading] = useState(true);

  const [book, setBook] = useState<any>(null);
  const [rendition, setRendition] = useState<any>(null);

  const [chapters, setChapters] = useState<any[]>([]);
  const [currentPercent, setCurrentPercent] = useState<number>(0);

  // Sheets visible states
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Local state copy for google font input to prevent rapid theme changes on keypress
  const [localGoogleFont, setLocalGoogleFont] = useState(epubPrefs.googleFont || '');

  // 1. Dynamic CDN libraries loader
  useEffect(() => {
    async function loadLibs() {
      try {
        if (!(window as any).JSZip) {
          await loadScript(JSZIP_CDN);
        }
        if (!(window as any).ePub) {
          await loadScript(EPUBJS_CDN);
        }
        setLibsLoaded(true);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load EPUB reading libraries.');
        setBookLoading(false);
      }
    }
    loadLibs();
  }, []);

  const effectiveFontFamily = useCallback(() => {
    return epubPrefs.googleFont ? `'${epubPrefs.googleFont}', serif` : epubPrefs.fontFamily;
  }, [epubPrefs.googleFont, epubPrefs.fontFamily]);

  // 2. Re-apply themes to EpubJS and current iframe contents
  const applyThemeColors = useCallback(() => {
    if (!rendition) return;

    const ff = effectiveFontFamily();
    const mode = epubPrefs.themeMode;

    try {
      rendition.themes.default(buildEpubTheme(mode, ff));
    } catch {}
    try {
      rendition.themes.font(ff);
    } catch {}
    try {
      rendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize));
    } catch {}

    // Apply colors inline to the views inside the iframe
    try {
      const contentsList = rendition.getContents?.() ?? [];
      const colors = getThemeColors(mode);
      for (const c of contentsList) {
        try {
          if (epubPrefs.googleFont && c.document) {
            injectGoogleFont(c.document, epubPrefs.googleFont);
          }
          forceThemeOnContent(c, mode, ff);
        } catch {}
      }
      // Set background colors on all iframe containers directly
      const views = rendition.manager?.views?._views ?? [];
      for (const v of views) {
        try {
          if (v.iframe) {
            v.iframe.style.setProperty('background-color', colors.background, 'important');
          }
        } catch {}
      }
    } catch {}
  }, [rendition, epubPrefs.themeMode, epubPrefs.fontSize, epubPrefs.googleFont, effectiveFontFamily]);

  // Inject Google Font link tag in iframe document
  const injectGoogleFont = (doc: Document, name: string) => {
    if (!doc || !name) return;
    const existing = doc.getElementById('cb8-google-font');
    if (existing) {
      if ((existing as any).dataset.font === name) return;
      existing.remove();
    }
    const link = doc.createElement('link');
    link.id = 'cb8-google-font';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${name.trim().replace(/ /g, '+')}&display=swap`;
    (link as any).dataset.font = name;
    (doc.head || doc.documentElement)?.appendChild(link);
  };

  // Preload google font on host document so it loads immediately
  const preloadGoogleFont = (name: string) => {
    if (!name) return;
    const id = 'cb8-gf-preload';
    const existing = document.getElementById(id);
    if ((existing as any)?.dataset.font === name) return;
    existing?.remove();

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${name.trim().replace(/ /g, '+')}&display=swap`;
    (link as any).dataset.font = name;
    document.head.appendChild(link);
  };

  // Preload font if set on load
  useEffect(() => {
    if (epubPrefs.googleFont) {
      preloadGoogleFont(epubPrefs.googleFont);
    }
  }, [epubPrefs.googleFont]);

  // Re-apply theme whenever variables change
  useEffect(() => {
    applyThemeColors();
  }, [applyThemeColors]);

  // 3. Load Book & Render
  useEffect(() => {
    if (!libsLoaded || !containerRef.current) return;

    let localBook: any = null;
    let localRendition: any = null;

    async function loadBook() {
      try {
        setBookLoading(true);
        const fileUrl = api.fileUrl(record.id);
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching book`);
        const arrayBuffer = await resp.arrayBuffer();

        const windowEPub = (window as any).ePub;
        if (!windowEPub) throw new Error('EpubJS not loaded');

        localBook = windowEPub(arrayBuffer);
        setBook(localBook);

        // Fetch TOC
        localBook.loaded.navigation.then((nav: any) => {
          setChapters(nav.toc || []);
        });

        // Initialize rendition
        localRendition = localBook.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          spread: epubPrefs.spread ? 'auto' : 'none',
          flow: 'paginated',
        });
        setRendition(localRendition);

        // Setup themes
        const ff = effectiveFontFamily();
        try {
          localRendition.themes.default(buildEpubTheme(epubPrefs.themeMode, ff));
        } catch {}
        try {
          localRendition.themes.font(ff);
        } catch {}
        try {
          localRendition.themes.fontSize(toEpubFontSizePercent(epubPrefs.fontSize));
        } catch {}

        // Keyboard handler
        const onKey = (e: KeyboardEvent) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          if (e.key === 'ArrowRight' || e.key === ' ') {
            e.preventDefault();
            localRendition.next();
          } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
            e.preventDefault();
            localRendition.prev();
          }
        };

        // Relocated state listener
        localRendition.on('relocated', (location: any) => {
          if (!location?.start) return;
          const pct = Math.round((location.start.percentage ?? 0) * 100);
          setCurrentPercent(pct);
          if (location.start.cfi) {
            api.updateLocation(record.id, location.start.cfi).catch(() => {});
          }
        });

        // Rendered view listener
        localRendition.on('rendered', (_section: any, view: any) => {
          try {
            const fontF = effectiveFontFamily();
            if (view?.contents) {
              if (epubPrefs.googleFont) {
                injectGoogleFont(view.contents.document, epubPrefs.googleFont);
              }
              forceThemeOnContent(view.contents, epubPrefs.themeMode, fontF);
            }
            if (view?.iframe) {
              view.iframe.style.setProperty(
                'background-color',
                getThemeColors(epubPrefs.themeMode).background,
                'important'
              );
            }
          } catch {}

          // Key/tap/swipe overrides inside the iframe
          try {
            const iframeDoc = view?.document || view?.contents?.document;
            if (!iframeDoc) return;
            iframeDoc.addEventListener('keydown', onKey);

            // Tap margins inside iframe to turn pages
            iframeDoc.addEventListener('click', (e: MouseEvent) => {
              if (!localRendition) return;
              const w = iframeDoc.documentElement?.clientWidth || iframeDoc.body?.clientWidth || 0;
              if (!w) return;
              const x = e.clientX;
              const third = w / 3;
              if (x < third) {
                localRendition.prev();
              } else if (x > third * 2) {
                localRendition.next();
              }
            });

            // Swipe inside iframe
            let sx = 0;
            iframeDoc.addEventListener('touchstart', (e: TouchEvent) => {
              sx = e.touches[0].clientX;
            }, { passive: true });
            iframeDoc.addEventListener('touchend', (e: TouchEvent) => {
              if (!localRendition) return;
              const dx = e.changedTouches[0].clientX - sx;
              if (Math.abs(dx) > 50) {
                if (dx < 0) localRendition.next();
                else localRendition.prev();
              }
            }, { passive: true });
          } catch {}
        });

        // Attach keys on parent window
        document.addEventListener('keydown', onKey);
        (localRendition as any)._onKey = onKey;

        // Display book starting CFI
        const startCfi = initialLocation || record.lastLocation || undefined;
        try {
          await localRendition.display(startCfi);
          if (startCfi) {
            toast.success('Resuming from saved position');
          }
        } catch {
          await localRendition.display();
        }

        setBookLoading(false);
      } catch (err: any) {
        toast.error(err.message || 'Failed to render EPUB.');
        setBookLoading(false);
      }
    }

    loadBook();

    return () => {
      if (localRendition) {
        if (localRendition._onKey) {
          document.removeEventListener('keydown', localRendition._onKey);
        }
        localRendition.destroy();
      }
    };
  }, [libsLoaded, record.id, initialLocation]);

  // 4. Handle resizing
  useEffect(() => {
    if (!rendition) return;
    const handleResize = () => {
      rendition.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rendition]);

  // 5. Navigate chapter
  const handleChapterClick = (href: string) => {
    if (rendition) {
      rendition.display(href);
      setChaptersOpen(false);
    }
  };

  // Sync toolbar action buttons
  useEffect(() => {
    if (!setExtraControls) return;

    setExtraControls(
      <div className="flex items-center gap-1.5">
        {/* Chapters Drawer Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setChaptersOpen(true)}
          title="Chapters Table of Contents"
          className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          <List className="h-4.5 w-4.5" />
        </Button>

        {/* Display Settings Sheet Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          title="Reader Display Settings"
          className="h-9 w-9 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
        >
          <Settings className="h-4.5 w-4.5" />
        </Button>
      </div>
    );
  }, [setExtraControls]);

  // Log history opened/closed
  useEffect(() => {
    api.logHistory(record.id, 'opened', null).catch(() => {});
    return () => {
      api.logHistory(record.id, 'closed', null).catch(() => {});
    };
  }, [record.id]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 gap-3">
        <p className="text-sm font-semibold text-red-500">{loadError}</p>
      </div>
    );
  }

  if (bookLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 select-none">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading digital book...</span>
      </div>
    );
  }

  const colors = getThemeColors(epubPrefs.themeMode);

  return (
    <div
      style={{ backgroundColor: colors.background }}
      className="w-full h-full relative overflow-hidden flex flex-col pt-13"
    >
      {/* Table of Contents Overlay */}
      <div
        ref={containerRef}
        id="epub-container"
        className="flex-1 w-full h-full relative"
        style={{ backgroundColor: colors.background }}
      />

      {/* Overlay Nav third zones */}
      <div className="absolute inset-y-13 inset-x-0 flex pointer-events-none z-10">
        <div
          onClick={() => rendition?.prev()}
          className="w-[33%] pointer-events-auto cursor-w-resize"
        />
        <div className="flex-1 pointer-events-none" />
        <div
          onClick={() => rendition?.next()}
          className="w-[33%] pointer-events-auto cursor-e-resize"
        />
      </div>

      {/* Chapters TOC Sheet */}
      <Sheet open={chaptersOpen} onOpenChange={setChaptersOpen}>
        <SheetContent side="left" className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-sm">
          <SheetHeader className="pb-4 border-b border-zinc-800">
            <SheetTitle className="text-zinc-100 text-left font-bold uppercase tracking-wider text-sm">
              Table of Contents
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto mt-4 space-y-1 pr-2 no-scrollbar">
            {chapters.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-4 text-center">No chapters found.</p>
            ) : (
              chapters.map((ch, index) => (
                <button
                  key={index}
                  onClick={() => handleChapterClick(ch.href)}
                  className="w-full text-left px-3 py-2.5 rounded text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 transition-colors truncate"
                >
                  {ch.label?.trim() || `Chapter ${index + 1}`}
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Display Settings Sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-sm">
          <SheetHeader className="pb-4 border-b border-zinc-800">
            <SheetTitle className="text-zinc-100 text-left font-bold uppercase tracking-wider text-sm">
              Display Preferences
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-6 mt-6">
            {/* Theme selection */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Reading Theme
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant={epubPrefs.themeMode === 'white' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEpubPrefs({ themeMode: 'white' })}
                  className="flex-1 font-semibold"
                >
                  Light
                </Button>
                <Button
                  variant={epubPrefs.themeMode === 'black' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEpubPrefs({ themeMode: 'black' })}
                  className="flex-1 font-semibold"
                >
                  Dark
                </Button>
              </div>
            </div>

            {/* Font Family selector */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Font Style
              </Label>
              <Select
                value={epubPrefs.fontFamily}
                onValueChange={(val) => setEpubPrefs({ fontFamily: val })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9">
                  <SelectValue placeholder="Choose Font" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  {FONT_FAMILIES.map((f: any) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Font Size selector */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Font Size
              </Label>
              <Select
                value={String(epubPrefs.fontSize)}
                onValueChange={(val) => setEpubPrefs({ fontSize: Number(val) })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 h-9">
                  <SelectValue placeholder="Choose Size" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  {FONT_SIZES.map((s: any) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Google Font selector */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Google Web Font
              </Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="e.g. EB Garamond"
                  value={localGoogleFont}
                  onChange={(e) => setLocalGoogleFont(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-9 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEpubPrefs({ googleFont: localGoogleFont.trim() });
                    preloadGoogleFont(localGoogleFont.trim());
                    toast.success(`Applied google font: ${localGoogleFont}`);
                  }}
                  className="h-9 font-semibold text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>

            {/* Spread mode toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Double Page Mode
                </Label>
                <span className="text-[10px] text-zinc-500">Enable 2-page columns in landscape</span>
              </div>
              <Switch
                checked={epubPrefs.spread}
                onCheckedChange={(checked) => {
                  setEpubPrefs({ spread: checked });
                  if (rendition) {
                    rendition.spread(checked ? 'auto' : 'none');
                  }
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Percent HUD status bar */}
      <footer className="absolute bottom-4 left-4 z-40 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded text-[10px] font-semibold font-mono text-zinc-400 pointer-events-none select-none">
        {currentPercent}% Read
      </footer>
    </div>
  );
}
