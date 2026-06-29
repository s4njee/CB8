import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_epub_viewer/flutter_epub_viewer.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/local_files.dart';
import '../../../data/models/comic_summary.dart';
import '../../../core/window_control.dart';
import '../../../data/repositories/providers.dart';
import '../comic/reading_mode.dart';
import '../reader_keyboard.dart';
import '../widgets/reader_widgets.dart';

/// Reader-selectable font families, injected into the epub.js content as a
/// `font-family` theme override. The CSS lists web-safe fallbacks so the book
/// renders consistently across iOS/Android/macOS WebViews.
enum EpubFont {
  /// Sans-serif family (default).
  sansSerif('Sans Serif', 'Helvetica, Arial, sans-serif'),

  /// Serif family.
  serif('Serif', 'Georgia, "Times New Roman", serif'),

  /// Monospace family.
  mono('Monospace', 'Menlo, Consolas, monospace');

  const EpubFont(this.label, this.css);

  /// Menu label for the font.
  final String label;

  /// CSS `font-family` value injected into the epub.js content.
  final String css;
}

/// Page color scheme for the EPUB reader, injected as a `background`/`color`
/// theme override into the epub.js content (and mirrored onto the scaffold so
/// the letterboxing around the page matches).
enum EpubReaderTheme {
  /// Dark — light text on a near-black page (default).
  dark('Dark', Icons.dark_mode, 0xFF121212, 0xFFFFFFFF),

  /// Light — black text on white.
  light('Light', Icons.light_mode, 0xFFFFFFFF, 0xFF000000),

  /// Sepia — warm paper tone with brown ink, easier on the eyes at night.
  sepia('Sepia', Icons.local_cafe, 0xFFF4ECD8, 0xFF5B4636);

  const EpubReaderTheme(this.label, this.icon, this._bg, this._fg);

  /// Menu label.
  final String label;

  /// Menu icon.
  final IconData icon;

  final int _bg;
  final int _fg;

  /// Page background color.
  Color get background => Color(_bg);

  /// Text color.
  Color get foreground => Color(_fg);

  /// CSS hex (`#rrggbb`) for the page background.
  String get bgCss => '#${(_bg & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

  /// CSS hex (`#rrggbb`) for the text color.
  String get fgCss => '#${(_fg & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
}

/// Reflowable EPUB reader — port of CB8's `EpubReader`, which used epub.js.
/// `flutter_epub_viewer` runs the same epub.js engine in a WebView, so we get
/// paginated reflow, font-size/family control, light/dark theming, and CFI
/// locations that map directly onto our `lastLocation` column for resume.
class EpubReaderScreen extends ConsumerStatefulWidget {
  /// Creates an EPUB reader for [comic].
  const EpubReaderScreen({super.key, required this.comic});

  /// The book to open.
  final ComicSummary comic;

  @override
  ConsumerState<EpubReaderScreen> createState() => _EpubReaderScreenState();
}

class _EpubReaderScreenState extends ConsumerState<EpubReaderScreen> {
  final EpubController _controller = EpubController();
  String? _path;
  String? _error;
  double _progress = 0; // 0..1
  double _fontSize = 16; // px
  EpubFont _fontFamily = EpubFont.sansSerif;
  EpubReaderTheme _theme = EpubReaderTheme.dark;

  // Latest non-empty text selection, surfaced as a "Look up" bar (dictionary).
  String _selectedText = '';
  // Latest reading position (epub.js CFI). The package's live setFlow/setSpread
  // are broken — they interpolate the enum, sending JS "EpubFlow.scrolled" rather
  // than "scrolled" — so a mode change instead remounts EpubViewer with fresh
  // displaySettings (which serialize correctly), resuming from this CFI.
  String? _currentCfi;

  // --- macOS WKWebView EPUB workaround ----------------------------------
  // flutter_epub_viewer's swipe.html pulls epub.js + jszip via sibling-dir
  // <script src="../dist/..."> tags. On macOS, WKWebView's read-access scope
  // blocks those sub-resources, so `ePub`/`JSZip` are never defined and the page
  // stays blank (`book.open` throws). Same-dir epubView.js does load, and the
  // JS→Flutter bridge works — so on macOS we inject the two libs from the bundled
  // package assets, recreate the `book`, and call the package's `readyToLoad`
  // handler ourselves. iOS loads the scripts natively, so none of this runs.
  bool _loaded = false;
  bool _injecting = false;
  Timer? _readyKick;
  ReadingMode? _kickArmedFor;

  // epub.js reports `relocated.progress` as 0.0 until its locations index finishes
  // generating (signalled by onLocationLoaded). Persisting that early-zero would
  // reset the saved page on every open, so progress writes are gated on this flag.
  // It re-arms on a mode change, which remounts the viewer and regenerates locations.
  bool _locationsReady = false;
  ReadingMode? _locationsModeKey;

  // Set while the screen is being popped. Tearing down the viewer can fire a
  // final `relocated` at the book start; persisting it would clobber the saved
  // position with page 1 (the iOS twin of the web reader's Back-button bug).
  bool _disposing = false;

  // Resume safety net. epub.js renders nothing (a blank/black page) if the saved
  // resume CFI is stale or invalid — `display(cfi)` just rejects, and no
  // `relocated` ever fires. If the book loads but we never see a relocate, fall
  // back to the first page so the reader is never stuck on black.
  Timer? _resumeWatchdog;
  bool _sawRelocate = false;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void dispose() {
    _disposing = true; // ignore any teardown relocate so it can't clobber progress
    _resumeWatchdog?.cancel();
    _readyKick?.cancel();
    super.dispose();
  }

  /// Poll until the WebView controller exists, then make sure epub.js is present
  /// and the book gets loaded. Stops once the book reports loaded.
  void _scheduleReadyKick() {
    _readyKick?.cancel();
    var attempts = 0;
    _readyKick = Timer.periodic(const Duration(milliseconds: 600), (timer) {
      if (!mounted || _loaded || attempts >= 12) {
        timer.cancel();
        return;
      }
      attempts++;
      final wv = _controller.webViewController;
      if (wv != null) _ensureEpubLoaded(wv);
    });
  }

  /// On macOS, inject epub.js + jszip (blocked as sub-resources) and trigger the
  /// package's loader. Runs at most once per WebView; idempotent on retries.
  Future<void> _ensureEpubLoaded(dynamic wv) async {
    if (_injecting || _loaded) return;
    final hasEpub = await wv.evaluateJavascript(source: 'typeof ePub');
    if (_loaded) return;
    if (hasEpub != 'function') {
      _injecting = true;
      try {
        const dist = 'packages/flutter_epub_viewer/lib/assets/webpage/dist';
        final jszip = await rootBundle.loadString('$dist/jszip.min.js');
        final epubjs = await rootBundle.loadString('$dist/epub.js');
        await wv.evaluateJavascript(source: jszip);
        await wv.evaluateJavascript(source: epubjs);
        // Recreate the top-level `book` (=== window.book in a classic script)
        // now that ePub() is callable.
        await wv.evaluateJavascript(source: 'window.book = ePub();');
      } finally {
        _injecting = false;
      }
    }
    // Drive the package's readyToLoad → loadBook() chain ourselves (the native
    // flutterInAppWebViewPlatformReady event never reaches its listener here).
    await wv.evaluateJavascript(
      source: 'if(!window.__cb8_kick){window.__cb8_kick=1;'
          "window.flutter_inappwebview.callHandler('readyToLoad');}",
    );
  }

  /// Map a reading mode onto epub.js flow + spread.
  static ({EpubFlow flow, EpubSpread spread}) _settingsFor(ReadingMode mode) => switch (mode) {
        ReadingMode.scroll => (flow: EpubFlow.scrolled, spread: EpubSpread.none),
        ReadingMode.single => (flow: EpubFlow.paginated, spread: EpubSpread.none),
        ReadingMode.doublePage => (flow: EpubFlow.paginated, spread: EpubSpread.always),
      };

  Future<void> _resolve() async {
    final uri = widget.comic.sourceUri;
    if (uri == null) {
      setState(() => _error = 'Could not open this book.');
      return;
    }
    final abs = await resolveLibraryPath(uri);
    if (mounted) setState(() => _path = abs);
  }

  /// Arm the resume safety net once the book has loaded: if no `relocated` event
  /// arrives shortly, the saved CFI failed to display, so render the first page.
  void _armResumeWatchdog() {
    _resumeWatchdog?.cancel();
    if (_sawRelocate) return;
    _resumeWatchdog = Timer(const Duration(seconds: 5), () {
      if (!mounted || _sawRelocate || _disposing) return;
      // No CFI → epub.js displays the book's first section.
      _controller.webViewController
          ?.evaluateJavascript(source: 'if(window.rendition){rendition.display();}');
    });
  }

  void _onRelocated(EpubLocation location) {
    if (_disposing) return; // teardown relocate (often page 1) — never persist it
    _sawRelocate = true;
    _resumeWatchdog?.cancel(); // a real relocate arrived — resume succeeded
    _currentCfi = location.startCfi; // exact resume point; the CFI is always valid
    // Until epub.js has generated its locations index, `location.progress` is 0.0
    // even mid-book (e.g. the relocate fired while resuming into a saved CFI).
    // Writing that back would reset the catalog's page/percentage to the start on
    // every open, so until locations are ready we persist only the CFI and leave
    // the page untouched. _onLocationLoaded backfills a real page once ready.
    if (_locationsReady) {
      _progress = location.progress.clamp(0, 1);
      _persistProgress();
    } else {
      ref.read(activeSourceProvider).setProgress(
            widget.comic.id,
            location: location.startCfi,
          );
    }
    if (mounted) setState(() {});
  }

  /// Fires once epub.js has generated its locations index — the point after which
  /// `relocated` carries a trustworthy `progress`. epub.js does not re-emit a
  /// relocate at this moment, so we read the current position's percentage straight
  /// from the saved CFI and persist a real page now. This fixes both the in-reader
  /// progress bar and the catalog progress when resuming a partially-read book.
  Future<void> _onLocationLoaded() async {
    _locationsReady = true;
    final wv = _controller.webViewController;
    final cfi = _currentCfi;
    if (wv == null || cfi == null || cfi.isEmpty) return;
    final raw = await wv.evaluateJavascript(
      source: "typeof book !== 'undefined' && book.locations ? "
          'book.locations.percentageFromCfi("$cfi") : null',
    );
    final pct = raw is num ? raw.toDouble() : double.tryParse('$raw');
    if (pct == null) return;
    _progress = pct.clamp(0, 1);
    _persistProgress();
    if (mounted) setState(() {});
  }

  /// Writes the current reading position (page + CFI, and `completed` at the end)
  /// to the active source. Page is derived from the reading fraction; denom keeps
  /// single-chapter books sane.
  void _persistProgress() {
    final pageCount = widget.comic.pageCount;
    final denom = pageCount > 1 ? pageCount - 1 : 1;
    final page = (_progress * denom).round();
    // Write an explicit bool (not `true`-or-null): paging back from the end must
    // be able to *clear* completed, otherwise a book that ever hit ~100% stays
    // completed forever and never returns to the Continue Reading shelf.
    ref.read(activeSourceProvider).setProgress(
          widget.comic.id,
          page: page,
          location: _currentCfi,
          completed: _progress >= 0.999,
        );
  }

  void _setFontSize(double size) {
    setState(() => _fontSize = size);
    _controller.setFontSize(fontSize: size);
  }

  void _setFontFamily(EpubFont font) {
    setState(() => _fontFamily = font);
    _applyReaderOverrides();
  }

  void _setTheme(EpubReaderTheme theme) {
    setState(() => _theme = theme);
    _applyReaderOverrides();
  }

  void _applyReaderOverrides() {
    final wv = _controller.webViewController;
    if (wv == null) return;
    wv.evaluateJavascript(
      source: "if(window.rendition&&rendition.themes){"
          "rendition.themes.override('font-family','${_fontFamily.css}',true);"
          "rendition.themes.override('background','${_theme.bgCss}',true);"
          "rendition.themes.override('color','${_theme.fgCss}',true);}",
    );
  }

  void _openTypographySheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141414),
      builder: (context) => _TypographySheet(
        fontSize: _fontSize,
        fontFamily: _fontFamily,
        theme: _theme,
        onFontSize: _setFontSize,
        onFontFamily: _setFontFamily,
        onTheme: _setTheme,
      ),
    );
  }

  /// Handle an epub.js text selection: remember the (trimmed) text so the
  /// "Look up" bar appears. Long passages aren't dictionary words, so cap it.
  void _onTextSelected(EpubTextSelection selection) {
    final text = selection.selectedText.trim();
    if (text.isEmpty || text.length > 60) return;
    if (text == _selectedText) return;
    setState(() => _selectedText = text);
  }

  void _dismissLookup() {
    if (_selectedText.isEmpty) return;
    setState(() => _selectedText = '');
    _controller.clearSelection();
  }

  void _openDictionary() {
    final term = _selectedText;
    if (term.isEmpty) return;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141414),
      isScrollControlled: true,
      builder: (context) => _DictionarySheet(term: term),
    );
    _dismissLookup();
  }

  /// A mode change remounts [EpubViewer] (via its `ValueKey(mode)`), which
  /// regenerates epub.js state from scratch. Re-arm the per-mount guards here,
  /// *during the build that swaps in the new viewer* so the resets land before
  /// the child mounts (deferring to a post-frame callback would let the new
  /// viewer's first relocate slip through and clobber progress):
  ///  - close the locations gate until onLocationLoaded re-fires, and
  ///  - on macOS, re-arm the ready-kick so the new WebView reloads the book.
  void _syncViewerForBuild(ReadingMode mode, String? path) {
    if (_locationsModeKey != mode) {
      _locationsModeKey = mode;
      _locationsReady = false;
    }
    if (Platform.isMacOS && path != null && _kickArmedFor != mode) {
      _kickArmedFor = mode;
      _loaded = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scheduleReadyKick());
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(readingModeProvider);
    final path = _path;
    // Resume from wherever we are now (or the saved location on first open) so a
    // mode switch — which remounts the viewer — doesn't lose the reader's place.
    final resumeCfi = _currentCfi ?? widget.comic.lastLocation;
    _syncViewerForBuild(mode, path);
    final settings = _settingsFor(mode);
    return Scaffold(
      backgroundColor: _theme.background,
      appBar: AppBar(
        backgroundColor: const Color(0xFF141414),
        foregroundColor: Colors.white,
        title: Text(widget.comic.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          ReadingModeMenu(mode: mode),
          IconButton(
            tooltip: 'Text size',
            icon: const Icon(Icons.text_fields),
            onPressed: path == null ? null : _openTypographySheet,
          ),
          if (Platform.isMacOS)
            IconButton(
              tooltip: 'Toggle fullscreen (f)',
              icon: const Icon(Icons.fullscreen),
              onPressed: WindowControl.toggleFullscreen,
            ),
        ],
      ),
      body: _error != null
          ? ReaderMessage(message: _error!)
          : path == null
              ? const Center(child: CircularProgressIndicator())
              : ReaderKeyboard(
                  onNext: () => _controller.next(),
                  onPrev: () => _controller.prev(),
                  // Zoom maps to text size for a reflowable book.
                  onZoomIn: () => _setFontSize((_fontSize + 2).clamp(12, 30)),
                  onZoomOut: () => _setFontSize((_fontSize - 2).clamp(12, 30)),
                  onZoomReset: () => _setFontSize(16),
                  onToggleFullscreen: WindowControl.toggleFullscreen,
                  child: Column(
                  children: [
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final viewer = EpubViewer(
                            // Remount on mode change so fresh displaySettings
                            // (flow/spread) actually take effect.
                            key: ValueKey(mode),
                            epubController: _controller,
                            epubSource: EpubSource.fromFile(File(path)),
                            initialCfi:
                                (resumeCfi != null && resumeCfi.isNotEmpty) ? resumeCfi : null,
                            displaySettings: EpubDisplaySettings(
                              fontSize: _fontSize.round(),
                              flow: settings.flow,
                              spread: settings.spread,
                              snap: true,
                              theme: EpubTheme.custom(
                                backgroundDecoration:
                                    BoxDecoration(color: _theme.background),
                                foregroundColor: _theme.foreground,
                              ),
                            ),
                            onTextSelected: _onTextSelected,
                            onDeselection: () {
                              if (_selectedText.isNotEmpty) {
                                setState(() => _selectedText = '');
                              }
                            },
                            onEpubLoaded: () {
                              _loaded = true;
                              _readyKick?.cancel();
                              _applyReaderOverrides();
                              _armResumeWatchdog();
                            },
                            onLocationLoaded: _onLocationLoaded,
                            onRelocated: _onRelocated,
                          );
                          // Tap-to-turn. The package only wires tap zones on
                          // Android, and on iOS the WebView's native text-
                          // selection layer wins the gesture arena and swallows
                          // the tap — surfacing a "translate" popup instead of
                          // turning the page. An *opaque* Flutter gesture layer on
                          // top consumes the touch before the platform view sees
                          // it, so the selection layer never fires and a tap in
                          // the left/right third reliably turns the page (works on
                          // real touches and the simulator's mouse alike). The
                          // middle third is a dead zone, leaving room for a future
                          // tap-to-toggle-chrome. Scroll mode keeps native drag
                          // scrolling, so it skips the overlay entirely.
                          if (mode == ReadingMode.scroll) return viewer;
                          final w = constraints.maxWidth;
                          return Stack(
                            children: [
                              Positioned.fill(child: viewer),
                              Positioned(
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: w / 3,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: _controller.prev,
                                ),
                              ),
                              Positioned(
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: w / 3,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: _controller.next,
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    if (_selectedText.isNotEmpty) _lookupBar(context),
                    _progressBar(context),
                  ],
                ),
                ),
    );
  }

  /// Slim bar shown while text is selected: tap to look the selection up in the
  /// dictionary, or dismiss it.
  Widget _lookupBar(BuildContext context) {
    return Material(
      color: const Color(0xFF1E1E1E),
      child: InkWell(
        onTap: _openDictionary,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.menu_book_outlined, color: Colors.white70, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Look up “$_selectedText”',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white54, size: 20),
                onPressed: _dismissLookup,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _progressBar(BuildContext context) {
    final percent = (_progress * 100).round();
    return Container(
      color: const Color(0xFF141414),
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 6,
        bottom: MediaQuery.paddingOf(context).bottom + 6,
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, color: Colors.white),
            onPressed: () => _controller.prev(),
          ),
          Expanded(
            child: LinearProgressIndicator(
              value: _progress,
              minHeight: 4,
              backgroundColor: Colors.white24,
              valueColor: AlwaysStoppedAnimation(Theme.of(context).colorScheme.primary),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right, color: Colors.white),
            onPressed: () => _controller.next(),
          ),
          SizedBox(
            width: 44,
            child: Text('$percent%',
                textAlign: TextAlign.right, style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet for EPUB typography: text size, font family, and page theme
/// (dark / light / sepia). Holds its own copy of each setting (seeded from the
/// reader) so the controls update instantly, and forwards every change to the
/// reader via the callbacks.
class _TypographySheet extends StatefulWidget {
  const _TypographySheet({
    required this.fontSize,
    required this.fontFamily,
    required this.theme,
    required this.onFontSize,
    required this.onFontFamily,
    required this.onTheme,
  });

  final double fontSize;
  final EpubFont fontFamily;
  final EpubReaderTheme theme;
  final ValueChanged<double> onFontSize;
  final ValueChanged<EpubFont> onFontFamily;
  final ValueChanged<EpubReaderTheme> onTheme;

  @override
  State<_TypographySheet> createState() => _TypographySheetState();
}

class _TypographySheetState extends State<_TypographySheet> {
  late double _fontSize = widget.fontSize;
  late EpubFont _fontFamily = widget.fontFamily;
  late EpubReaderTheme _theme = widget.theme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Text size', style: TextStyle(fontWeight: FontWeight.w600)),
          Row(
            children: [
              const Text('A', style: TextStyle(fontSize: 14)),
              Expanded(
                child: Slider(
                  value: _fontSize,
                  min: 12,
                  max: 30,
                  onChanged: (v) {
                    setState(() => _fontSize = v);
                    widget.onFontSize(v);
                  },
                ),
              ),
              const Text('A', style: TextStyle(fontSize: 24)),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Font', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final font in EpubFont.values)
                ChoiceChip(
                  label: Text(font.label),
                  selected: _fontFamily == font,
                  onSelected: (_) {
                    setState(() => _fontFamily = font);
                    widget.onFontFamily(font);
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Theme', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final theme in EpubReaderTheme.values)
                ChoiceChip(
                  avatar: Icon(theme.icon, size: 18),
                  label: Text(theme.label),
                  selected: _theme == theme,
                  onSelected: (_) {
                    setState(() => _theme = theme);
                    widget.onTheme(theme);
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One part-of-speech grouping of definitions, as returned by dictionaryapi.dev.
class _Meaning {
  _Meaning(this.partOfSpeech, this.definitions);
  final String partOfSpeech;
  final List<String> definitions;
}

/// Bottom sheet that looks [term] up in the free, key-less dictionaryapi.dev
/// dictionary and renders the part-of-speech groupings, with graceful loading /
/// not-found / offline states. Network-only and unauthenticated, so it never
/// touches the catalog or a CB8 server.
class _DictionarySheet extends StatefulWidget {
  const _DictionarySheet({required this.term});

  final String term;

  @override
  State<_DictionarySheet> createState() => _DictionarySheetState();
}

class _DictionarySheetState extends State<_DictionarySheet> {
  bool _loading = true;
  String? _phonetic;
  List<_Meaning> _meanings = [];
  String? _message;

  @override
  void initState() {
    super.initState();
    _lookup();
  }

  Future<void> _lookup() async {
    final word = widget.term.trim();
    try {
      final res = await Dio().get<dynamic>(
        'https://api.dictionaryapi.dev/api/v2/entries/en/${Uri.encodeComponent(word)}',
        options: Options(
          // A missing word returns 404 with a JSON body; treat that as "no
          // definition" rather than throwing.
          validateStatus: (s) => s != null && s < 500,
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      final data = res.data;
      if (res.statusCode != 200 || data is! List || data.isEmpty) {
        setState(() {
          _loading = false;
          _message = 'No dictionary entry for “$word”.';
        });
        return;
      }
      final meanings = <_Meaning>[];
      String? phonetic;
      for (final entry in data) {
        if (entry is! Map) continue;
        phonetic ??= (entry['phonetic'] as String?)?.trim();
        final rawMeanings = entry['meanings'];
        if (rawMeanings is! List) continue;
        for (final m in rawMeanings) {
          if (m is! Map) continue;
          final pos = (m['partOfSpeech'] as String?) ?? '';
          final defs = <String>[];
          final rawDefs = m['definitions'];
          if (rawDefs is List) {
            for (final d in rawDefs) {
              final text = d is Map ? d['definition'] as String? : null;
              if (text != null && text.trim().isNotEmpty) defs.add(text.trim());
              if (defs.length >= 3) break; // keep each grouping compact
            }
          }
          if (defs.isNotEmpty) meanings.add(_Meaning(pos, defs));
        }
      }
      setState(() {
        _loading = false;
        _phonetic = (phonetic != null && phonetic.isNotEmpty) ? phonetic : null;
        _meanings = meanings;
        if (meanings.isEmpty) _message = 'No definition found for “$word”.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _message = 'Could not reach the dictionary. Check your connection.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.6),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Flexible(
                    child: Text(
                      widget.term,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (_phonetic != null) ...[
                    const SizedBox(width: 10),
                    Text(_phonetic!, style: const TextStyle(color: Colors.white54, fontSize: 14)),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              Flexible(child: _content()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _content() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_message != null) {
      return Text(_message!, style: const TextStyle(color: Colors.white70));
    }
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final meaning in _meanings) ...[
            Text(
              meaning.partOfSpeech,
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontStyle: FontStyle.italic,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            for (var i = 0; i < meaning.definitions.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6, left: 4),
                child: Text('${i + 1}. ${meaning.definitions[i]}',
                    style: const TextStyle(color: Colors.white)),
              ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

