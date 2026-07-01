import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/window_control.dart';
import '../../../data/local_files.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../comic/reading_mode.dart';
import '../reader_keyboard.dart';
import '../widgets/reader_widgets.dart';

/// Reader-selectable font families, mapped onto Readium's `fontFamily` preference.
enum EpubFont {
  /// Sans-serif family.
  sansSerif('Sans Serif', 'sans-serif'),

  /// Serif family (default — the most book-like).
  serif('Serif', 'serif'),

  /// Monospace family.
  mono('Monospace', 'monospace');

  const EpubFont(this.label, this.css);

  /// Menu label for the font.
  final String label;

  /// CSS `font-family` value handed to Readium.
  final String css;
}

/// Page color scheme for the EPUB reader, applied via Readium's Preferences API
/// (background/text colors) and mirrored onto the scaffold so the letterboxing
/// around the page matches.
enum EpubReaderTheme {
  /// Dark — light text on a near-black page (default).
  dark('Dark', Icons.dark_mode, 0xFF121212, 0xFFE6E6E6),

  /// Light — black text on white.
  light('Light', Icons.light_mode, 0xFFFFFFFF, 0xFF111111),

  /// Sepia — warm paper tone with brown ink.
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
}

/// Reflowable EPUB reader, backed by the **Readium** toolkit (via `flutter_readium`).
///
/// Replaces the previous epub.js/WebView reader: native pagination, robust
/// **Locator**-based resume, and Readium's Preferences API for theme/font/size and
/// the layout (single vs two-column vs scroll). Reading position is stored as a
/// serialized Locator in `lastLocation`; legacy epub.js CFIs don't parse as
/// Locators, so a book opened for the first time after the switch starts from the
/// beginning (a one-time reset).
class EpubReaderScreen extends ConsumerStatefulWidget {
  /// Creates an EPUB reader for [comic].
  const EpubReaderScreen({super.key, required this.comic});

  /// The book to open.
  final ComicSummary comic;

  @override
  ConsumerState<EpubReaderScreen> createState() => _EpubReaderScreenState();
}

class _EpubReaderScreenState extends ConsumerState<EpubReaderScreen> {
  final _reader = FlutterReadium();
  Publication? _pub;
  String? _error;
  StreamSubscription<Locator>? _sub;
  bool _realigned = false;

  Locator? _locator;
  double _progress = 0; // 0..1 over the whole book

  // Preferences (local UI state; pushed to the engine).
  double _fontScale = 1.0; // Readium fontSize is a ratio — 1.0 = normal
  EpubFont _font = EpubFont.serif;
  EpubReaderTheme _theme = EpubReaderTheme.dark;

  /// Resume point parsed from the stored Locator JSON. Legacy CFIs parse to null
  /// → start from the beginning (the one-time migration reset).
  late final Locator? _initialLocator = _parseLocator(widget.comic.lastLocation);

  static Locator? _parseLocator(String? saved) =>
      (saved == null || saved.isEmpty) ? null : Locator.fromJsonString(saved);

  /// The current preferences, derived from the reading mode + theme + font. EPUB
  /// is paginated-only: Two pages → two columns, otherwise one. (Readium's scroll
  /// mode is per-chapter, so it's not offered here — see later.md.)
  EPUBPreferences _prefs() {
    final two = ref.read(readingModeProvider) == ReadingMode.doublePage;
    return EPUBPreferences(
      columnCount: two ? EpubColumnCount.two : EpubColumnCount.one,
      scroll: false,
      fontFamily: _font.css,
      fontSize: _fontScale,
      backgroundColor: _theme.background,
      textColor: _theme.foreground,
    );
  }

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _reader.closePublication();
    super.dispose();
  }

  Future<void> _open() async {
    final uri = widget.comic.sourceUri;
    if (uri == null) {
      setState(() => _error = 'Could not open this book.');
      return;
    }
    try {
      // Pass a PLAIN path — the native side prepends file:// and encodes once.
      final abs = await resolveLibraryPath(uri);
      // Configure the layout BEFORE opening so the navigator paginates at the
      // right column count from the first render.
      _reader.setDefaultPreferences(_prefs());
      _sub = _reader.onTextLocatorChanged.listen(_onLocator);
      final pub = await _reader.openPublication(abs);
      if (!mounted) return;
      setState(() => _pub = pub);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not open this book:\n$e');
    }
  }

  void _onLocator(Locator l) {
    _locator = l;
    final tp = l.locations?.totalProgression;
    if (tp != null) _progress = tp.clamp(0, 1);
    _scheduleRealign();
    _persist();
    if (mounted) setState(() {});
  }

  /// The navigator paginates for the platform view's bounds at content-load time
  /// — before the Flutter `Expanded` settles — which can leave the first render
  /// mis-sized. Re-navigating to the current locator once, after the view settles,
  /// forces a re-paginate at the real size.
  void _scheduleRealign() {
    if (_realigned) return;
    final l = _locator ?? _initialLocator;
    if (l == null) return;
    _realigned = true;
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _reader.goToLocator(l);
    });
  }

  /// Writes the current position (page derived from whole-book progression, the
  /// serialized Locator, and an explicit `completed` so paging back can clear it).
  void _persist() {
    final l = _locator;
    if (l == null) return;
    final pageCount = widget.comic.pageCount;
    final denom = pageCount > 1 ? pageCount - 1 : 1;
    ref.read(activeSourceProvider).setProgress(
          widget.comic.id,
          page: (_progress * denom).round(),
          location: jsonEncode(l.toJson()),
          completed: _progress >= 0.999,
        );
  }

  Future<void> _applyPreferences() => _reader.setEPUBPreferences(_prefs());

  void _setFontScale(double scale) {
    setState(() => _fontScale = double.parse(scale.clamp(0.6, 2.0).toStringAsFixed(2)));
    _applyPreferences();
  }

  void _setFont(EpubFont font) {
    setState(() => _font = font);
    _applyPreferences();
  }

  void _setTheme(EpubReaderTheme theme) {
    setState(() => _theme = theme);
    _applyPreferences();
  }

  void _openToc() {
    final pub = _pub;
    if (pub == null) return;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141414),
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TocSheet(
        entries: pub.toc,
        onTap: (link) {
          Navigator.of(context).pop();
          _reader.goByLink(link, pub);
        },
      ),
    );
  }

  void _openTypographySheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141414),
      builder: (_) => _TypographySheet(
        fontScale: _fontScale,
        font: _font,
        theme: _theme,
        onFontScale: _setFontScale,
        onFont: _setFont,
        onTheme: _setTheme,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Re-apply preferences when the reading mode changes (single/two-page).
    ref.listen(readingModeProvider, (_, _) => _applyPreferences());
    final mode = ref.watch(readingModeProvider);
    // EPUB offers only paginated layouts; a persisted scroll mode shows as single.
    final epubMode = mode == ReadingMode.scroll ? ReadingMode.single : mode;
    final pub = _pub;
    return Scaffold(
      backgroundColor: _theme.background,
      appBar: AppBar(
        backgroundColor: const Color(0xFF141414),
        foregroundColor: Colors.white,
        title: Text(widget.comic.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: 'Contents',
            icon: const Icon(Icons.toc),
            onPressed: pub == null ? null : _openToc,
          ),
          ReadingModeMenu(
            mode: epubMode,
            modes: const [ReadingMode.single, ReadingMode.doublePage],
          ),
          IconButton(
            tooltip: 'Text & theme',
            icon: const Icon(Icons.text_fields),
            onPressed: pub == null ? null : _openTypographySheet,
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
          : pub == null
              ? const Center(child: CircularProgressIndicator())
              : ReaderKeyboard(
                  onNext: () => _reader.goForward(),
                  onPrev: () => _reader.goBackward(),
                  onZoomIn: () => _setFontScale(_fontScale + 0.1),
                  onZoomOut: () => _setFontScale(_fontScale - 0.1),
                  onZoomReset: () => _setFontScale(1.0),
                  onToggleFullscreen: WindowControl.toggleFullscreen,
                  child: Column(
                    children: [
                      Expanded(
                        child: ReadiumReaderWidget(
                          publication: pub,
                          initialLocator: _initialLocator,
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
            onPressed: () => _reader.goBackward(),
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
            onPressed: () => _reader.goForward(),
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

/// Bottom sheet listing the book's table of contents (nested entries indented by
/// depth). Tapping an entry navigates the reader there and closes the sheet.
class _TocSheet extends StatelessWidget {
  const _TocSheet({required this.entries, required this.onTap});

  final List<Link> entries;
  final ValueChanged<Link> onTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Text('Contents',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            ),
            Flexible(
              child: entries.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('This book has no table of contents.',
                          style: TextStyle(color: Colors.white54)),
                    )
                  : ListView(
                      shrinkWrap: true,
                      children: [for (final e in entries) ..._tiles(e, 0)],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _tiles(Link link, int depth) {
    final title = link.title?.trim() ?? '';
    return [
      if (title.isNotEmpty)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.only(left: 20 + depth * 16.0, right: 20),
          title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
          onTap: () => onTap(link),
        ),
      for (final child in link.children) ..._tiles(child, depth + 1),
    ];
  }
}

/// Bottom sheet for EPUB typography: text size, font family, and page theme.
/// Holds its own copy of each setting (seeded from the reader) and forwards every
/// change via the callbacks.
class _TypographySheet extends StatefulWidget {
  const _TypographySheet({
    required this.fontScale,
    required this.font,
    required this.theme,
    required this.onFontScale,
    required this.onFont,
    required this.onTheme,
  });

  final double fontScale;
  final EpubFont font;
  final EpubReaderTheme theme;
  final ValueChanged<double> onFontScale;
  final ValueChanged<EpubFont> onFont;
  final ValueChanged<EpubReaderTheme> onTheme;

  @override
  State<_TypographySheet> createState() => _TypographySheetState();
}

class _TypographySheetState extends State<_TypographySheet> {
  late double _fontScale = widget.fontScale;
  late EpubFont _font = widget.font;
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
                  value: _fontScale,
                  min: 0.6,
                  max: 2.0,
                  divisions: 14,
                  onChanged: (v) {
                    setState(() => _fontScale = v);
                    widget.onFontScale(v);
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
                  selected: _font == font,
                  onSelected: (_) {
                    setState(() => _font = font);
                    widget.onFont(font);
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
