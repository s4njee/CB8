import 'dart:io';

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
import 'cbz_archive.dart';
import 'comic_page_source.dart';
import 'pdf_page_source.dart';
import 'reading_mode.dart';

/// Full-screen comic reader — port of CB8's `ComicReader`. Supports three layouts
/// (vertical scroll / single page / two-page spread) chosen via a toolbar menu
/// and persisted globally. Works against local archives or a remote page source.
class ComicReaderScreen extends ConsumerStatefulWidget {
  const ComicReaderScreen({super.key, required this.comic});

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

  // Single/double use a PageController (over pages / over spreads); scroll uses
  // an ItemScrollController. The parent owns them so the slider can jump in any
  // mode, and so switching modes preserves the current page.
  PageController? _pageController;
  final ItemScrollController _scrollController = ItemScrollController();
  final ItemPositionsListener _positions = ItemPositionsListener.create();
  bool _scrollListening = false;

  int get _pageCount => _source?.pageCount ?? 0;
  int get _spreadCount => (_pageCount + 1) ~/ 2;

  @override
  void initState() {
    super.initState();
    _mode = ref.read(readingModeProvider);
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
          urlFor: (i) => active.pageUrl(comic.id, i),
          headers: comic.imageHeaders,
        );
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
        _pageController = PageController(initialPage: _page ~/ 2);
      case ReadingMode.scroll:
        if (!_scrollListening) {
          _positions.itemPositions.addListener(_onScrollPositions);
          _scrollListening = true;
        }
    }
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
    ref.read(activeSourceProvider).setProgress(
          widget.comic.id,
          page: page,
          completed: completed ? true : null,
        );
  }

  void _onPagedChanged(int controllerIndex) {
    final page = _mode == ReadingMode.doublePage ? controllerIndex * 2 : controllerIndex;
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
      _turn(forward: false);
    } else if (dx > width * 0.67) {
      _turn(forward: true);
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
        _pageController?.jumpToPage(page ~/ 2);
      case ReadingMode.scroll:
        if (_scrollController.isAttached) _scrollController.jumpTo(index: page);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<ReadingMode>(readingModeProvider, (_, next) => _changeMode(next));
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
              _ReaderMessage(message: _error!)
            else if (source == null)
              const Center(child: CircularProgressIndicator())
            else
              _body(source),
            if (_chrome) _topBar(context),
            if (_chrome && source != null) _bottomBar(context),
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
            ),
          ),
        );
      case ReadingMode.single:
        final controller = _pageController;
        if (controller == null) return const Center(child: CircularProgressIndicator());
        return PhotoViewGallery.builder(
          pageController: controller,
          itemCount: source.pageCount,
          backgroundDecoration: const BoxDecoration(color: Colors.black),
          onPageChanged: _onPagedChanged,
          builder: (context, index) => PhotoViewGalleryPageOptions(
            imageProvider: source.imageFor(index),
            minScale: PhotoViewComputedScale.contained,
            initialScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 3,
            onTapUp: (ctx, details, _) => _handleTap(ctx, details),
          ),
        );
      case ReadingMode.doublePage:
        final controller = _pageController;
        if (controller == null) return const Center(child: CircularProgressIndicator());
        return PhotoViewGallery.builder(
          pageController: controller,
          itemCount: _spreadCount,
          backgroundDecoration: const BoxDecoration(color: Colors.black),
          onPageChanged: _onPagedChanged,
          builder: (context, spread) {
            final left = spread * 2;
            final right = left + 1;
            return PhotoViewGalleryPageOptions.customChild(
              minScale: PhotoViewComputedScale.contained,
              initialScale: PhotoViewComputedScale.contained,
              maxScale: PhotoViewComputedScale.covered * 3,
              onTapUp: (ctx, details, _) => _handleTap(ctx, details),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Expanded(child: Image(image: source.imageFor(left), fit: BoxFit.contain)),
                  if (right < source.pageCount)
                    Expanded(child: Image(image: source.imageFor(right), fit: BoxFit.contain)),
                ],
              ),
            );
          },
        );
    }
  }

  Widget _topBar(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: Text(
                widget.comic.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
            if (Platform.isMacOS)
              IconButton(
                tooltip: 'Toggle fullscreen (f)',
                icon: const Icon(Icons.fullscreen, color: Colors.white),
                onPressed: WindowControl.toggleFullscreen,
              ),
            PopupMenuButton<ReadingMode>(
              tooltip: 'Reading mode',
              icon: Icon(_mode.icon, color: Colors.white),
              onSelected: (m) => ref.read(readingModeProvider.notifier).set(m),
              itemBuilder: (context) => [
                for (final m in ReadingMode.values)
                  CheckedPopupMenuItem(
                    value: m,
                    checked: m == _mode,
                    child: Row(
                      children: [
                        Icon(m.icon, size: 18),
                        const SizedBox(width: 10),
                        Text(m.label),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar(BuildContext context) {
    final count = _pageCount;
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        padding: EdgeInsets.only(
          bottom: MediaQuery.paddingOf(context).bottom + 8,
          top: 8,
          left: 12,
          right: 12,
        ),
        child: Row(
          children: [
            Expanded(
              child: Slider(
                value: _page.toDouble().clamp(0, (count - 1).toDouble().clamp(0, double.infinity)),
                min: 0,
                max: (count - 1).toDouble().clamp(0, double.infinity),
                onChanged: count > 1 ? (v) => _jumpToPage(v.round()) : null,
              ),
            ),
            const SizedBox(width: 8),
            Text('${_page + 1} / $count', style: const TextStyle(color: Colors.white)),
          ],
        ),
      ),
    );
  }
}

class _ReaderMessage extends StatelessWidget {
  const _ReaderMessage({required this.message});
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
