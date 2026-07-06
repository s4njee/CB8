import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/immersive_reading.dart';
import '../../core/window_control.dart';
import '../../data/local_files.dart';
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import 'comic/reading_mode.dart';
import 'progress_saver.dart';
import 'reader_keyboard.dart';
import 'widgets/reader_widgets.dart';

/// Font families for reflowable text.
enum EpubFont {
  sansSerif('Sans Serif', 'sans-serif'),
  serif('Serif', 'serif'),
  mono('Monospace', 'monospace');

  const EpubFont(this.label, this.css);
  final String label;
  final String css;
}

/// Color schemes for reading theme.
enum EpubReaderTheme {
  dark('Dark', Icons.dark_mode, 0xFF121212, 0xFFE6E6E6),
  light('Light', Icons.light_mode, 0xFFFFFFFF, 0xFF111111),
  sepia('Sepia', Icons.local_cafe, 0xFFF4ECD8, 0xFF5B4636);

  const EpubReaderTheme(this.label, this.icon, this._bg, this._fg);
  final String label;
  final IconData icon;
  final int _bg;
  final int _fg;

  Color get background => Color(_bg);
  Color get foreground => Color(_fg);
}

const _readerChromeColor = Color(0xF2141414);
const _readerPanelColor = Color(0xFF141414);
const _readerControlColor = Color(0xFF1E1E1E);

const _defaultEpubFontScale = 1.0;
const _defaultEpubFont = EpubFont.serif;
const _defaultEpubTheme = EpubReaderTheme.dark;
const _defaultEpubLineHeight = 1.2;
const _defaultEpubPageMargins = 1.0;
const _defaultEpubWordSpacing = 0.0;
const _defaultEpubLetterSpacing = 0.0;
const _defaultEpubTextAlign = TextAlign.left;
const _defaultEpubPublisherStyles = false;
const _defaultEpubTextNormalization = false;
const _defaultEpubLigatures = true;
const _defaultEpubHyphens = true;
const _defaultEpubReadingProgression = EpubReadingProgression.ltr;
const EpubImageFilter? _defaultEpubImageFilter = null;

/// Readium-backed reader screen.
///
/// The app currently routes EPUB here. PDF and comics stay on their dedicated
/// readers until the server exposes WebPub/OPDS manifests for Phase 2.
class UnifiedReaderScreen extends ConsumerStatefulWidget {
  const UnifiedReaderScreen({super.key, required this.comic});

  final ComicSummary comic;

  @override
  ConsumerState<UnifiedReaderScreen> createState() =>
      _UnifiedReaderScreenState();
}

class _UnifiedReaderScreenState extends ConsumerState<UnifiedReaderScreen> {
  Publication? _pub;
  late FlutterReadium _reader;
  final ProgressSaver _progress = ProgressSaver();
  Locator? _locator;
  Locator? _initialLocator;
  String? _error;
  bool _chrome = true;
  final int _readerViewRevision = 0;

  // SharedPreferences keys
  static const _fontScaleKey = 'cb8_epub_font_scale';
  static const _fontFamilyKey = 'cb8_epub_font_family';
  static const _themeKey = 'cb8_epub_theme';
  static const _lineHeightKey = 'cb8_epub_line_height';
  static const _pageMarginsKey = 'cb8_epub_page_margins';
  static const _wordSpacingKey = 'cb8_epub_word_spacing';
  static const _letterSpacingKey = 'cb8_epub_letter_spacing';
  static const _textAlignKey = 'cb8_epub_text_align';
  static const _publisherStylesKey = 'cb8_epub_publisher_styles';
  static const _normalizeTextKey = 'cb8_epub_normalize_text';
  static const _ligaturesKey = 'cb8_epub_ligatures';
  static const _hyphensKey = 'cb8_epub_hyphens';
  static const _readingProgressionKey = 'cb8_epub_progression';
  static const _imageFilterKey = 'cb8_epub_image_filter';

  // PDF preference SharedPreferences keys
  static const _pdfFitKey = 'cb8_pdf_fit';
  static const _pdfSpreadKey = 'cb8_pdf_spread';

  // TTS configurations
  static const _speechRateKey = 'cb8_tts_speech_rate';
  static const _pitchKey = 'cb8_tts_pitch';
  static const _ttsVoiceKey = 'cb8_tts_voice_identifier';

  // EPUB Preference state variables
  double _fontScale = _defaultEpubFontScale;
  EpubFont _font = _defaultEpubFont;
  EpubReaderTheme _theme = _defaultEpubTheme;
  double _lineHeight = _defaultEpubLineHeight;
  double _pageMargins = _defaultEpubPageMargins;
  double _wordSpacing = _defaultEpubWordSpacing;
  double _letterSpacing = _defaultEpubLetterSpacing;
  TextAlign _textAlign = _defaultEpubTextAlign;
  bool _publisherStyles = _defaultEpubPublisherStyles;
  bool _textNormalization = _defaultEpubTextNormalization;
  bool _ligatures = _defaultEpubLigatures;
  bool _hyphens = _defaultEpubHyphens;
  EpubReadingProgression _readingProgression = _defaultEpubReadingProgression;
  EpubImageFilter? _imageFilter = _defaultEpubImageFilter;

  // PDF Preference state variables
  PDFFit _pdfFit = PDFFit.page;
  PDFSpread _pdfSpread = PDFSpread.auto;

  // TTS engine state
  bool _ttsActive = false;
  ReadiumTimebasedState? _ttsState;
  StreamSubscription? _ttsSubscription;
  StreamSubscription? _statusSubscription;
  StreamSubscription? _locatorSubscription;
  StreamSubscription? _errorSubscription;
  List<ReaderTTSVoice> _voices = [];
  ReaderTTSVoice? _selectedVoice;
  double _speechRate = 1.0;
  double _pitch = 1.0;
  String? _ttsVoiceIdentifier;

  @override
  void initState() {
    super.initState();
    _reader = FlutterReadium();
    _loadPreferences();
    _resolveAndOpen();
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

  void _loadPreferences() {
    final prefs = ref.read(sharedPreferencesProvider);
    setState(() {
      _fontScale = prefs.getDouble(_fontScaleKey) ?? _defaultEpubFontScale;
      final fontIdx = prefs.getInt(_fontFamilyKey);
      if (fontIdx != null && fontIdx >= 0 && fontIdx < EpubFont.values.length) {
        _font = EpubFont.values[fontIdx];
      }
      final themeIdx = prefs.getInt(_themeKey);
      if (themeIdx != null &&
          themeIdx >= 0 &&
          themeIdx < EpubReaderTheme.values.length) {
        _theme = EpubReaderTheme.values[themeIdx];
      }
      _lineHeight = prefs.getDouble(_lineHeightKey) ?? _defaultEpubLineHeight;
      _pageMargins =
          prefs.getDouble(_pageMarginsKey) ?? _defaultEpubPageMargins;
      _wordSpacing =
          prefs.getDouble(_wordSpacingKey) ?? _defaultEpubWordSpacing;
      _letterSpacing =
          prefs.getDouble(_letterSpacingKey) ?? _defaultEpubLetterSpacing;
      final alignIdx = prefs.getInt(_textAlignKey);
      if (alignIdx != null &&
          alignIdx >= 0 &&
          alignIdx < TextAlign.values.length) {
        _textAlign = TextAlign.values[alignIdx];
      }
      _publisherStyles =
          prefs.getBool(_publisherStylesKey) ?? _defaultEpubPublisherStyles;
      _textNormalization =
          prefs.getBool(_normalizeTextKey) ?? _defaultEpubTextNormalization;
      _ligatures = prefs.getBool(_ligaturesKey) ?? _defaultEpubLigatures;
      _hyphens = prefs.getBool(_hyphensKey) ?? _defaultEpubHyphens;

      final progIdx = prefs.getInt(_readingProgressionKey);
      if (progIdx != null &&
          progIdx >= 0 &&
          progIdx < EpubReadingProgression.values.length) {
        _readingProgression = EpubReadingProgression.values[progIdx];
      }

      final filterIdx = prefs.getInt(_imageFilterKey);
      if (filterIdx != null &&
          filterIdx >= 0 &&
          filterIdx < EpubImageFilter.values.length) {
        _imageFilter = EpubImageFilter.values[filterIdx];
      } else {
        _imageFilter = null;
      }

      // PDF
      final pdfFitIdx = prefs.getInt(_pdfFitKey);
      if (pdfFitIdx != null &&
          pdfFitIdx >= 0 &&
          pdfFitIdx < PDFFit.values.length) {
        _pdfFit = PDFFit.values[pdfFitIdx];
      }
      final pdfSpreadIdx = prefs.getInt(_pdfSpreadKey);
      if (pdfSpreadIdx != null &&
          pdfSpreadIdx >= 0 &&
          pdfSpreadIdx < PDFSpread.values.length) {
        _pdfSpread = PDFSpread.values[pdfSpreadIdx];
      }

      // TTS
      _speechRate = prefs.getDouble(_speechRateKey) ?? 1.0;
      _pitch = prefs.getDouble(_pitchKey) ?? 1.0;
      _ttsVoiceIdentifier = prefs.getString(_ttsVoiceKey);
    });
  }

  Future<void> _resolveAndOpen() async {
    try {
      var uri = widget.comic.sourceUri;

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
      // we don't leak subscriptions or touch `ref` after dispose.
      if (!mounted) {
        unawaited(_reader.closePublication().catchError((_) {}));
        return;
      }
      _pub = pub;

      // Listen to status changes to apply preferences when ready
      _statusSubscription = _reader.onReaderStatusChanged.listen((status) {
        if (status == ReadiumReaderStatus.ready) {
          _applyPreferencesNow();
        }
      });

      // Listen to locator changes to update progress
      _locatorSubscription = _reader.onTextLocatorChanged.listen((locator) {
        if (!mounted) return;
        setState(() => _locator = locator);
        _saveProgress(locator);
      });

      // Listen to reader error events
      _errorSubscription = _reader.onErrorEvent.listen((err) {
        if (mounted) {
          setState(() => _error = 'Readium Error: ${err.message}');
        }
      });

      // Listen to TTS player state
      _ttsSubscription = _reader.onTimebasedPlayerStateChanged.listen((state) {
        if (mounted) setState(() => _ttsState = state);
      });

      // Load TTS voices
      try {
        final voiceList = await _reader.ttsGetAvailableVoices();
        if (mounted) {
          setState(() {
            _voices = voiceList;
            if (_ttsVoiceIdentifier != null) {
              _selectedVoice = voiceList.isEmpty
                  ? null
                  : voiceList.firstWhere(
                      (v) => v.identifier == _ttsVoiceIdentifier,
                      orElse: () => voiceList.first,
                    );
            } else if (voiceList.isNotEmpty) {
              _selectedVoice = voiceList.first;
            }
          });
        }
      } catch (_) {}

      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _saveProgress(Locator locator) {
    // Debounced: locator events fire on every page swipe (and mid-navigation),
    // and each write kicks off a catalog-wide provider refresh. Capture the
    // source now; persist once the position settles.
    final source = ref.read(activeSourceProvider);
    _progress.schedule(
      () => source.setProgress(
        widget.comic.id,
        location: jsonEncode(locator.toJson()),
        // Use whole-book progression, not the per-resource `progression`
        // (which is position within the current chapter) — otherwise reaching
        // the end of any chapter would mark the entire book completed.
        completed:
            locator.locations?.totalProgression != null &&
            locator.locations!.totalProgression! >= 0.99,
      ),
    );
  }

  Future<void> _applyPreferences() async {
    final ext = widget.comic.extension?.toLowerCase();
    if (ext == 'epub') {
      final mode = ref.read(readingModeProvider);
      // Send the full persisted preference set on open, not just theme/columns —
      // otherwise a restored font size / line height / margin (etc.) is loaded
      // into state and shown in the settings sheet but never actually applied to
      // the rendered book until the user nudges that individual control.
      await _applyEpubPreferences(
        EPUBPreferences(
          backgroundColor: _theme.background,
          textColor: _theme.foreground,
          publisherStyles: _publisherStyles,
          columnCount: _epubColumnCountForMode(mode),
          scroll: false,
          fontSize: _fontScale,
          fontFamily: _font.css,
          lineHeight: _lineHeight,
          pageMargins: _pageMargins,
          wordSpacing: _wordSpacing,
          letterSpacing: _letterSpacing,
          textAlign: _textAlign,
          textNormalization: _textNormalization,
          ligatures: _ligatures,
          hyphens: _hyphens,
          readingProgression: _readingProgression,
          imageFilter: _imageFilter,
        ),
      );
    } else if (ext == 'pdf') {
      await _applyPdfPreferences();
    }
  }

  Future<void> _applyEpubPreferences(EPUBPreferences epubPrefs) async {
    await _reader.setEPUBPreferences(epubPrefs);
  }

  Future<void> _applyPdfPreferences() async {
    final mode = ref.read(readingModeProvider);
    final layout = mode == ReadingMode.scroll
        ? PDFLayout.scrollVertical
        : PDFLayout.paginated;

    final pdfPrefs = PDFPreferences(
      layout: layout,
      spread: _pdfSpread,
      fit: _pdfFit,
    );

    await _reader.setPDFPreferences(pdfPrefs);
  }

  void _applyPreferencesNow() {
    unawaited(
      _applyPreferences().catchError((Object e) {
        if (mounted) {
          setState(() => _error = 'Could not apply reader preferences:\n$e');
        }
      }),
    );
  }

  void _applyEpubPreferencesNow(EPUBPreferences preferences) {
    unawaited(
      _applyEpubPreferences(preferences).catchError((Object e) {
        if (mounted) {
          setState(() => _error = 'Could not apply EPUB preference:\n$e');
        }
      }),
    );
  }

  void _useCustomEpubStyles() {
    if (!_publisherStyles) return;
    _publisherStyles = false;
    ref.read(sharedPreferencesProvider).setBool(_publisherStylesKey, false);
  }

  void _toggleChrome() {
    setState(() => _chrome = !_chrome);
    setReaderImmersion(chromeVisible: _chrome);
  }

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
    if (widget.comic.extension?.toLowerCase() == 'epub') {
      _applyEpubPreferencesNow(
        EPUBPreferences(
          backgroundColor: _theme.background,
          textColor: _theme.foreground,
          publisherStyles: _publisherStyles,
          columnCount: _epubColumnCountForMode(mode),
          scroll: false,
        ),
      );
    } else {
      _applyPreferencesNow();
    }
  }

  // --- Preference setters ---

  void _setFontScale(double val) {
    setState(() {
      _useCustomEpubStyles();
      _fontScale = val.clamp(0.5, 2.5);
    });
    ref.read(sharedPreferencesProvider).setDouble(_fontScaleKey, _fontScale);
    _applyEpubPreferencesNow(
      EPUBPreferences(fontSize: _fontScale, publisherStyles: _publisherStyles),
    );
  }

  void _setFont(EpubFont val) {
    setState(() {
      _useCustomEpubStyles();
      _font = val;
    });
    ref.read(sharedPreferencesProvider).setInt(_fontFamilyKey, val.index);
    _applyEpubPreferencesNow(
      EPUBPreferences(fontFamily: _font.css, publisherStyles: _publisherStyles),
    );
  }

  void _setTheme(EpubReaderTheme val) {
    setState(() {
      _useCustomEpubStyles();
      _theme = val;
    });
    ref.read(sharedPreferencesProvider).setInt(_themeKey, val.index);
    _applyEpubPreferencesNow(
      EPUBPreferences(
        backgroundColor: _theme.background,
        textColor: _theme.foreground,
        publisherStyles: _publisherStyles,
      ),
    );
  }

  void _setLineHeight(double val) {
    setState(() {
      _useCustomEpubStyles();
      _lineHeight = val;
    });
    ref.read(sharedPreferencesProvider).setDouble(_lineHeightKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(lineHeight: val, publisherStyles: _publisherStyles),
    );
  }

  void _setPageMargins(double val) {
    setState(() {
      _useCustomEpubStyles();
      _pageMargins = val;
    });
    ref.read(sharedPreferencesProvider).setDouble(_pageMarginsKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(pageMargins: val, publisherStyles: _publisherStyles),
    );
  }

  void _setWordSpacing(double val) {
    setState(() {
      _useCustomEpubStyles();
      _wordSpacing = val;
    });
    ref.read(sharedPreferencesProvider).setDouble(_wordSpacingKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(wordSpacing: val, publisherStyles: _publisherStyles),
    );
  }

  void _setLetterSpacing(double val) {
    setState(() {
      _useCustomEpubStyles();
      _letterSpacing = val;
    });
    ref.read(sharedPreferencesProvider).setDouble(_letterSpacingKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(letterSpacing: val, publisherStyles: _publisherStyles),
    );
  }

  void _setTextAlign(TextAlign val) {
    setState(() {
      _useCustomEpubStyles();
      _textAlign = val;
    });
    ref.read(sharedPreferencesProvider).setInt(_textAlignKey, val.index);
    _applyEpubPreferencesNow(
      EPUBPreferences(textAlign: val, publisherStyles: _publisherStyles),
    );
  }

  void _setPublisherStyles(bool val) {
    setState(() => _publisherStyles = val);
    ref.read(sharedPreferencesProvider).setBool(_publisherStylesKey, val);
    _applyEpubPreferencesNow(EPUBPreferences(publisherStyles: val));
  }

  void _setTextNormalization(bool val) {
    setState(() {
      _useCustomEpubStyles();
      _textNormalization = val;
    });
    ref.read(sharedPreferencesProvider).setBool(_normalizeTextKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(
        textNormalization: val,
        publisherStyles: _publisherStyles,
      ),
    );
  }

  void _setLigatures(bool val) {
    setState(() {
      _useCustomEpubStyles();
      _ligatures = val;
    });
    ref.read(sharedPreferencesProvider).setBool(_ligaturesKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(ligatures: val, publisherStyles: _publisherStyles),
    );
  }

  void _setHyphens(bool val) {
    setState(() {
      _useCustomEpubStyles();
      _hyphens = val;
    });
    ref.read(sharedPreferencesProvider).setBool(_hyphensKey, val);
    _applyEpubPreferencesNow(
      EPUBPreferences(hyphens: val, publisherStyles: _publisherStyles),
    );
  }

  void _setReadingProgression(EpubReadingProgression val) {
    setState(() => _readingProgression = val);
    ref
        .read(sharedPreferencesProvider)
        .setInt(_readingProgressionKey, val.index);
    _applyEpubPreferencesNow(EPUBPreferences(readingProgression: val));
  }

  void _setImageFilter(EpubImageFilter? val) {
    setState(() => _imageFilter = val);
    if (val != null) {
      ref.read(sharedPreferencesProvider).setInt(_imageFilterKey, val.index);
    } else {
      ref.read(sharedPreferencesProvider).remove(_imageFilterKey);
    }
    _applyEpubPreferencesNow(EPUBPreferences(imageFilter: val));
  }

  void _resetEpubSettings() {
    setState(() {
      _fontScale = _defaultEpubFontScale;
      _font = _defaultEpubFont;
      _theme = _defaultEpubTheme;
      _lineHeight = _defaultEpubLineHeight;
      _pageMargins = _defaultEpubPageMargins;
      _wordSpacing = _defaultEpubWordSpacing;
      _letterSpacing = _defaultEpubLetterSpacing;
      _textAlign = _defaultEpubTextAlign;
      _publisherStyles = _defaultEpubPublisherStyles;
      _textNormalization = _defaultEpubTextNormalization;
      _ligatures = _defaultEpubLigatures;
      _hyphens = _defaultEpubHyphens;
      _readingProgression = _defaultEpubReadingProgression;
      _imageFilter = _defaultEpubImageFilter;
    });

    final prefs = ref.read(sharedPreferencesProvider);
    prefs.setDouble(_fontScaleKey, _defaultEpubFontScale);
    prefs.setInt(_fontFamilyKey, _defaultEpubFont.index);
    prefs.setInt(_themeKey, _defaultEpubTheme.index);
    prefs.setDouble(_lineHeightKey, _defaultEpubLineHeight);
    prefs.setDouble(_pageMarginsKey, _defaultEpubPageMargins);
    prefs.setDouble(_wordSpacingKey, _defaultEpubWordSpacing);
    prefs.setDouble(_letterSpacingKey, _defaultEpubLetterSpacing);
    prefs.setInt(_textAlignKey, _defaultEpubTextAlign.index);
    prefs.setBool(_publisherStylesKey, _defaultEpubPublisherStyles);
    prefs.setBool(_normalizeTextKey, _defaultEpubTextNormalization);
    prefs.setBool(_ligaturesKey, _defaultEpubLigatures);
    prefs.setBool(_hyphensKey, _defaultEpubHyphens);
    prefs.setInt(_readingProgressionKey, _defaultEpubReadingProgression.index);
    prefs.remove(_imageFilterKey);

    unawaited(
      () async {
        final patches = [
          EPUBPreferences(
            backgroundColor: _defaultEpubTheme.background,
            textColor: _defaultEpubTheme.foreground,
            publisherStyles: _defaultEpubPublisherStyles,
          ),
          EPUBPreferences(fontSize: _defaultEpubFontScale),
          EPUBPreferences(fontFamily: _defaultEpubFont.css),
          EPUBPreferences(lineHeight: _defaultEpubLineHeight),
          EPUBPreferences(pageMargins: _defaultEpubPageMargins),
          EPUBPreferences(wordSpacing: _defaultEpubWordSpacing),
          EPUBPreferences(letterSpacing: _defaultEpubLetterSpacing),
          EPUBPreferences(textAlign: _defaultEpubTextAlign),
          EPUBPreferences(textNormalization: _defaultEpubTextNormalization),
          EPUBPreferences(ligatures: _defaultEpubLigatures),
          EPUBPreferences(hyphens: _defaultEpubHyphens),
          EPUBPreferences(readingProgression: _defaultEpubReadingProgression),
        ];

        for (final patch in patches) {
          await _applyEpubPreferences(patch);
        }
      }().catchError((Object e) {
        if (mounted) {
          setState(() => _error = 'Could not reset EPUB preferences:\n$e');
        }
      }),
    );
  }

  void _setPdfFit(PDFFit val) {
    setState(() => _pdfFit = val);
    ref.read(sharedPreferencesProvider).setInt(_pdfFitKey, val.index);
    _applyPreferencesNow();
  }

  void _setPdfSpread(PDFSpread val) {
    setState(() => _pdfSpread = val);
    ref.read(sharedPreferencesProvider).setInt(_pdfSpreadKey, val.index);
    _applyPreferencesNow();
  }

  // --- TTS Handling ---

  Future<void> _toggleTts() async {
    if (_ttsActive) {
      await _reader.stop();
      if (!mounted) return;
      setState(() => _ttsActive = false);
    } else {
      await _reader.ttsEnable(null);
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

  void _updateTtsPreferences() {
    if (!_ttsActive) return;
    _reader.ttsSetPreferences(
      TTSPreferences(speed: _speechRate, pitch: _pitch),
    );
    if (_selectedVoice != null) {
      _reader.ttsSetVoice(_selectedVoice!.identifier, null);
    }
  }

  void _openTtsSettings() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _readerPanelColor,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _TtsSettingsSheet(
        voices: _voices,
        selectedVoice: _selectedVoice,
        speechRate: _speechRate,
        pitch: _pitch,
        onSpeechRateChanged: (val) {
          setState(() {
            _speechRate = val;
            ref.read(sharedPreferencesProvider).setDouble(_speechRateKey, val);
          });
          _updateTtsPreferences();
        },
        onPitchChanged: (val) {
          setState(() {
            _pitch = val;
            ref.read(sharedPreferencesProvider).setDouble(_pitchKey, val);
          });
          _updateTtsPreferences();
        },
        onVoiceChanged: (voice) {
          setState(() {
            _selectedVoice = voice;
            if (voice != null) {
              _ttsVoiceIdentifier = voice.identifier;
              ref
                  .read(sharedPreferencesProvider)
                  .setString(_ttsVoiceKey, voice.identifier);
            }
          });
          _updateTtsPreferences();
        },
      ),
    );
  }

  void _openSearchSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _readerPanelColor,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _SearchSheet(
        reader: _reader,
        onTap: (locator) {
          Navigator.of(context).pop();
          _reader.goToLocator(locator);
        },
      ),
    );
  }

  void _openToc() {
    final pub = _pub;
    if (pub == null) return;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _readerPanelColor,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _TocSheet(
        entries: pub.toc,
        onTap: (link) {
          Navigator.of(context).pop();
          _reader.goByLink(link, pub);
        },
      ),
    );
  }

  void _openSettingsSheet() {
    final ext = widget.comic.extension?.toLowerCase();
    var fontScale = _fontScale;
    var font = _font;
    var theme = _theme;
    var lineHeight = _lineHeight;
    var pageMargins = _pageMargins;
    var wordSpacing = _wordSpacing;
    var letterSpacing = _letterSpacing;
    var textAlign = _textAlign;
    var publisherStyles = _publisherStyles;
    var textNormalization = _textNormalization;
    var ligatures = _ligatures;
    var hyphens = _hyphens;
    var readingProgression = _readingProgression;
    var imageFilter = _imageFilter;
    var pdfFit = _pdfFit;
    var pdfSpread = _pdfSpread;
    var readingDirection = ref.read(readingDirectionProvider);
    var upscale = ref.read(upscaleProvider);

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: _readerPanelColor,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setSheetState) {
          if (ext == 'epub') {
            return _TypographySheet(
              fontScale: fontScale,
              font: font,
              theme: theme,
              lineHeight: lineHeight,
              pageMargins: pageMargins,
              wordSpacing: wordSpacing,
              letterSpacing: letterSpacing,
              textAlign: textAlign,
              publisherStyles: publisherStyles,
              textNormalization: textNormalization,
              ligatures: ligatures,
              hyphens: hyphens,
              readingProgression: readingProgression,
              imageFilter: imageFilter,
              onFontScale: (val) {
                final next = val.clamp(0.5, 2.5).toDouble();
                setSheetState(() {
                  publisherStyles = false;
                  fontScale = next;
                });
                _setFontScale(next);
              },
              onFont: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  font = val;
                });
                _setFont(val);
              },
              onTheme: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  theme = val;
                });
                _setTheme(val);
              },
              onLineHeight: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  lineHeight = val;
                });
                _setLineHeight(val);
              },
              onPageMargins: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  pageMargins = val;
                });
                _setPageMargins(val);
              },
              onWordSpacing: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  wordSpacing = val;
                });
                _setWordSpacing(val);
              },
              onLetterSpacing: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  letterSpacing = val;
                });
                _setLetterSpacing(val);
              },
              onTextAlign: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  textAlign = val;
                });
                _setTextAlign(val);
              },
              onPublisherStyles: (val) {
                setSheetState(() => publisherStyles = val);
                _setPublisherStyles(val);
              },
              onTextNormalization: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  textNormalization = val;
                });
                _setTextNormalization(val);
              },
              onLigatures: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  ligatures = val;
                });
                _setLigatures(val);
              },
              onHyphens: (val) {
                setSheetState(() {
                  publisherStyles = false;
                  hyphens = val;
                });
                _setHyphens(val);
              },
              onReadingProgression: (val) {
                setSheetState(() => readingProgression = val);
                _setReadingProgression(val);
              },
              onImageFilter: (val) {
                setSheetState(() => imageFilter = val);
                _setImageFilter(val);
              },
              onReset: () {
                setSheetState(() {
                  fontScale = _defaultEpubFontScale;
                  font = _defaultEpubFont;
                  theme = _defaultEpubTheme;
                  lineHeight = _defaultEpubLineHeight;
                  pageMargins = _defaultEpubPageMargins;
                  wordSpacing = _defaultEpubWordSpacing;
                  letterSpacing = _defaultEpubLetterSpacing;
                  textAlign = _defaultEpubTextAlign;
                  publisherStyles = _defaultEpubPublisherStyles;
                  textNormalization = _defaultEpubTextNormalization;
                  ligatures = _defaultEpubLigatures;
                  hyphens = _defaultEpubHyphens;
                  readingProgression = _defaultEpubReadingProgression;
                  imageFilter = _defaultEpubImageFilter;
                });
                _resetEpubSettings();
              },
            );
          } else if (ext == 'pdf') {
            return _PdfSettingsSheet(
              fit: pdfFit,
              spread: pdfSpread,
              onFitChanged: (val) {
                setSheetState(() => pdfFit = val);
                _setPdfFit(val);
              },
              onSpreadChanged: (val) {
                setSheetState(() => pdfSpread = val);
                _setPdfSpread(val);
              },
            );
          } else {
            return _ComicSettingsSheet(
              readingDirection: readingDirection,
              upscale: upscale,
              onReadingDirectionChanged: (val) {
                setSheetState(() => readingDirection = val);
                ref.read(readingDirectionProvider.notifier).set(val);
              },
              onUpscaleChanged: (val) {
                setSheetState(() => upscale = val);
                ref.read(upscaleProvider.notifier).set(val);
                // Note: changing upscale requires reloading the manifest,
                // which isn't dynamically supported by Readium without reopening.
                // We just persist it for the next open.
              },
            );
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(readingModeProvider);
    final pub = _pub;
    final ext = widget.comic.extension?.toLowerCase();
    final isEpub = ext == 'epub';
    final isComic = ext == 'cbz' || ext == 'cbt';
    final readerMode = isEpub ? _effectiveEpubMode(mode) : mode;

    final scaffoldBg = ext == 'epub' ? _theme.background : Colors.black;

    return Scaffold(
      backgroundColor: scaffoldBg,
      appBar: _chrome
          ? AppBar(
              backgroundColor: _readerChromeColor,
              elevation: 0,
              foregroundColor: Colors.white,
              scrolledUnderElevation: 0,
              toolbarHeight: 52,
              title: Text(
                widget.comic.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                if (pub != null && pub.toc.isNotEmpty)
                  IconButton(
                    tooltip: 'Contents',
                    icon: const Icon(Icons.toc),
                    onPressed: _openToc,
                  ),
                if (pub != null && !isComic)
                  IconButton(
                    tooltip: 'Search',
                    icon: const Icon(Icons.search),
                    onPressed: _openSearchSheet,
                  ),
                if (pub != null && !isComic)
                  IconButton(
                    tooltip: _ttsActive ? 'Stop TTS' : 'Read Aloud (TTS)',
                    icon: Icon(
                      _ttsActive ? Icons.volume_off : Icons.volume_up,
                      color: _ttsActive
                          ? Theme.of(context).colorScheme.primary
                          : Colors.white,
                    ),
                    onPressed: _toggleTts,
                  ),
                ReadingModeMenu(
                  mode: readerMode,
                  modes: isEpub
                      ? const [ReadingMode.single, ReadingMode.doublePage]
                      : const [
                          ReadingMode.single,
                          ReadingMode.doublePage,
                          ReadingMode.scroll,
                        ],
                  onSelected: _setReaderMode,
                ),
                IconButton(
                  tooltip: 'Preferences',
                  icon: const Icon(Icons.settings),
                  onPressed: pub == null ? null : _openSettingsSheet,
                ),
                if (Platform.isMacOS)
                  IconButton(
                    tooltip: 'Fullscreen (f)',
                    icon: const Icon(Icons.fullscreen),
                    onPressed: WindowControl.toggleFullscreen,
                  ),
              ],
            )
          : null,
      body: _error != null
          ? ReaderMessage(message: _error!)
          : pub == null
          ? const Center(child: CircularProgressIndicator())
          : ReaderKeyboard(
              onNext: () => _reader.goForward(),
              onPrev: () => _reader.goBackward(),
              onZoomIn: () {
                if (ext == 'epub') _setFontScale(_fontScale + 0.1);
              },
              onZoomOut: () {
                if (ext == 'epub') _setFontScale(_fontScale - 0.1);
              },
              onZoomReset: () {
                if (ext == 'epub') _setFontScale(1.0);
              },
              onToggleFullscreen: WindowControl.toggleFullscreen,
              child: Column(
                children: [
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onTapUp: (details) {
                        // Tap centre of screen to toggle chrome
                        final width = MediaQuery.of(context).size.width;
                        final x = details.localPosition.dx;
                        if (x > width * 0.3 && x < width * 0.7) {
                          _toggleChrome();
                        }
                      },
                      child: ReadiumReaderWidget(
                        key: ValueKey(_readerViewRevision),
                        publication: pub,
                        initialLocator: _initialLocator,
                      ),
                    ),
                  ),
                  _ttsControlsBar(context),
                  if (_chrome) _progressBar(context),
                ],
              ),
            ),
    );
  }

  Widget _ttsControlsBar(BuildContext context) {
    if (!_ttsActive) return const SizedBox.shrink();

    final isPlaying = _ttsState?.state == TimebasedState.playing;
    final isLoading = _ttsState?.state == TimebasedState.loading;

    return Container(
      color: const Color(0xFF1C1C1E),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            tooltip: 'Read Aloud Settings',
            icon: const Icon(Icons.settings, color: Colors.white70),
            onPressed: _openTtsSettings,
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                tooltip: 'Previous',
                icon: const Icon(Icons.skip_previous, color: Colors.white),
                onPressed: () => _reader.previous(),
              ),
              const SizedBox(width: 8),
              if (isLoading)
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              else
                IconButton(
                  tooltip: isPlaying ? 'Pause' : 'Play',
                  icon: Icon(
                    isPlaying
                        ? Icons.pause_circle_filled
                        : Icons.play_circle_filled,
                    size: 36,
                    color: Colors.white,
                  ),
                  onPressed: () {
                    if (isPlaying) {
                      _reader.pause();
                    } else {
                      _reader.resume();
                    }
                  },
                ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Next',
                icon: const Icon(Icons.skip_next, color: Colors.white),
                onPressed: () => _reader.next(),
              ),
            ],
          ),
          IconButton(
            tooltip: 'Stop',
            icon: const Icon(Icons.stop, color: Colors.white70),
            onPressed: _toggleTts,
          ),
        ],
      ),
    );
  }

  Widget _progressBar(BuildContext context) {
    final rawProgression = _locator?.locations?.progression ?? 0.0;
    final progression = rawProgression.clamp(0.0, 1.0).toDouble();
    final percent = (progression * 100).round();

    return Container(
      color: _readerChromeColor,
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: 8 + MediaQuery.of(context).padding.bottom,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          const labelWidth = 42.0;
          const gap = 16.0;
          final sliderWidth = math.max(
            240.0,
            constraints.maxWidth - labelWidth - gap,
          );
          final totalWidth = sliderWidth + gap + labelWidth;

          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: math.max(constraints.maxWidth, totalWidth),
              child: Row(
                children: [
                  SizedBox(
                    width: sliderWidth,
                    child: SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        trackHeight: 4,
                        thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 6,
                        ),
                        overlayShape: const RoundSliderOverlayShape(
                          overlayRadius: 14,
                        ),
                        activeTrackColor: Theme.of(context).colorScheme.primary,
                        inactiveTrackColor: Colors.white24,
                        thumbColor: Theme.of(context).colorScheme.primary,
                      ),
                      child: Slider(
                        value: progression,
                        onChanged: (val) {
                          _reader.goToProgression(val);
                        },
                      ),
                    ),
                  ),
                  const SizedBox(width: gap),
                  SizedBox(
                    width: labelWidth,
                    child: Text(
                      '$percent%',
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// --- Sheets & Modals ---

Widget _readerChoiceButton(
  BuildContext context, {
  required bool selected,
  required VoidCallback onPressed,
  required Widget child,
  double minWidth = 96,
}) {
  final scheme = Theme.of(context).colorScheme;
  return ConstrainedBox(
    constraints: BoxConstraints(minWidth: minWidth, minHeight: 40),
    child: FilledButton.tonal(
      style: FilledButton.styleFrom(
        backgroundColor: selected ? scheme.primary : _readerControlColor,
        foregroundColor: selected ? Colors.black : Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
      onPressed: onPressed,
      child: child,
    ),
  );
}

class _TocSheet extends StatelessWidget {
  const _TocSheet({required this.entries, required this.onTap});

  final List<Link> entries;
  final ValueChanged<Link> onTap;

  // Flattens the toc tree into (link, depth) pairs so nested chapters (e.g.
  // under "Part One") render indented instead of being dropped — a flat
  // top-level-only list silently loses every sub-chapter.
  List<(Link, int)> _flatten(List<Link> links, int depth) {
    final out = <(Link, int)>[];
    for (final link in links) {
      out.add((link, depth));
      out.addAll(_flatten(link.children, depth + 1));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _flatten(entries, 0);
    return Container(
      height: MediaQuery.of(context).size.height * 0.65,
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Text(
              'Table of Contents',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          Expanded(
            child: rows.isEmpty
                ? const Center(
                    child: Text(
                      'This book has no table of contents.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  )
                : ListView.separated(
                    itemCount: rows.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Colors.white10, height: 1),
                    itemBuilder: (context, index) {
                      final (link, depth) = rows[index];
                      return ListTile(
                        contentPadding: EdgeInsets.only(
                          left: 20 + depth * 16.0,
                          right: 20,
                        ),
                        title: Text(
                          link.title ?? 'Chapter ${index + 1}',
                          style: const TextStyle(color: Colors.white),
                        ),
                        onTap: () => onTap(link),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _SearchSheet extends StatefulWidget {
  const _SearchSheet({required this.reader, required this.onTap});

  final FlutterReadium reader;
  final ValueChanged<Locator> onTap;

  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  final TextEditingController _query = TextEditingController();
  List<TextSearchResult> _results = [];
  bool _searching = false;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _doSearch() async {
    final text = _query.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _searching = true;
      _results = [];
    });
    try {
      final res = await widget.reader.searchInPublication(text);
      if (mounted) setState(() => _results = res);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _query,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search book...',
                hintStyle: const TextStyle(color: Colors.white30),
                filled: true,
                fillColor: _readerControlColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.search, color: Colors.white70),
                  onPressed: _doSearch,
                ),
              ),
              onSubmitted: (_) => _doSearch(),
            ),
          ),
          if (_searching)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_results.isEmpty)
            const Expanded(
              child: Center(
                child: Text(
                  'No results',
                  style: TextStyle(color: Colors.white30),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                itemCount: _results.length,
                separatorBuilder: (context, index) =>
                    const Divider(color: Colors.white12, height: 1),
                itemBuilder: (context, index) {
                  final res = _results[index];
                  final before = res.locator.text?.before ?? '';
                  final highlight = res.locator.text?.highlight ?? '';
                  final after = res.locator.text?.after ?? '';

                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 8,
                    ),
                    title: RichText(
                      text: TextSpan(
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
                        children: [
                          TextSpan(text: before),
                          TextSpan(
                            text: highlight,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontWeight: FontWeight.bold,
                              backgroundColor: Theme.of(
                                context,
                              ).colorScheme.primary.withValues(alpha: 0.15),
                            ),
                          ),
                          TextSpan(text: after),
                        ],
                      ),
                    ),
                    subtitle: Text(
                      res.locator.title ?? '',
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 11,
                      ),
                    ),
                    onTap: () => widget.onTap(res.locator),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _TypographySheet extends StatelessWidget {
  const _TypographySheet({
    required this.fontScale,
    required this.font,
    required this.theme,
    required this.lineHeight,
    required this.pageMargins,
    required this.wordSpacing,
    required this.letterSpacing,
    required this.textAlign,
    required this.publisherStyles,
    required this.textNormalization,
    required this.ligatures,
    required this.hyphens,
    required this.readingProgression,
    required this.imageFilter,
    required this.onFontScale,
    required this.onFont,
    required this.onTheme,
    required this.onLineHeight,
    required this.onPageMargins,
    required this.onWordSpacing,
    required this.onLetterSpacing,
    required this.onTextAlign,
    required this.onPublisherStyles,
    required this.onTextNormalization,
    required this.onLigatures,
    required this.onHyphens,
    required this.onReadingProgression,
    required this.onImageFilter,
    required this.onReset,
  });

  final double fontScale;
  final EpubFont font;
  final EpubReaderTheme theme;
  final double lineHeight;
  final double pageMargins;
  final double wordSpacing;
  final double letterSpacing;
  final TextAlign textAlign;
  final bool publisherStyles;
  final bool textNormalization;
  final bool ligatures;
  final bool hyphens;
  final EpubReadingProgression readingProgression;
  final EpubImageFilter? imageFilter;

  final ValueChanged<double> onFontScale;
  final ValueChanged<EpubFont> onFont;
  final ValueChanged<EpubReaderTheme> onTheme;
  final ValueChanged<double> onLineHeight;
  final ValueChanged<double> onPageMargins;
  final ValueChanged<double> onWordSpacing;
  final ValueChanged<double> onLetterSpacing;
  final ValueChanged<TextAlign> onTextAlign;
  final ValueChanged<bool> onPublisherStyles;
  final ValueChanged<bool> onTextNormalization;
  final ValueChanged<bool> onLigatures;
  final ValueChanged<bool> onHyphens;
  final ValueChanged<EpubReadingProgression> onReadingProgression;
  final ValueChanged<EpubImageFilter?> onImageFilter;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Container(
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.only(bottom: 24),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 12, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: TabBar(
                      labelColor: Colors.white,
                      unselectedLabelColor: Colors.white38,
                      indicatorColor: Colors.white,
                      tabs: [
                        Tab(text: 'Text & Spacing'),
                        Tab(text: 'Layout & Options'),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Reset settings',
                    icon: const Icon(Icons.restart_alt),
                    color: Colors.white70,
                    onPressed: onReset,
                  ),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _buildTextSpacingTab(context),
                  _buildLayoutTab(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextSpacingTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Theme',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: EpubReaderTheme.values.map((t) {
              final active = t == theme;
              return _readerChoiceButton(
                context,
                selected: active,
                onPressed: () => onTheme(t),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(t.icon, size: 16),
                    const SizedBox(width: 8),
                    Text(t.label),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Font size',
                style: TextStyle(color: Colors.white, fontSize: 15),
              ),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.remove, color: Colors.white),
                    onPressed: () => onFontScale(fontScale - 0.1),
                  ),
                  Text(
                    '${(fontScale * 100).round()}%',
                    style: const TextStyle(color: Colors.white),
                  ),
                  IconButton(
                    icon: const Icon(Icons.add, color: Colors.white),
                    onPressed: () => onFontScale(fontScale + 0.1),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Font Family',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: EpubFont.values.map((f) {
              final active = f == font;
              return _readerChoiceButton(
                context,
                selected: active,
                onPressed: () => onFont(f),
                child: Text(f.label),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          _sliderRow('Line height', lineHeight, 0.8, 2.0, onLineHeight),
          _sliderRow('Margins', pageMargins, 0.5, 2.0, onPageMargins),
          _sliderRow('Word spacing', wordSpacing, -0.2, 1.0, onWordSpacing),
          _sliderRow(
            'Letter spacing',
            letterSpacing,
            -0.1,
            0.5,
            onLetterSpacing,
          ),
        ],
      ),
    );
  }

  Widget _buildLayoutTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Text Alignment',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _alignBtn(context, TextAlign.left, Icons.format_align_left),
              _alignBtn(context, TextAlign.center, Icons.format_align_center),
              _alignBtn(context, TextAlign.right, Icons.format_align_right),
              _alignBtn(context, TextAlign.justify, Icons.format_align_justify),
            ],
          ),
          const SizedBox(height: 20),
          _switchRow('Publisher styles', publisherStyles, onPublisherStyles),
          _switchRow(
            'Text normalization',
            textNormalization,
            onTextNormalization,
          ),
          _switchRow('Ligatures', ligatures, onLigatures),
          _switchRow('Hyphens', hyphens, onHyphens),
          const SizedBox(height: 16),
          const Text(
            'Reading Progression',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _readerChoiceButton(
                context,
                selected: readingProgression == EpubReadingProgression.ltr,
                minWidth: 144,
                onPressed: () =>
                    onReadingProgression(EpubReadingProgression.ltr),
                child: const Text('Left to right'),
              ),
              _readerChoiceButton(
                context,
                selected: readingProgression == EpubReadingProgression.rtl,
                minWidth: 144,
                onPressed: () =>
                    onReadingProgression(EpubReadingProgression.rtl),
                child: const Text('Right to left'),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text(
            'Image Filter',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _readerChoiceButton(
                context,
                selected: imageFilter == null,
                onPressed: () => onImageFilter(null),
                child: const Text('None'),
              ),
              ...EpubImageFilter.values.map((f) {
                final active = f == imageFilter;
                return _readerChoiceButton(
                  context,
                  selected: active,
                  onPressed: () => onImageFilter(f),
                  child: Text(f.name),
                );
              }),
            ],
          ),
        ],
      ),
    );
  }

  Widget _alignBtn(BuildContext context, TextAlign align, IconData icon) {
    final active = textAlign == align;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: IconButton(
          style: IconButton.styleFrom(
            backgroundColor: active
                ? Theme.of(context).colorScheme.primary
                : _readerControlColor,
            foregroundColor: active ? Colors.black : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          icon: Icon(icon),
          onPressed: () => onTextAlign(align),
        ),
      ),
    );
  }

  Widget _sliderRow(
    String label,
    double val,
    double min,
    double max,
    ValueChanged<double> onChange,
  ) {
    return Row(
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 14),
          ),
        ),
        Expanded(
          child: Slider(value: val, min: min, max: max, onChanged: onChange),
        ),
        Text(
          val.toStringAsFixed(1),
          style: const TextStyle(color: Colors.white70, fontSize: 13),
        ),
      ],
    );
  }

  Widget _switchRow(String label, bool val, ValueChanged<bool> onChange) {
    return SwitchListTile(
      title: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 14),
      ),
      value: val,
      onChanged: onChange,
      contentPadding: EdgeInsets.zero,
      activeThumbColor: Colors.white,
      activeTrackColor: Colors.white54,
      inactiveThumbColor: Colors.white38,
      inactiveTrackColor: Colors.white10,
    );
  }
}

class _TtsSettingsSheet extends StatefulWidget {
  const _TtsSettingsSheet({
    required this.voices,
    required this.selectedVoice,
    required this.speechRate,
    required this.pitch,
    required this.onSpeechRateChanged,
    required this.onPitchChanged,
    required this.onVoiceChanged,
  });

  final List<ReaderTTSVoice> voices;
  final ReaderTTSVoice? selectedVoice;
  final double speechRate;
  final double pitch;
  final ValueChanged<double> onSpeechRateChanged;
  final ValueChanged<double> onPitchChanged;
  final ValueChanged<ReaderTTSVoice?> onVoiceChanged;

  @override
  State<_TtsSettingsSheet> createState() => _TtsSettingsSheetState();
}

class _TtsSettingsSheetState extends State<_TtsSettingsSheet> {
  late double _speechRate;
  late double _pitch;
  ReaderTTSVoice? _selectedVoice;

  @override
  void initState() {
    super.initState();
    _speechRate = widget.speechRate;
    _pitch = widget.pitch;
    _selectedVoice = widget.selectedVoice;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Read Aloud Settings',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              const SizedBox(
                width: 80,
                child: Text('Speed', style: TextStyle(color: Colors.white70)),
              ),
              Expanded(
                child: Slider(
                  value: _speechRate,
                  min: 0.5,
                  max: 2.0,
                  divisions: 6,
                  label: '${_speechRate}x',
                  onChanged: (val) {
                    setState(() => _speechRate = val);
                    widget.onSpeechRateChanged(val);
                  },
                ),
              ),
              Text(
                '${_speechRate.toStringAsFixed(1)}x',
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const SizedBox(
                width: 80,
                child: Text('Pitch', style: TextStyle(color: Colors.white70)),
              ),
              Expanded(
                child: Slider(
                  value: _pitch,
                  min: 0.5,
                  max: 1.5,
                  divisions: 10,
                  label: '$_pitch',
                  onChanged: (val) {
                    setState(() => _pitch = val);
                    widget.onPitchChanged(val);
                  },
                ),
              ),
              Text(
                _pitch.toStringAsFixed(1),
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Voice', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 8),
          Flexible(
            child: widget.voices.isEmpty
                ? const Text(
                    'No voices available',
                    style: TextStyle(
                      color: Colors.white30,
                      fontStyle: FontStyle.italic,
                    ),
                  )
                : Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: _readerControlColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<ReaderTTSVoice>(
                        dropdownColor: _readerControlColor,
                        isExpanded: true,
                        value: _selectedVoice,
                        style: const TextStyle(color: Colors.white),
                        iconEnabledColor: Colors.white70,
                        hint: const Text(
                          'Select Voice',
                          style: TextStyle(color: Colors.white38),
                        ),
                        items: widget.voices.map((voice) {
                          final details = [
                            if (voice.language.isNotEmpty) voice.language,
                            voice.gender.name,
                          ].join(', ');
                          return DropdownMenuItem<ReaderTTSVoice>(
                            value: voice,
                            child: Text(
                              '${voice.name} ($details)',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (voice) {
                          setState(() => _selectedVoice = voice);
                          widget.onVoiceChanged(voice);
                        },
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _PdfSettingsSheet extends StatelessWidget {
  const _PdfSettingsSheet({
    required this.fit,
    required this.spread,
    required this.onFitChanged,
    required this.onSpreadChanged,
  });

  final PDFFit fit;
  final PDFSpread spread;
  final ValueChanged<PDFFit> onFitChanged;
  final ValueChanged<PDFSpread> onSpreadChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PDF Preferences',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Page Fit',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: PDFFit.values.map((f) {
              final active = f == fit;
              return _readerChoiceButton(
                context,
                selected: active,
                onPressed: () => onFitChanged(f),
                child: Text(f.name),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          const Text(
            'Synthetic Spread (Dual-Page View)',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: PDFSpread.values.map((s) {
              final active = s == spread;
              return _readerChoiceButton(
                context,
                selected: active,
                onPressed: () => onSpreadChanged(s),
                child: Text(s.name),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _ComicSettingsSheet extends StatelessWidget {
  const _ComicSettingsSheet({
    required this.readingDirection,
    required this.upscale,
    required this.onReadingDirectionChanged,
    required this.onUpscaleChanged,
  });

  final ReadingDirection readingDirection;
  final bool upscale;
  final ValueChanged<ReadingDirection> onReadingDirectionChanged;
  final ValueChanged<bool> onUpscaleChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Comic Preferences',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Reading progression (Page order)',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _readerChoiceButton(
                context,
                selected: readingDirection == ReadingDirection.ltr,
                minWidth: 144,
                onPressed: () =>
                    onReadingDirectionChanged(ReadingDirection.ltr),
                child: const Text('Left to right'),
              ),
              _readerChoiceButton(
                context,
                selected: readingDirection == ReadingDirection.rtl,
                minWidth: 144,
                onPressed: () =>
                    onReadingDirectionChanged(ReadingDirection.rtl),
                child: const Text('Right to left'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text(
            'Rendering',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            title: const Text(
              'HD Upscaling (Remote only)',
              style: TextStyle(color: Colors.white, fontSize: 14),
            ),
            subtitle: const Text(
              'Use Real-ESRGAN GPU upscaling if the server supports it.',
              style: TextStyle(color: Colors.white38, fontSize: 12),
            ),
            value: upscale,
            onChanged: onUpscaleChanged,
            contentPadding: EdgeInsets.zero,
            activeThumbColor: Colors.white,
            activeTrackColor: Colors.white54,
            inactiveThumbColor: Colors.white38,
            inactiveTrackColor: Colors.white10,
          ),
        ],
      ),
    );
  }
}
