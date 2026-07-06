import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../../core/immersive_reading.dart';
import '../../../core/window_control.dart';
import '../../../data/local_files.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../comic/reading_mode.dart';
import '../progress_saver.dart';
import '../reader_keyboard.dart';
import '../widgets/reader_widgets.dart';

/// PDF reader built on pdfrx's native [PdfViewer] — renders the document as
/// crisp vectors (re-rasterized per zoom level), and streams large PDFs without
/// the memory/concurrency problems of rasterizing every page to an image.
///
/// The three reading modes map onto pdfrx's custom-layout API:
///  - scroll      → continuous vertical (pdfrx's native mode)
///  - single      → pages laid out horizontally, one per "screen", tap to page
///  - doublePage  → pages laid out horizontally in pairs (two-page spread)
///
/// Pinch-zoom is built in. Tap zones (left/right thirds) turn pages in the paged
/// modes; the centre toggles the chrome.
class PdfReaderScreen extends ConsumerStatefulWidget {
  /// Creates a PDF reader for [comic].
  const PdfReaderScreen({super.key, required this.comic});

  /// The PDF to open.
  final ComicSummary comic;

  @override
  ConsumerState<PdfReaderScreen> createState() => _PdfReaderScreenState();
}

class _PdfReaderScreenState extends ConsumerState<PdfReaderScreen> {
  final PdfViewerController _controller = PdfViewerController();
  final ProgressSaver _progress = ProgressSaver();
  String? _path;
  String? _error;
  int _page = 0; // 0-based current page
  int _pageCount = 0;
  bool _chrome = true;

  @override
  void initState() {
    super.initState();
    _page = widget.comic.lastPage ?? 0;
    _pageCount = widget.comic.pageCount;
    _resolve();
  }

  @override
  void dispose() {
    _progress.flush(); // persist the final position before leaving
    restoreSystemChrome(); // bring the system bars back when leaving the reader
    super.dispose();
  }

  Future<void> _resolve() async {
    final uri = widget.comic.sourceUri;
    if (uri == null) {
      setState(() => _error = 'Could not open this PDF.');
      return;
    }
    final abs = await resolveLibraryPath(uri);
    if (mounted) setState(() => _path = abs);
  }

  /// Flip the in-app chrome and match the system bars: hidden chrome goes
  /// full-bleed (immersive) on mobile, shown chrome restores the bars.
  void _toggleChrome() {
    setState(() => _chrome = !_chrome);
    setReaderImmersion(chromeVisible: _chrome);
  }

  void _saveProgress(int page) {
    final completed = _pageCount > 0 && page >= _pageCount - 1;
    // Explicit bool so paging back from the last page clears `completed` and the
    // book returns to Continue Reading (a `true`-or-null write could never undo it).
    // Debounced: capture the source now, write after the flipping settles.
    final source = ref.read(activeSourceProvider);
    _progress.schedule(
      () => source.setProgress(widget.comic.id, page: page, completed: completed),
    );
  }

  /// Lay pages out for the active reading mode. Returns one rect per page (in
  /// page order) plus the overall document size.
  PdfPageLayout _layout(ReadingMode mode, List<PdfPage> pages, PdfViewerParams params) {
    final m = params.margin;
    switch (mode) {
      case ReadingMode.scroll:
        // Continuous vertical (pdfrx's default).
        final width = pages.fold(0.0, (w, p) => math.max(w, p.width)) + m * 2;
        final rects = <Rect>[];
        var y = m;
        for (final p in pages) {
          rects.add(Rect.fromLTWH((width - p.width) / 2, y, p.width, p.height));
          y += p.height + m;
        }
        return PdfPageLayout(pageLayouts: rects, documentSize: Size(width, y));

      case ReadingMode.single:
        // Pages side by side horizontally; one fills the view, swipe/tap to page.
        final height = pages.fold(0.0, (h, p) => math.max(h, p.height)) + m * 2;
        final rects = <Rect>[];
        var x = m;
        for (final p in pages) {
          rects.add(Rect.fromLTWH(x, (height - p.height) / 2, p.width, p.height));
          x += p.width + m;
        }
        return PdfPageLayout(pageLayouts: rects, documentSize: Size(x, height));

      case ReadingMode.doublePage:
        // Pairs of pages laid out horizontally, larger gap between spreads.
        final height = pages.fold(0.0, (h, p) => math.max(h, p.height)) + m * 2;
        final rects = List<Rect>.filled(pages.length, Rect.zero, growable: false);
        var x = m;
        for (var i = 0; i < pages.length; i += 2) {
          final left = pages[i];
          rects[i] = Rect.fromLTWH(x, (height - left.height) / 2, left.width, left.height);
          var nx = x + left.width;
          if (i + 1 < pages.length) {
            final right = pages[i + 1];
            nx += m;
            rects[i + 1] = Rect.fromLTWH(nx, (height - right.height) / 2, right.width, right.height);
            nx += right.width;
          }
          x = nx + m * 4;
        }
        return PdfPageLayout(pageLayouts: rects, documentSize: Size(x, height));
    }
  }

  void _turn(ReadingMode mode, {required bool forward}) {
    final step = mode == ReadingMode.doublePage ? 2 : 1;
    final cur = _controller.isReady ? (_controller.pageNumber ?? _page + 1) : _page + 1;
    final maxPage = _pageCount > 0 ? _pageCount : cur;
    final target = forward ? cur + step : cur - step;
    if (target < 1 || target > maxPage) return;
    HapticFeedback.selectionClick(); // subtle tick on a page turn (mobile)
    _showPage(target - 1, mode);
  }

  void _jumpTo(int page) => _showPage(page, ref.read(readingModeProvider));

  /// Navigate so the [page0] (0-based) page is shown. In double-page mode this
  /// fits the whole *spread* (the pair containing [page0]) so it stays centred.
  /// Fitting a single page (`PdfPageAnchor.all`) instead would leave the spread
  /// off-centre — shifted by whichever page of the pair you were on, which is
  /// why it looked uncentered after switching from single-page mode.
  void _showPage(int page0, ReadingMode mode) {
    if (!_controller.isReady) return;
    final count = _pageCount > 0 ? _pageCount : page0 + 1;
    final clamped = page0.clamp(0, count - 1);
    if (mode == ReadingMode.doublePage) {
      final rects = _controller.layout.pageLayouts;
      final left = (clamped ~/ 2) * 2; // left page of the pair (0-based)
      if (left < rects.length) {
        var area = rects[left];
        if (left + 1 < rects.length) area = area.expandToInclude(rects[left + 1]);
        _controller.goToArea(rect: area, anchor: PdfPageAnchor.all);
        return;
      }
    }
    _controller.goToPage(pageNumber: clamped + 1, anchor: PdfPageAnchor.all);
  }

  void _zoomIn() => _zoomBy(1.3);

  void _zoomOut() => _zoomBy(1 / 1.3);

  /// Multiplicative zoom centred on the viewport. Direct (not zoom-stop based)
  /// so it's predictable over the custom page layout.
  void _zoomBy(double factor) {
    if (!_controller.isReady) return;
    // Zoom about the current view centre using the same public path the built-in
    // zoom-stop methods use. (zoomOnLocalPosition recomputes the centre via
    // globalToDocument(localToGlobal(..)!)! and silently no-ops if either is
    // null — which it was over this huge multi-page horizontal layout.)
    final target =
        (_controller.currentZoom * factor).clamp(_controller.minScale, _controller.maxScale);
    _controller.setZoom(_controller.centerPosition, target);
  }

  /// Reset zoom by re-fitting the current page to the viewport.
  void _zoomReset() {
    if (!_controller.isReady) return;
    _showPage((_controller.pageNumber ?? _page + 1) - 1, ref.read(readingModeProvider));
  }

  /// Cmd/Ctrl + mouse-wheel zooms (matches the trackpad pinch).
  void _onPointerSignal(PointerSignalEvent event) {
    if (event is! PointerScrollEvent) return;
    final keyboard = HardwareKeyboard.instance;
    if (!keyboard.isMetaPressed && !keyboard.isControlPressed) return;
    if (event.scrollDelta.dy < 0) {
      _zoomIn();
    } else if (event.scrollDelta.dy > 0) {
      _zoomOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(readingModeProvider);
    final path = _path;
    return Scaffold(
      backgroundColor: Colors.black,
      body: ReaderKeyboard(
        onNext: () => _turn(mode, forward: true),
        onPrev: () => _turn(mode, forward: false),
        onFirst: () => _jumpTo(0),
        onLast: () => _jumpTo(_pageCount > 0 ? _pageCount - 1 : 0),
        onZoomIn: _zoomIn,
        onZoomOut: _zoomOut,
        onZoomReset: _zoomReset,
        onToggleFullscreen: WindowControl.toggleFullscreen,
        child: Listener(
        onPointerSignal: _onPointerSignal,
        child: Stack(
        children: [
          if (_error != null)
            ReaderMessage(message: _error!)
          else if (path == null)
            const Center(child: CircularProgressIndicator())
          else ...[
            PdfViewer.file(
              path,
              // Remount on mode change so the new page layout takes effect.
              key: ValueKey(mode),
              controller: _controller,
              initialPageNumber: (_page + 1).clamp(1, 1 << 30),
              params: PdfViewerParams(
                backgroundColor: Colors.black,
                margin: 8,
                panAxis: PanAxis.free,
                // Fit the whole page to the viewport on navigation (and on first
                // open) — the default `.top` anchor preserves zoom, which left
                // pages blown up far past the viewport width.
                pageAnchor: PdfPageAnchor.all,
                layoutPages: (pages, params) => _layout(mode, pages, params),
                onViewerReady: (document, controller) {
                  if (mounted) setState(() => _pageCount = document.pages.length);
                  // The viewer's own initial goToPage runs before the viewport is
                  // measured, so the resume page can open zoomed-in past fit.
                  // Re-fit once a frame after ready, when sizing is settled — and
                  // in double-page mode this centres the whole spread.
                  WidgetsBinding.instance.addPostFrameCallback((_) => _showPage(_page, mode));
                },
                onPageChanged: (pageNumber) {
                  if (pageNumber == null) return;
                  final p = pageNumber - 1;
                  if (p != _page) {
                    _page = p;
                    _saveProgress(p);
                    if (mounted) setState(() {});
                  }
                },
              ),
            ),
            // Tap layer ABOVE the viewer: captures taps (turn page / toggle
            // chrome) while pan/zoom drags fall through to the viewer below.
            // Paged modes split into left/right turn zones (with a click cursor
            // on desktop) and a centre zone that toggles the chrome.
            Positioned.fill(
              child: mode == ReadingMode.scroll
                  ? GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onTapUp: (_) => _toggleChrome(),
                    )
                  : Row(
                      children: [
                        Expanded(
                          child: _TapZone(
                            cursor: SystemMouseCursors.click,
                            onTap: () => _turn(mode, forward: false),
                          ),
                        ),
                        Expanded(
                          child: _TapZone(
                            onTap: _toggleChrome,
                          ),
                        ),
                        Expanded(
                          child: _TapZone(
                            cursor: SystemMouseCursors.click,
                            onTap: () => _turn(mode, forward: true),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
          if (_chrome) ReaderTopBar(title: widget.comic.title, mode: mode),
          if (_chrome && path != null)
            ReaderBottomBar(page: _page, count: _pageCount, onSeek: _jumpTo),
        ],
        ),
        ),
      ),
    );
  }

}

/// A translucent tap target with an optional desktop hover cursor. Taps fall
/// through to the viewer below (so pan/zoom still work) while turning the page
/// or toggling the chrome on a clean tap-up.
class _TapZone extends StatelessWidget {
  const _TapZone({required this.onTap, this.cursor = MouseCursor.defer});

  final VoidCallback onTap;
  final MouseCursor cursor;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: cursor,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTapUp: (_) => onTap(),
      ),
    );
  }
}

