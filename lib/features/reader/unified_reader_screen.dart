import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/immersive_reading.dart';
import '../../core/theme/app_theme.dart';
import '../../core/window_control.dart';
import '../../data/local_files.dart';
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import 'comic/reading_mode.dart';
import 'epub/epub_preferences.dart';
import 'epub/epub_progress_bar.dart';
import 'epub/epub_reader_style.dart';
import 'epub/contents_drawer.dart';
import 'epub/search_sheet.dart';
import 'epub/tts_controls.dart';
import 'epub/typography_sheet.dart';
import 'progress_saver.dart';
import 'progress_sync.dart';
import 'reader_keyboard.dart';
import 'widgets/reader_widgets.dart';

/// Readium-backed EPUB reader screen.
///
/// The dispatcher (`reader_dispatcher.dart`) routes only EPUBs here — PDFs and
/// comics have dedicated readers — so this screen can assume a reflowable,
/// paginated Readium publication throughout. ("Unified" is aspirational: once
/// the server exposes WebPub/OPDS manifests, the other formats may join.)
///
/// This file is the orchestrator: it owns the Readium session lifecycle
/// (open/listen/close), progress persistence, and the TTS session, and wires
/// the chrome together. The cohesive pieces live under `epub/`:
///  * `epub_preferences.dart` — the persisted view settings and the Readium
///    preference patches built from them;
///  * `contents_drawer.dart` / `search_sheet.dart` / `typography_sheet.dart` /
///    `tts_controls.dart` — the bottom sheets and the TTS bar;
///  * `epub_progress_bar.dart` — the chapter scrubber + whole-book label;
///  * `epub_reader_style.dart` — the shared dark-chrome palette.
class UnifiedReaderScreen extends ConsumerStatefulWidget {
  /// Creates a reader for the EPUB [comic].
  const UnifiedReaderScreen({super.key, required this.comic});

  /// The catalog item to read. Its `sourceUri` points at the EPUB file and its
  /// `lastLocation` (if any) is the JSON-encoded resume [Locator].
  final ComicSummary comic;

  @override
  ConsumerState<UnifiedReaderScreen> createState() =>
      _UnifiedReaderScreenState();
}

class _UnifiedReaderScreenState extends ConsumerState<UnifiedReaderScreen> {
  late final FlutterReadium _reader;
  late final EpubReaderPreferences _prefs;

  Publication? _pub;
  Locator? _locator;

  /// Resume position decoded from the catalog row, handed to the reader widget
  /// on first build so the book opens where the user left off.
  Locator? _initialLocator;

  String? _error;
  bool _chrome = true;

  /// Whether the Contents sidebar is open. Defaults open on wide layouts (a
  /// persistent left drawer, per the Folio design) and closed on phones (where
  /// it slides in over the page). Set once in [didChangeDependencies].
  bool _tocOpen = false;
  bool _tocDefaulted = false;

  /// Debounces progress writes — see [ProgressSaver] for why persisting every
  /// locator event is too expensive.
  final ProgressSaver _progress = ProgressSaver();

  // --- TTS session state ---
  bool _ttsActive = false;
  ReadiumTimebasedState? _ttsState;
  List<ReaderTTSVoice> _voices = [];
  ReaderTTSVoice? _selectedVoice;

  StreamSubscription? _ttsSubscription;
  StreamSubscription? _statusSubscription;
  StreamSubscription? _locatorSubscription;
  StreamSubscription? _errorSubscription;

  @override
  void initState() {
    super.initState();
    _reader = FlutterReadium();
    _prefs = EpubReaderPreferences.load(ref.read(sharedPreferencesProvider));
    _resolveAndOpen();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Default the drawer open on wide layouts, closed on phones — once.
    if (!_tocDefaulted) {
      _tocDefaulted = true;
      _tocOpen = MediaQuery.sizeOf(context).width >= 900;
    }
  }

  @override
  void dispose() {
    _progress.flush(); // persist the final position before leaving
    _ttsSubscription?.cancel();
    _statusSubscription?.cancel();
    _locatorSubscription?.cancel();
    _errorSubscription?.cancel();
    if (_ttsActive) {
      _reader.stop().catchError((_) {});
    }
    _reader.closePublication().catchError((_) {});
    restoreSystemChrome();
    super.dispose();
  }

  /// Resolves the EPUB's path, opens it through Readium, and attaches the
  /// session listeners. Runs once from [initState].
  Future<void> _resolveAndOpen() async {
    try {
      var uri = widget.comic.sourceUri;

      // Local rows store paths relative to the app-support dir (absolute paths
      // break across iOS reinstalls); remote books arrive as http(s) URLs.
      if (uri != null &&
          !uri.startsWith('http://') &&
          !uri.startsWith('https://')) {
        uri = await resolveLibraryPath(uri);
      }

      if (uri == null) {
        setState(
          () =>
              _error = 'Could not resolve EPUB file. Try downloading it again.',
        );
        return;
      }

      if (widget.comic.lastLocation != null) {
        // A corrupt saved locator just means "start from the beginning" —
        // never block opening the book over it.
        try {
          _initialLocator = Locator.fromJson(
            jsonDecode(widget.comic.lastLocation!) as Map<String, dynamic>,
          );
        } catch (_) {}
      }

      final pub = await _reader.openPublication(uri);
      // openPublication parses the whole EPUB and can be slow; if the user
      // backed out meanwhile, dispose() already ran (cancelling the still-null
      // subscriptions and closing nothing). Bail before attaching listeners so
      // we don't leak subscriptions or touch `ref` after dispose (bugs.md #8),
      // and close the publication ourselves since dispose() closed nothing.
      if (!mounted) {
        unawaited(_reader.closePublication().catchError((_) {}));
        return;
      }
      _pub = pub;

      // Apply the persisted preferences only once the native view is ready —
      // patches sent earlier are silently dropped.
      _statusSubscription = _reader.onReaderStatusChanged.listen((status) {
        if (status == ReadiumReaderStatus.ready) {
          _applyPreferencesNow();
        }
      });

      // Track position for the progress bar and the (debounced) saves.
      _locatorSubscription = _reader.onTextLocatorChanged.listen((locator) {
        if (!mounted) return; // _saveProgress reads `ref` — see bugs.md #8
        setState(() => _locator = locator);
        _saveProgress(locator);
      });

      _errorSubscription = _reader.onErrorEvent.listen((err) {
        if (mounted) {
          setState(() => _error = 'Readium Error: ${err.message}');
        }
      });

      _ttsSubscription = _reader.onTimebasedPlayerStateChanged.listen((state) {
        if (mounted) setState(() => _ttsState = state);
      });

      // Load the TTS voices up front so the settings sheet has them; restore
      // the persisted choice if that voice still exists on this device.
      try {
        final voiceList = await _reader.ttsGetAvailableVoices();
        if (mounted) {
          setState(() {
            _voices = voiceList;
            final wanted = _prefs.ttsVoiceIdentifier;
            if (wanted != null) {
              _selectedVoice = voiceList.isEmpty
                  ? null
                  : voiceList.firstWhere(
                      (v) => v.identifier == wanted,
                      orElse: () => voiceList.first,
                    );
            } else if (voiceList.isNotEmpty) {
              _selectedVoice = voiceList.first;
            }
          });
        }
      } catch (_) {
        // No voices — the TTS sheet shows "No voices available".
      }

      if (mounted) setState(() {}); // publish _pub: swap spinner for the book
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _saveProgress(Locator locator) {
    // Debounced: locator events fire on every page swipe (and mid-navigation),
    // and each write kicks off a catalog-wide provider refresh. Capture the
    // source now; persist once the position settles.
    final source = ref.read(activeSourceProvider);
    // Whole-book progression, not the per-resource `progression` (which is
    // position within the current chapter) — it drives the completed flag and
    // the persisted percent that library cards and the home hero show.
    final total = locator.locations?.totalProgression;
    final location = jsonEncode(locator.toJson());
    final percent = total == null ? null : (total.clamp(0.0, 1.0) * 100);
    final completed = total != null && total >= 0.99;
    _progress.schedule(() {
      source.setProgress(
        widget.comic.id,
        location: location,
        percent: percent,
        completed: completed,
      );
      // Downloaded copy? Mirror to its origin server for cross-device sync.
      mirrorProgressToOrigin(
        ref,
        widget.comic,
        location: location,
        percent: percent,
        completed: completed,
      );
    });
  }

  // --- Preferences -----------------------------------------------------------

  /// Pushes the full persisted preference set to the rendered book (used when
  /// the reader becomes ready). Must be the *complete* set: sending only
  /// theme/columns left restored typography loaded into the settings sheet but
  /// never applied to the page (bugs.md #9).
  void _applyPreferencesNow() {
    final mode = ref.read(readingModeProvider);
    unawaited(
      _reader
          .setEPUBPreferences(
            _prefs.fullPreferences(columnCount: _epubColumnCountForMode(mode)),
          )
          .catchError((Object e) {
            if (mounted) {
              setState(
                () => _error = 'Could not apply reader preferences:\n$e',
              );
            }
          }),
    );
  }

  /// Fire-and-forget a single preference patch (from a settings-sheet change
  /// or keyboard zoom), surfacing failures in the error state.
  void _applyPatch(EPUBPreferences patch) {
    unawaited(
      _reader.setEPUBPreferences(patch).catchError((Object e) {
        if (mounted) {
          setState(() => _error = 'Could not apply EPUB preference:\n$e');
        }
      }),
    );
  }

  /// Restores all view settings to defaults and re-applies them one patch at a
  /// time, in order (mirroring how the individual setters apply), so a failure
  /// mid-way leaves earlier patches in effect rather than none.
  void _resetEpubSettings() {
    final patches = _prefs.reset();
    setState(() {});
    unawaited(
      () async {
        for (final patch in patches) {
          await _reader.setEPUBPreferences(patch);
        }
      }().catchError((Object e) {
        if (mounted) {
          setState(() => _error = 'Could not reset EPUB preferences:\n$e');
        }
      }),
    );
  }

  /// Sets the font size and applies it — the target of the Cmd/Ctrl +/-/0
  /// keyboard shortcuts (the typography sheet drives its own changes).
  void _setFontScale(double value) {
    final patch = _prefs.setFontScale(value);
    setState(() {});
    _applyPatch(patch);
  }

  // --- Reading mode ------------------------------------------------------------

  /// EPUB supports only the paginated modes; the globally-persisted mode may
  /// be `scroll` (from the comic reader), which renders here as single-column.
  /// Readium *has* a scroll mode, but it scrolls per-resource, which reads
  /// poorly for whole books (see later.md).
  ReadingMode _effectiveEpubMode(ReadingMode mode) {
    return mode == ReadingMode.doublePage
        ? ReadingMode.doublePage
        : ReadingMode.single;
  }

  EpubColumnCount _epubColumnCountForMode(ReadingMode mode) {
    return _effectiveEpubMode(mode) == ReadingMode.doublePage
        ? EpubColumnCount.two
        : EpubColumnCount.one;
  }

  void _setReaderMode(ReadingMode mode) {
    ref.read(readingModeProvider.notifier).set(mode);
    _applyPatch(_prefs.columnCountPatch(_epubColumnCountForMode(mode)));
  }

  // --- Chrome & sheets ---------------------------------------------------------

  /// Flip the in-app chrome and match the system bars: hidden chrome goes
  /// full-bleed (immersive) on mobile, shown chrome restores the bars.
  void _toggleChrome() {
    setState(() => _chrome = !_chrome);
    setReaderImmersion(chromeVisible: _chrome);
  }

  /// Toggles the Contents sidebar (no-op when the book has no ToC).
  void _toggleToc() {
    final pub = _pub;
    if (pub == null || pub.toc.isEmpty) return;
    setState(() => _tocOpen = !_tocOpen);
  }

  /// Navigates to a chapter from the Contents sidebar, closing the drawer on
  /// phones (where it overlays the page) but leaving it open on wide layouts.
  void _goToLink(Link link) {
    final pub = _pub;
    if (pub == null) return;
    _reader.goByLink(link, pub);
    if (MediaQuery.sizeOf(context).width < 900) {
      setState(() => _tocOpen = false);
    }
  }

  void _openSearchSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: readerPanelColor,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => SearchSheet(
        reader: _reader,
        onTap: (locator) {
          Navigator.of(context).pop();
          _reader.goToLocator(locator);
        },
      ),
    );
  }

  void _openSettingsSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: readerPanelColor,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => TypographySheet(
        prefs: _prefs,
        // setState so the page background (and anything else rendered from the
        // prefs) follows the change live behind the open sheet.
        onApply: (patch) {
          setState(() {});
          _applyPatch(patch);
        },
        onReset: _resetEpubSettings,
      ),
    );
  }

  // --- TTS -----------------------------------------------------------------

  Future<void> _toggleTts() async {
    if (_ttsActive) {
      await _reader.stop();
      if (!mounted) return;
      setState(() => _ttsActive = false);
    } else {
      await _reader.ttsEnable(null);
      // Highlight the sentence being spoken so the eye can follow along.
      await _reader.setDecorationStyle(
        const ReaderDecorationStyle(
          style: DecorationStyle.highlight,
          tint: Color(0x40FFEB3B),
        ),
        null,
      );
      if (!mounted) return;
      setState(() => _ttsActive = true);
      _updateTtsPreferences();
      await _reader.play(_locator);
    }
  }

  /// Pushes the current speed/pitch/voice to the engine. Only meaningful while
  /// a TTS session is active — Readium drops the settings otherwise, which is
  /// why [_toggleTts] re-sends them on every enable.
  void _updateTtsPreferences() {
    if (!_ttsActive) return;
    _reader.ttsSetPreferences(
      TTSPreferences(speed: _prefs.ttsSpeechRate, pitch: _prefs.ttsPitch),
    );
    if (_selectedVoice != null) {
      _reader.ttsSetVoice(_selectedVoice!.identifier, null);
    }
  }

  void _openTtsSettings() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: readerPanelColor,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => TtsSettingsSheet(
        voices: _voices,
        selectedVoice: _selectedVoice,
        speechRate: _prefs.ttsSpeechRate,
        pitch: _prefs.ttsPitch,
        onSpeechRateChanged: (val) {
          setState(() => _prefs.setTtsSpeechRate(val));
          _updateTtsPreferences();
        },
        onPitchChanged: (val) {
          setState(() => _prefs.setTtsPitch(val));
          _updateTtsPreferences();
        },
        onVoiceChanged: (voice) {
          setState(() {
            _selectedVoice = voice;
            if (voice != null) _prefs.setTtsVoice(voice.identifier);
          });
          _updateTtsPreferences();
        },
      ),
    );
  }

  // --- Build ---------------------------------------------------------------

  /// Wraps the reading [content] with the Contents sidebar: a persistent left
  /// drawer that slides the page over on wide layouts, or a slide-in overlay
  /// (with a tap-to-dismiss scrim) on phones. Books without a ToC pass through.
  Widget _wrapWithToc(Publication? pub, Widget content) {
    if (pub == null || pub.toc.isEmpty) return content;

    final drawer = ContentsDrawer(
      title: widget.comic.title,
      entries: pub.toc,
      activeHref: _locator?.href,
      onTap: _goToLink,
      onClose: () => setState(() => _tocOpen = false),
    );

    final wide = MediaQuery.sizeOf(context).width >= 900;
    if (wide) {
      return Row(
        children: [
          ClipRect(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              width: _tocOpen ? 280 : 0,
              child: OverflowBox(
                alignment: Alignment.centerLeft,
                minWidth: 280,
                maxWidth: 280,
                child: drawer,
              ),
            ),
          ),
          Expanded(child: content),
        ],
      );
    }

    return Stack(
      children: [
        Positioned.fill(child: content),
        if (_tocOpen)
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => setState(() => _tocOpen = false),
              child: ColoredBox(color: Colors.black.withValues(alpha: 0.5)),
            ),
          ),
        AnimatedPositioned(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          left: _tocOpen ? 0 : -280,
          top: 0,
          bottom: 0,
          width: 280,
          child: Material(color: Colors.transparent, child: drawer),
        ),
      ],
    );
  }

  /// The Folio reading top bar, drawn over the reading pane (not the full width)
  /// so the Contents sidebar can run full-height beside it. Its background — like
  /// the sidebar's — extends up behind the status bar. Back · centered title ·
  /// ☰ contents / ⌕ search / TTS / reading-mode / Aa / fullscreen.
  Widget _buildTopBar(BuildContext context, Publication? pub, ReadingMode mode) {
    final primary = Theme.of(context).colorScheme.primary;
    const fg = CbColors.foreground;
    final topPad = MediaQuery.paddingOf(context).top;
    return Container(
      color: readerChromeColor,
      padding: EdgeInsets.only(top: topPad),
      child: SizedBox(
        height: 52,
        child: Row(
          children: [
            IconButton(
              tooltip: 'Back',
              icon: const Icon(Icons.arrow_back, color: fg),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: Center(
                child: Text(
                  widget.comic.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: kSansFamily,
                    fontSize: 13,
                    color: CbColors.mutedForeground,
                  ),
                ),
              ),
            ),
            if (pub != null && pub.toc.isNotEmpty)
              IconButton(
                tooltip: 'Contents',
                icon: Icon(Icons.menu, color: _tocOpen ? primary : fg),
                onPressed: _toggleToc,
              ),
            if (pub != null)
              IconButton(
                tooltip: 'Search',
                icon: const Icon(Icons.search, color: fg),
                onPressed: _openSearchSheet,
              ),
            if (pub != null)
              IconButton(
                tooltip: _ttsActive ? 'Stop TTS' : 'Read Aloud (TTS)',
                icon: Icon(
                  _ttsActive ? Icons.volume_off : Icons.volume_up,
                  color: _ttsActive ? primary : fg,
                ),
                onPressed: _toggleTts,
              ),
            ReadingModeMenu(
              mode: _effectiveEpubMode(mode),
              modes: const [ReadingMode.single, ReadingMode.doublePage],
              onSelected: _setReaderMode,
              color: fg,
            ),
            // "Aa" — the Folio display-settings affordance (opens the same
            // typography sheet as the old gear).
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Tooltip(
                message: 'Display settings',
                child: TextButton(
                  onPressed: pub == null ? null : _openSettingsSheet,
                  style: TextButton.styleFrom(
                    foregroundColor: fg,
                    minimumSize: const Size(40, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text('Aa', style: cbSerif(size: 17, color: fg)),
                ),
              ),
            ),
            if (Platform.isMacOS)
              IconButton(
                tooltip: 'Fullscreen (f)',
                icon: const Icon(Icons.fullscreen, color: fg),
                onPressed: WindowControl.toggleFullscreen,
              ),
            const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(readingModeProvider);
    final pub = _pub;

    return Scaffold(
      // The page theme colors the whole scaffold so letterboxing around the
      // rendered page matches the paper color instead of flashing black.
      backgroundColor: _prefs.theme.background,
      body: _wrapWithToc(
        pub,
        _error != null
          ? ReaderMessage(message: _error!)
          : pub == null
          ? const Center(child: CircularProgressIndicator())
          : ReaderKeyboard(
              onNext: () => _reader.goForward(),
              onPrev: () => _reader.goBackward(),
              onZoomIn: () => _setFontScale(_prefs.fontScale + 0.1),
              onZoomOut: () => _setFontScale(_prefs.fontScale - 0.1),
              onZoomReset: () => _setFontScale(1.0),
              onToggleFullscreen: WindowControl.toggleFullscreen,
              child: Column(
                children: [
                  // The top bar lives inside the reading pane (not a full-width
                  // AppBar) so the Contents sidebar runs full-height beside it.
                  if (_chrome) _buildTopBar(context, pub, mode),
                  Expanded(
                    child: LayoutBuilder(
                      builder: (context, constraints) => GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onTapUp: (details) {
                          // Tap centre of the pane to toggle chrome; the side
                          // thirds are Readium's own tap-to-turn zones.
                          final x = details.localPosition.dx;
                          if (x > constraints.maxWidth * 0.3 &&
                              x < constraints.maxWidth * 0.7) {
                            _toggleChrome();
                          }
                        },
                        child: ReadiumReaderWidget(
                          publication: pub,
                          initialLocator: _initialLocator,
                        ),
                      ),
                    ),
                  ),
                  if (_ttsActive)
                    TtsControlsBar(
                      reader: _reader,
                      playerState: _ttsState,
                      onStop: _toggleTts,
                      onOpenSettings: _openTtsSettings,
                    ),
                  if (_chrome)
                    EpubProgressBar(
                      locator: _locator,
                      readingOrder: pub.readingOrder,
                      onSeek: (value) {
                        _reader.goToProgression(value);
                      },
                    ),
                ],
              ),
            ),
      ),
    );
  }
}
