import 'dart:async';
import 'dart:io';

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

/// Reflowable EPUB reader — port of CB8's `EpubReader`, which used epub.js.
/// `flutter_epub_viewer` runs the same epub.js engine in a WebView, so we get
/// paginated reflow, font-size control, a dark theme, and CFI locations that map
/// directly onto our `lastLocation` column for resume.
class EpubReaderScreen extends ConsumerStatefulWidget {
  const EpubReaderScreen({super.key, required this.comic});

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

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  @override
  void dispose() {
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

  void _onRelocated(EpubLocation location) {
    _progress = location.progress.clamp(0, 1);
    _currentCfi = location.startCfi; // resume point if the mode (and viewer) changes
    final pageCount = widget.comic.pageCount;
    // Drive the catalog progress bar from the reading fraction; keep the CFI for
    // an exact resume. denom keeps single-chapter books sane.
    final denom = pageCount > 1 ? pageCount - 1 : 1;
    final page = (_progress * denom).round();
    ref.read(activeSourceProvider).setProgress(
          widget.comic.id,
          page: page,
          location: location.startCfi,
          completed: _progress >= 0.999 ? true : null,
        );
    if (mounted) setState(() {});
  }

  void _setFontSize(double size) {
    setState(() => _fontSize = size);
    _controller.setFontSize(fontSize: size);
  }

  void _openTypographySheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141414),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheet) {
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
                            setSheet(() {});
                            _setFontSize(v);
                          },
                        ),
                      ),
                      const Text('A', style: TextStyle(fontSize: 24)),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(readingModeProvider);
    final path = _path;
    // Resume from wherever we are now (or the saved location on first open) so a
    // mode switch — which remounts the viewer — doesn't lose the reader's place.
    final resumeCfi = _currentCfi ?? widget.comic.lastLocation;
    final settings = _settingsFor(mode);
    // The EpubViewer remounts on each mode change (ValueKey(mode)); on macOS,
    // re-arm the ready-kick for the new WebView so the book reloads.
    if (Platform.isMacOS && path != null && _kickArmedFor != mode) {
      _kickArmedFor = mode;
      _loaded = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scheduleReadyKick());
    }
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF141414),
        foregroundColor: Colors.white,
        title: Text(widget.comic.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          PopupMenuButton<ReadingMode>(
            tooltip: 'Reading mode',
            icon: Icon(mode.icon),
            onSelected: (m) => ref.read(readingModeProvider.notifier).set(m),
            itemBuilder: (context) => [
              for (final m in ReadingMode.values)
                CheckedPopupMenuItem(
                  value: m,
                  checked: m == mode,
                  child: Row(children: [Icon(m.icon, size: 18), const SizedBox(width: 10), Text(m.label)]),
                ),
            ],
          ),
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
          ? _EpubMessage(message: _error!)
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
                      child: EpubViewer(
                        // Remount on mode change so fresh displaySettings (flow/
                        // spread) actually take effect — the live setters don't.
                        key: ValueKey(mode),
                        epubController: _controller,
                        epubSource: EpubSource.fromFile(File(path)),
                        initialCfi: (resumeCfi != null && resumeCfi.isNotEmpty) ? resumeCfi : null,
                        displaySettings: EpubDisplaySettings(
                          fontSize: _fontSize.round(),
                          flow: settings.flow,
                          spread: settings.spread,
                          snap: true,
                          theme: EpubTheme.dark(),
                        ),
                        onEpubLoaded: () {
                          _loaded = true;
                          _readyKick?.cancel();
                          // macOS ignores the WebView's transparentBackground, so
                          // the dark Container behind it never shows — leaving the
                          // theme's white text on the WebView's white default.
                          // Force the dark background (EpubTheme.dark = #121212)
                          // into the content so the text is legible.
                          if (Platform.isMacOS) {
                            _controller.webViewController?.evaluateJavascript(
                              source: 'if(window.rendition&&rendition.themes){'
                                  "rendition.themes.override('background','#121212',true);"
                                  "rendition.themes.override('color','#ffffff',true);}",
                            );
                          }
                        },
                        onRelocated: _onRelocated,
                      ),
                    ),
                    _progressBar(context),
                  ],
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

class _EpubMessage extends StatelessWidget {
  const _EpubMessage({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message,
                textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: const Text('Back'),
            ),
          ],
        ),
      ),
    );
  }
}
