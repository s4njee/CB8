import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import '../../../core/window_control.dart';
import '../../../data/local_files.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../../../data/sources/remote_source.dart';
import '../reader_keyboard.dart';
import '../widgets/reader_widgets.dart';
import 'cbz_archive.dart';
import 'comic_page_source.dart';
import 'pdf_page_source.dart';
import 'reading_mode.dart';

/// Full-screen comic reader — port of CB8's `ComicReader`. Supports three layouts
/// (vertical scroll / single page / two-page spread) chosen via a toolbar menu
/// and persisted globally. Works against local archives or a remote page source.
class ComicReaderScreen extends ConsumerStatefulWidget {
  /// Creates a comic reader for [comic].
  const ComicReaderScreen({super.key, required this.comic});

  /// The comic to open (local CBZ/PDF or a remote page source).
  final ComicSummary comic;

  @override
  ConsumerState<ComicReaderScreen> createState() => _ComicReaderScreenState();
}

class _ComicReaderScreenState extends ConsumerState<ComicReaderScreen> {
  ComicPageSource? _source;
  String? _error;
  int _page = 0;
  bool _chrome = true;
  late ReadingMode _mode;
  late ReadingDirection _direction;
  late bool _coverFirst;

  // HD (Real-ESRGAN) upscaling — remote comics only. `_upscale` is read fresh on
  // every page-URL build, so toggling it re-requests pages with `?upscale=1`.
  late bool _upscale;
  bool _canUpscale = false;

  // Single/double use a PageController (over pages / over spreads); scroll uses
  // an ItemScrollController. The parent owns them so the slider can jump in any
  // mode, and so switching modes preserves the current page.
  PageController? _pageController;
  final ItemScrollController _scrollController = ItemScrollController();
  final ItemPositionsListener _positions = ItemPositionsListener.create();
  bool _scrollListening = false;

  int get _pageCount => _source?.pageCount ?? 0;

  // --- Two-page spread mapping (accounts for the cover-first offset) ----------
  // Without cover-first, spread s holds pages [2s, 2s+1]. With it, the first
  // page stands alone and the rest pair up: [0] [1 2] [3 4] …
  int _spreadOf(int page) => _coverFirst ? (page + 1) ~/ 2 : page ~/ 2;
  int _leftPageOf(int spread) =>
      _coverFirst ? (spread == 0 ? 0 : spread * 2 - 1) : spread * 2;
  int get _spreadCount {
    if (_pageCount == 0) return 0;
    return _coverFirst ? _pageCount ~/ 2 + 1 : (_pageCount + 1) ~/ 2;
  }

  @override
  void initState() {
    super.initState();
    _mode = ref.read(readingModeProvider);
    _direction = ref.read(readingDirectionProvider);
    _coverFirst = ref.read(coverFirstProvider);
    _upscale = ref.read(upscaleProvider);
    _load();
  }

  Future<void> _load() async {
    final comic = widget.comic;
    try {
      final ComicPageSource source;
      if (comic.sourceUri != null) {
        final path = await resolveLibraryPath(comic.sourceUri!);
        if (comic.extension == 'pdf') {
          source = await PdfPageSource.openFile(path);
        } else {
          source = LocalCbzPageSource(await CbzArchive.open(path));
        }
      } else {
        final active = ref.read(activeSourceProvider);
        if (active is! RemoteSource) {
          setState(() => _error = 'Could not open this comic.');
          return;
        }
        source = RemotePageSource(
          pageCount: comic.pageCount,
          // Reads `_upscale` per call, so toggling HD swaps every page URL.
          urlFor: (i) => active.pageUrl(comic.id, i, upscale: _upscale),
          headers: comic.imageHeaders,
        );
        _canUpscale = true;
      }
      final start = (comic.lastPage ?? 0).clamp(0, (source.pageCount - 1).clamp(0, 1 << 30));
      if (!mounted) return;
      setState(() {
        _source = source;
        _page = start;
      });
      _setupControllers();
    } catch (e) {
      if (mounted) setState(() => _error = 'Failed to open comic:\n$e');
    }
  }

  void _setupControllers() {
    switch (_mode) {
      case ReadingMode.single:
        _pageController = PageController(initialPage: _page);
      case ReadingMode.doublePage:
        _pageController = PageController(initialPage: _spreadOf(_page));
      case ReadingMode.scroll:
        if (!_scrollListening) {
          _positions.itemPositions.addListener(_onScrollPositions);
          _scrollListening = true;
        }
    }
  }

  // A direction or cover-first change keeps the same mode but re-homes the paged
  // controller on the current page (cover-first remaps page↔spread; RTL flips
  // the gallery's `reverse`, which is applied on rebuild).
  void _resetPagedController() {
    if (_mode == ReadingMode.scroll || _source == null) return;
    _pageController?.dispose();
    final initial = _mode == ReadingMode.doublePage ? _spreadOf(_page) : _page;
    _pageController = PageController(initialPage: initial);
  }

  void _changeMode(ReadingMode mode) {
    if (mode == _mode || _source == null) return;
    _pageController?.dispose();
    _pageController = null;
    if (_scrollListening) {
      _positions.itemPositions.removeListener(_onScrollPositions);
      _scrollListening = false;
    }
    setState(() => _mode = mode);
    _setupControllers();
  }

  void _onScrollPositions() {
    final positions = _positions.itemPositions.value;
    if (positions.isEmpty) return;
    // The lowest-index item that's still on screen is the "current" page.
    final top = positions
        .where((p) => p.itemTrailingEdge > 0)
        .map((p) => p.index)
        .fold<int?>(null, (min, i) => min == null || i < min ? i : min);
    if (top != null && top != _page) {
      setState(() => _page = top);
      _saveProgress(top);
    }
  }

  @override
  void dispose() {
    _pageController?.dispose();
    if (_scrollListening) _positions.itemPositions.removeListener(_onScrollPositions);
    _source?.dispose();
    super.dispose();
  }

  void _saveProgress(int page) {
    if (_source == null) return;
    final completed = page >= _pageCount - 1;
    // Explicit bool so paging back from the last page clears `completed` and the
    // book returns to Continue Reading (a `true`-or-null write could never undo it).
    ref.read(activeSourceProvider).setProgress(
          widget.comic.id,
          page: page,
          completed: completed,
        );
  }

  void _onPagedChanged(int controllerIndex) {
    final page =
        _mode == ReadingMode.doublePage ? _leftPageOf(controllerIndex) : controllerIndex;
    setState(() => _page = page);
    _saveProgress(page);
  }

  void _turn({required bool forward}) {
    final c = _pageController;
    if (c == null) return;
    final target = (c.page?.round() ?? 0) + (forward ? 1 : -1);
    final max = (_mode == ReadingMode.doublePage ? _spreadCount : _pageCount) - 1;
    if (target < 0 || target > max) return;
    c.animateToPage(target, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
  }

  void _handleTap(BuildContext context, TapUpDetails details) {
    final width = MediaQuery.sizeOf(context).width;
    final dx = details.globalPosition.dx;
    if (dx < width * 0.33) {
      // In RTL (manga) the left side advances; the right side goes back.
      _turn(forward: _direction.isRtl);
    } else if (dx > width * 0.67) {
      _turn(forward: !_direction.isRtl);
    } else {
      setState(() => _chrome = !_chrome);
    }
  }

  void _jumpToPage(int page) {
    setState(() => _page = page);
    switch (_mode) {
      case ReadingMode.single:
        _pageController?.jumpToPage(page);
      case ReadingMode.doublePage:
        _pageController?.jumpToPage(_spreadOf(page));
      case ReadingMode.scroll:
        if (_scrollController.isAttached) _scrollController.jumpTo(index: page);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ReadingMode>(readingModeProvider, (_, next) => _changeMode(next));
    // Re-render with new page URLs (?upscale=…) when the HD toggle flips.
    ref.listen<bool>(upscaleProvider, (_, next) {
      if (next != _upscale) setState(() => _upscale = next);
    });
    // Direction / cover-first re-home the paged controller on the current page.
    ref.listen<ReadingDirection>(readingDirectionProvider, (_, next) {
      if (next != _direction) {
        setState(() => _direction = next);
        _resetPagedController();
      }
    });
    ref.listen<bool>(coverFirstProvider, (_, next) {
      if (next != _coverFirst) {
        setState(() => _coverFirst = next);
        _resetPagedController();
      }
    });
    final source = _source;
    return Scaffold(
      backgroundColor: Colors.black,
      body: ReaderKeyboard(
        onNext: () => _turn(forward: true),
        onPrev: () => _turn(forward: false),
        onFirst: () => _jumpToPage(0),
        onLast: () => _jumpToPage(_pageCount > 0 ? _pageCount - 1 : 0),
        onToggleFullscreen: WindowControl.toggleFullscreen,
        child: Stack(
          children: [
            if (_error != null)
              ReaderMessage(message: _error!)
            else if (source == null)
              const Center(child: CircularProgressIndicator())
            else
              _body(source),
            if (_chrome)
              ReaderTopBar(
                title: widget.comic.title,
                mode: _mode,
                upscaleEnabled: _canUpscale ? _upscale : null,
                onToggleUpscale:
                    _canUpscale ? () => ref.read(upscaleProvider.notifier).toggle() : null,
                extraActions: [_layoutMenu()],
              ),
            if (_chrome && source != null)
              ReaderBottomBar(page: _page, count: _pageCount, onSeek: _jumpToPage),
          ],
        ),
      ),
    );
  }

  Widget _body(ComicPageSource source) {
    switch (_mode) {
      case ReadingMode.scroll:
        return GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => setState(() => _chrome = !_chrome),
          child: ScrollablePositionedList.builder(
            itemScrollController: _scrollController,
            itemPositionsListener: _positions,
            initialScrollIndex: _page,
            itemCount: source.pageCount,
            itemBuilder: (context, index) => Image(
              image: source.imageFor(index),
              fit: BoxFit.fitWidth,
              width: double.infinity,
              errorBuilder: (_, _, _) =>
                  const SizedBox(height: 200, child: _UndecodablePage()),
            ),
          ),
        );
      case ReadingMode.single:
        final controller = _pageController;
        if (controller == null) return const Center(child: CircularProgressIndicator());
        return PhotoViewGallery.builder(
          pageController: controller,
          itemCount: source.pageCount,
          reverse: _direction.isRtl,
          backgroundDecoration: const BoxDecoration(color: Colors.black),
          onPageChanged: _onPagedChanged,
          builder: (context, index) => PhotoViewGalleryPageOptions(
            imageProvider: source.imageFor(index),
            minScale: PhotoViewComputedScale.contained,
            initialScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 3,
            errorBuilder: (_, _, _) => const _UndecodablePage(),
            onTapUp: (ctx, details, _) => _handleTap(ctx, details),
          ),
        );
      case ReadingMode.doublePage:
        final controller = _pageController;
        if (controller == null) return const Center(child: CircularProgressIndicator());
        return PhotoViewGallery.builder(
          pageController: controller,
          itemCount: _spreadCount,
          reverse: _direction.isRtl,
          backgroundDecoration: const BoxDecoration(color: Colors.black),
          onPageChanged: _onPagedChanged,
          builder: (context, spread) {
            final left = _leftPageOf(spread);
            // Cover-first spread 0 is a single page; otherwise pair with the next.
            final isCover = _coverFirst && spread == 0;
            final right = isCover ? -1 : left + 1;
            final cells = <Widget>[
              Expanded(child: _spreadImage(source, left)),
              if (right >= 0 && right < source.pageCount)
                Expanded(child: _spreadImage(source, right)),
            ];
            return PhotoViewGalleryPageOptions.customChild(
              minScale: PhotoViewComputedScale.contained,
              initialScale: PhotoViewComputedScale.contained,
              maxScale: PhotoViewComputedScale.covered * 3,
              onTapUp: (ctx, details, _) => _handleTap(ctx, details),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                // RTL (manga): the lower-numbered page sits on the right.
                children: _direction.isRtl ? cells.reversed.toList() : cells,
              ),
            );
          },
        );
    }
  }

  Widget _spreadImage(ComicPageSource source, int index) => Image(
        image: source.imageFor(index),
        fit: BoxFit.contain,
        // A page that can't be decoded (e.g. AVIF/JXL on a platform without the
        // codec, or a corrupt entry) shows a placeholder instead of a crash box.
        errorBuilder: (_, _, _) => const _UndecodablePage(),
      );

  /// Overflow menu for the comic-specific layout toggles: reading direction
  /// (LTR / RTL-manga) and the cover-first offset for two-page mode.
  Widget _layoutMenu() {
    return PopupMenuButton<String>(
      tooltip: 'Layout',
      icon: const Icon(Icons.tune, color: Colors.white),
      onSelected: (choice) {
        switch (choice) {
          case 'rtl':
            ref.read(readingDirectionProvider.notifier).toggle();
          case 'cover':
            ref.read(coverFirstProvider.notifier).toggle();
        }
      },
      itemBuilder: (context) => [
        CheckedPopupMenuItem(
          value: 'rtl',
          checked: _direction.isRtl,
          child: const Row(
            children: [
              Icon(Icons.swap_horiz, size: 18),
              SizedBox(width: 10),
              Text('Right-to-left (manga)'),
            ],
          ),
        ),
        CheckedPopupMenuItem(
          value: 'cover',
          checked: _coverFirst,
          child: const Row(
            children: [
              Icon(Icons.book_outlined, size: 18),
              SizedBox(width: 10),
              Text('Cover page alone'),
            ],
          ),
        ),
      ],
    );
  }
}

/// Placeholder shown in place of a page image the platform can't decode.
class _UndecodablePage extends StatelessWidget {
  const _UndecodablePage();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.broken_image_outlined, color: Colors.white38, size: 40),
            SizedBox(height: 8),
            Text("Can't display this page",
                style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

