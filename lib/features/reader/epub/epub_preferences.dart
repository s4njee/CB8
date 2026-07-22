import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The EPUB reader's persisted view preferences.
///
/// Everything the user can tune in the reader — typography, theme, layout, and
/// the read-aloud (TTS) voice settings — lives here, backed by
/// SharedPreferences so it survives across books and app launches. The reader
/// screen (`unified_reader_screen.dart`) owns one [EpubReaderPreferences]
/// instance; the typography sheet mutates it through the setters below.
///
/// Naming trap: this class is *what the user chose*; Readium's
/// [EPUBPreferences] is a *patch object* sent to the native reader view (null
/// fields mean "leave unchanged"). Each setter persists one field and returns
/// the minimal [EPUBPreferences] patch the caller should forward to the
/// reader, so a single slider tweak doesn't re-send (and re-lay-out) the whole
/// preference set.

/// Font families offered for reflowable text. [css] is the generic CSS family
/// Readium injects; the actual face is whatever the platform maps it to.
enum EpubFont {
  /// Generic sans-serif.
  sansSerif('Sans Serif', 'sans-serif'),

  /// Generic serif (the default — most fiction reads better with serifs).
  serif('Serif', 'serif'),

  /// Generic monospace.
  mono('Monospace', 'monospace');

  const EpubFont(this.label, this.css);

  /// Human-readable name shown in the typography sheet.
  final String label;

  /// CSS `font-family` value sent to Readium.
  final String css;
}

/// Page color schemes for the book canvas. Only the canvas re-colors — the
/// reader chrome stays dark (see `epub_reader_style.dart`).
enum EpubReaderTheme {
  /// True-black warm page, warm off-white text (the Hearth Noir reading look).
  dark('Dark', Icons.dark_mode, 0xFF0D0B0A, 0xFFDDD4C3),

  /// Warm off-white page, near-black text (matches the Folio "light" swatch).
  light('Light', Icons.light_mode, 0xFFF4EFE4, 0xFF2B2620),

  /// Warm paper tone, brown text (matches the Folio "sepia" swatch).
  sepia('Sepia', Icons.local_cafe, 0xFFE8DCC2, 0xFF4A3D28);

  const EpubReaderTheme(this.label, this.icon, this._bg, this._fg);

  /// Human-readable name shown in the typography sheet.
  final String label;

  /// Icon representing the theme in the picker.
  final IconData icon;

  final int _bg;
  final int _fg;

  /// Page background color.
  Color get background => Color(_bg);

  /// Body text color.
  Color get foreground => Color(_fg);
}

// Defaults, applied when a key has never been written (and by [reset]).
const _defaultFontScale = 1.0;
const _defaultFont = EpubFont.serif;
const _defaultTheme = EpubReaderTheme.dark;
const _defaultLineHeight = 1.2;
const _defaultPageMargins = 1.0;
const _defaultWordSpacing = 0.0;
const _defaultLetterSpacing = 0.0;
const _defaultTextAlign = TextAlign.left;
const _defaultPublisherStyles = false;
const _defaultTextNormalization = false;
const _defaultLigatures = true;
const _defaultHyphens = true;
const _defaultReadingProgression = EpubReadingProgression.ltr;

/// SharedPreferences-backed store for the EPUB reader's view settings.
///
/// Read the public fields freely; mutate ONLY through the `set*` methods so
/// every change is persisted and yields the Readium patch that makes it
/// visible in the open book.
class EpubReaderPreferences {
  /// Loads the persisted preferences from [prefs], falling back to defaults
  /// for anything never written (or written by an older app version with a
  /// since-removed enum index — out-of-range indexes are ignored).
  EpubReaderPreferences.load(this._prefs) {
    fontScale = _prefs.getDouble(_fontScaleKey) ?? fontScale;
    font = _indexed(EpubFont.values, _prefs.getInt(_fontFamilyKey)) ?? font;
    theme = _indexed(EpubReaderTheme.values, _prefs.getInt(_themeKey)) ?? theme;
    lineHeight = _prefs.getDouble(_lineHeightKey) ?? lineHeight;
    pageMargins = _prefs.getDouble(_pageMarginsKey) ?? pageMargins;
    wordSpacing = _prefs.getDouble(_wordSpacingKey) ?? wordSpacing;
    letterSpacing = _prefs.getDouble(_letterSpacingKey) ?? letterSpacing;
    textAlign =
        _indexed(TextAlign.values, _prefs.getInt(_textAlignKey)) ?? textAlign;
    publisherStyles = _prefs.getBool(_publisherStylesKey) ?? publisherStyles;
    textNormalization = _prefs.getBool(_normalizeTextKey) ?? textNormalization;
    ligatures = _prefs.getBool(_ligaturesKey) ?? ligatures;
    hyphens = _prefs.getBool(_hyphensKey) ?? hyphens;
    readingProgression =
        _indexed(
          EpubReadingProgression.values,
          _prefs.getInt(_readingProgressionKey),
        ) ??
        readingProgression;
    imageFilter = _indexed(
      EpubImageFilter.values,
      _prefs.getInt(_imageFilterKey),
    );
    ttsSpeechRate = _prefs.getDouble(_speechRateKey) ?? ttsSpeechRate;
    ttsPitch = _prefs.getDouble(_pitchKey) ?? ttsPitch;
    ttsVoiceIdentifier = _prefs.getString(_ttsVoiceKey);
  }

  final SharedPreferences _prefs;

  // SharedPreferences keys. Never reuse or renumber — they're on users' disks.
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
  static const _speechRateKey = 'cb8_tts_speech_rate';
  static const _pitchKey = 'cb8_tts_pitch';
  static const _ttsVoiceKey = 'cb8_tts_voice_identifier';

  /// Body font size as a multiplier of the publication's base size (0.5–2.5).
  double fontScale = _defaultFontScale;

  /// Font family for reflowable text.
  EpubFont font = _defaultFont;

  /// Page color scheme.
  EpubReaderTheme theme = _defaultTheme;

  /// Line height multiplier.
  double lineHeight = _defaultLineHeight;

  /// Page margin multiplier.
  double pageMargins = _defaultPageMargins;

  /// Extra word spacing (em).
  double wordSpacing = _defaultWordSpacing;

  /// Extra letter spacing (em).
  double letterSpacing = _defaultLetterSpacing;

  /// Paragraph alignment.
  TextAlign textAlign = _defaultTextAlign;

  /// Whether the publisher's own CSS wins over the user's typography. Any
  /// typography tweak flips this off — see [_useCustomStyles].
  bool publisherStyles = _defaultPublisherStyles;

  /// Readium's text normalization (accessibility cleanup of the text).
  bool textNormalization = _defaultTextNormalization;

  /// Whether ligatures render.
  bool ligatures = _defaultLigatures;

  /// Whether words hyphenate at line breaks.
  bool hyphens = _defaultHyphens;

  /// Page-turn direction (LTR / RTL).
  EpubReadingProgression readingProgression = _defaultReadingProgression;

  /// Optional filter applied to images (e.g. invert for dark mode). Null means
  /// no filter — stored as an *absent* key, since there's no "none" enum value.
  EpubImageFilter? imageFilter;

  /// Read-aloud speech rate multiplier.
  double ttsSpeechRate = 1.0;

  /// Read-aloud voice pitch.
  double ttsPitch = 1.0;

  /// Identifier of the preferred TTS voice, or null if never chosen. Kept as a
  /// string (not a voice object) because the available voices are only known
  /// once the TTS engine is queried at runtime.
  String? ttsVoiceIdentifier;

  /// Enum lookup guarded against stale/corrupt persisted indexes.
  static T? _indexed<T>(List<T> values, int? index) =>
      index != null && index >= 0 && index < values.length
      ? values[index]
      : null;

  /// Turning any typography knob implies the user wants *their* styles, so
  /// silently drop publisher styles (persisted too) instead of making them
  /// toggle it off first and wonder why the slider did nothing.
  void _useCustomStyles() {
    if (!publisherStyles) return;
    publisherStyles = false;
    _prefs.setBool(_publisherStylesKey, false);
  }

  // --- Setters -------------------------------------------------------------
  // Each mutates + persists one field and returns the minimal Readium patch to
  // apply. Typography patches always carry [publisherStyles] because the
  // setter may have just flipped it off via [_useCustomStyles].

  /// Sets the font size multiplier (clamped to 0.5–2.5).
  EPUBPreferences setFontScale(double value) {
    _useCustomStyles();
    fontScale = value.clamp(0.5, 2.5);
    _prefs.setDouble(_fontScaleKey, fontScale);
    return EPUBPreferences(
      fontSize: fontScale,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the font family.
  EPUBPreferences setFont(EpubFont value) {
    _useCustomStyles();
    font = value;
    _prefs.setInt(_fontFamilyKey, value.index);
    return EPUBPreferences(
      fontFamily: font.css,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the page color scheme.
  EPUBPreferences setTheme(EpubReaderTheme value) {
    _useCustomStyles();
    theme = value;
    _prefs.setInt(_themeKey, value.index);
    return EPUBPreferences(
      backgroundColor: theme.background,
      textColor: theme.foreground,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the line height multiplier.
  EPUBPreferences setLineHeight(double value) {
    _useCustomStyles();
    lineHeight = value;
    _prefs.setDouble(_lineHeightKey, value);
    return EPUBPreferences(lineHeight: value, publisherStyles: publisherStyles);
  }

  /// Sets the page margin multiplier.
  EPUBPreferences setPageMargins(double value) {
    _useCustomStyles();
    pageMargins = value;
    _prefs.setDouble(_pageMarginsKey, value);
    return EPUBPreferences(
      pageMargins: value,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the extra word spacing.
  EPUBPreferences setWordSpacing(double value) {
    _useCustomStyles();
    wordSpacing = value;
    _prefs.setDouble(_wordSpacingKey, value);
    return EPUBPreferences(
      wordSpacing: value,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the extra letter spacing.
  EPUBPreferences setLetterSpacing(double value) {
    _useCustomStyles();
    letterSpacing = value;
    _prefs.setDouble(_letterSpacingKey, value);
    return EPUBPreferences(
      letterSpacing: value,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets the paragraph alignment.
  EPUBPreferences setTextAlign(TextAlign value) {
    _useCustomStyles();
    textAlign = value;
    _prefs.setInt(_textAlignKey, value.index);
    return EPUBPreferences(textAlign: value, publisherStyles: publisherStyles);
  }

  /// Sets whether the publisher's CSS wins. The one typography toggle that
  /// does NOT go through [_useCustomStyles] — it *is* that switch.
  EPUBPreferences setPublisherStyles(bool value) {
    publisherStyles = value;
    _prefs.setBool(_publisherStylesKey, value);
    return EPUBPreferences(publisherStyles: value);
  }

  /// Sets text normalization.
  EPUBPreferences setTextNormalization(bool value) {
    _useCustomStyles();
    textNormalization = value;
    _prefs.setBool(_normalizeTextKey, value);
    return EPUBPreferences(
      textNormalization: value,
      publisherStyles: publisherStyles,
    );
  }

  /// Sets ligature rendering.
  EPUBPreferences setLigatures(bool value) {
    _useCustomStyles();
    ligatures = value;
    _prefs.setBool(_ligaturesKey, value);
    return EPUBPreferences(ligatures: value, publisherStyles: publisherStyles);
  }

  /// Sets hyphenation.
  EPUBPreferences setHyphens(bool value) {
    _useCustomStyles();
    hyphens = value;
    _prefs.setBool(_hyphensKey, value);
    return EPUBPreferences(hyphens: value, publisherStyles: publisherStyles);
  }

  /// Sets the page-turn direction. A layout choice, not typography, so it
  /// leaves publisher styles alone.
  EPUBPreferences setReadingProgression(EpubReadingProgression value) {
    readingProgression = value;
    _prefs.setInt(_readingProgressionKey, value.index);
    return EPUBPreferences(readingProgression: value);
  }

  /// Sets (or clears, with null) the image filter. Note the returned patch
  /// can't express "remove the filter" — null in a Readium patch means "leave
  /// unchanged" — so clearing only takes full effect on the next open.
  EPUBPreferences setImageFilter(EpubImageFilter? value) {
    imageFilter = value;
    if (value != null) {
      _prefs.setInt(_imageFilterKey, value.index);
    } else {
      _prefs.remove(_imageFilterKey);
    }
    return EPUBPreferences(imageFilter: value);
  }

  /// Sets the read-aloud speech rate. TTS settings patch through Readium's
  /// `TTSPreferences` (the reader screen handles that), not [EPUBPreferences],
  /// so these three return nothing.
  void setTtsSpeechRate(double value) {
    ttsSpeechRate = value;
    _prefs.setDouble(_speechRateKey, value);
  }

  /// Sets the read-aloud pitch.
  void setTtsPitch(double value) {
    ttsPitch = value;
    _prefs.setDouble(_pitchKey, value);
  }

  /// Sets the preferred read-aloud voice.
  void setTtsVoice(String identifier) {
    ttsVoiceIdentifier = identifier;
    _prefs.setString(_ttsVoiceKey, identifier);
  }

  /// Restores every view setting (not the TTS voice settings) to its default,
  /// persists them, and returns the patches to apply — in the same
  /// one-field-at-a-time shape the individual setters produce, applied in
  /// order by the caller. There is no image-filter patch: null means "leave
  /// unchanged" in a patch (see [setImageFilter]), so a previously-set filter
  /// clears on the next open.
  List<EPUBPreferences> reset() {
    fontScale = _defaultFontScale;
    font = _defaultFont;
    theme = _defaultTheme;
    lineHeight = _defaultLineHeight;
    pageMargins = _defaultPageMargins;
    wordSpacing = _defaultWordSpacing;
    letterSpacing = _defaultLetterSpacing;
    textAlign = _defaultTextAlign;
    publisherStyles = _defaultPublisherStyles;
    textNormalization = _defaultTextNormalization;
    ligatures = _defaultLigatures;
    hyphens = _defaultHyphens;
    readingProgression = _defaultReadingProgression;
    imageFilter = null;

    _prefs.setDouble(_fontScaleKey, fontScale);
    _prefs.setInt(_fontFamilyKey, font.index);
    _prefs.setInt(_themeKey, theme.index);
    _prefs.setDouble(_lineHeightKey, lineHeight);
    _prefs.setDouble(_pageMarginsKey, pageMargins);
    _prefs.setDouble(_wordSpacingKey, wordSpacing);
    _prefs.setDouble(_letterSpacingKey, letterSpacing);
    _prefs.setInt(_textAlignKey, textAlign.index);
    _prefs.setBool(_publisherStylesKey, publisherStyles);
    _prefs.setBool(_normalizeTextKey, textNormalization);
    _prefs.setBool(_ligaturesKey, ligatures);
    _prefs.setBool(_hyphensKey, hyphens);
    _prefs.setInt(_readingProgressionKey, readingProgression.index);
    _prefs.remove(_imageFilterKey);

    return [
      EPUBPreferences(
        backgroundColor: theme.background,
        textColor: theme.foreground,
        publisherStyles: publisherStyles,
      ),
      EPUBPreferences(fontSize: fontScale),
      EPUBPreferences(fontFamily: font.css),
      EPUBPreferences(lineHeight: lineHeight),
      EPUBPreferences(pageMargins: pageMargins),
      EPUBPreferences(wordSpacing: wordSpacing),
      EPUBPreferences(letterSpacing: letterSpacing),
      EPUBPreferences(textAlign: textAlign),
      EPUBPreferences(textNormalization: textNormalization),
      EPUBPreferences(ligatures: ligatures),
      EPUBPreferences(hyphens: hyphens),
      EPUBPreferences(readingProgression: readingProgression),
    ];
  }

  /// The complete persisted set as one patch, sent when the reader reports
  /// ready. It must carry *everything* — sending only theme/columns left a
  /// restored font size shown in the settings sheet but never applied to the
  /// rendered book until the user nudged that control (bugs.md #9).
  ///
  /// [columnCount] comes from the global reading mode (single/two-page);
  /// `scroll` stays false because Readium's scroll is per-resource, which
  /// reads poorly for whole books (see later.md).
  EPUBPreferences fullPreferences({required EpubColumnCount columnCount}) {
    return EPUBPreferences(
      backgroundColor: theme.background,
      textColor: theme.foreground,
      publisherStyles: publisherStyles,
      columnCount: columnCount,
      scroll: false,
      fontSize: fontScale,
      fontFamily: font.css,
      lineHeight: lineHeight,
      pageMargins: pageMargins,
      wordSpacing: wordSpacing,
      letterSpacing: letterSpacing,
      textAlign: textAlign,
      textNormalization: textNormalization,
      ligatures: ligatures,
      hyphens: hyphens,
      readingProgression: readingProgression,
      imageFilter: imageFilter,
    );
  }

  /// Patch for a reading-mode change (single ↔ two-column). Carries the theme
  /// colors and publisher-styles flag alongside the column count, matching
  /// what the reader has always sent on a mode switch.
  EPUBPreferences columnCountPatch(EpubColumnCount columnCount) {
    return EPUBPreferences(
      backgroundColor: theme.background,
      textColor: theme.foreground,
      publisherStyles: publisherStyles,
      columnCount: columnCount,
      scroll: false,
    );
  }
}
