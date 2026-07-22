/// CB8's visual identity, redrawn as **"Hearth Noir"** (the Folio design language):
/// a true-black, warm-neutral surface palette, a warm-red accent, serif book
/// typography (Newsreader) over a sans UI (Instrument Sans), and [buildCbTheme]
/// which turns them into [ThemeData].
///
/// `theme_controller.dart` picks the accent; widgets read colors via
/// `Theme.of(context)` (or [CbColors] for the fixed warm greys), never hard-code.
library;

import 'package:flutter/material.dart';

/// Serif family — book titles, reading text, the wordmark. Bundled in pubspec.
const String kSerifFamily = 'Newsreader';

/// Sans family — all UI chrome (nav, labels, buttons). Bundled in pubspec.
const String kSansFamily = 'Instrument Sans';

/// Accent themes. Ported from CB8 but **retuned for the warm-black Hearth Noir
/// surfaces** — the default `red` is now Folio's `#e15b47`, and the others are
/// nudged to lower-chroma, warmer variants so they read well on `#0d0b0a`.
///
/// We expose them as plain [Color]s so the app can swap the seed/primary at
/// runtime exactly like CB8 swapped the `data-theme` attribute. All six members
/// are kept — the accent picker in Settings is a first-class menu option.
enum AccentTheme {
  /// Hearth Noir warm red (the signature accent).
  red(Color(0xFFE15B47)),

  /// Muted steel blue.
  blue(Color(0xFF5B93C7)),

  /// Warm sage green.
  green(Color(0xFF6FA368)),

  /// Dusty mauve/purple.
  purple(Color(0xFF9B7BC0)),

  /// Warm amber/orange.
  orange(Color(0xFFD98A4B)),

  /// Muted teal.
  teal(Color(0xFF5BA79C));

  const AccentTheme(this.color);

  /// The `--primary` color this theme maps to.
  final Color color;
}

/// Fixed surface palette for the Hearth Noir dark-only theme, straight from the
/// Folio handoff tokens. CB8 is dark-only in practice; these warm near-blacks are
/// what make the app read as "Folio".
abstract final class CbColors {
  /// App background (page). Folio `#0d0b0a`.
  static const background = Color(0xFF0D0B0A);

  /// Card/surface color (search field, cards). Folio `#161211`.
  static const surface = Color(0xFF161211);

  /// Secondary surface (chips, control fills, thumbnails). A touch above surface.
  static const surfaceAlt = Color(0xFF1F1913);

  /// Primary text color. Folio `#eae4d8`.
  static const foreground = Color(0xFFEAE4D8);

  /// Muted/secondary text color. Folio `#948a7c`.
  static const mutedForeground = Color(0xFF948A7C);

  /// Border/divider color (inputs, controls). Folio `#262019`.
  static const border = Color(0xFF262019);

  /// Destructive/error color — kept warm-red to sit in the palette.
  static const destructive = Color(0xFFE0574A);

  // --- Extended Folio tokens (new; used by the redesigned surfaces) ---

  /// Hairline rule under the header / between panes. Folio `#211c17`.
  static const headerRule = Color(0xFF211C17);

  /// Reading/body text on the book canvas. Folio `#ddd4c3`.
  static const readingText = Color(0xFFDDD4C3);

  /// Uppercase section labels ("CONTINUE READING"). Folio `#847a6c`.
  static const sectionLabel = Color(0xFF847A6C);

  /// Faint text — footers, page numbers, "Sort:" hints. Folio `#685f52`.
  static const faint = Color(0xFF685F52);

  /// Even fainter placeholder / search hint text. Folio `#776d5f`.
  static const placeholder = Color(0xFF776D5F);

  /// Continue-reading hero card fill. Folio `#141110`.
  static const heroSurface = Color(0xFF141110);

  /// Reading-view contents drawer background. Folio `#0a0808`.
  static const drawerBg = Color(0xFF0A0808);

  /// Settings popover background. Folio `#151110`.
  static const popover = Color(0xFF151110);

  /// Popover / drawer border. Folio `#2b241c`.
  static const popoverBorder = Color(0xFF2B241C);

  /// Active TOC-row tint (accent text sits on this). Folio `#241412`.
  static const accentTint = Color(0xFF241412);

  /// Circular avatar background. Folio `#2e1c17`.
  static const avatarBg = Color(0xFF2E1C17);

  /// Progress-bar track. Folio `#282219`.
  static const progressTrack = Color(0xFF282219);
}

/// Corner radii used across the redesign (Folio uses a small set).
const double kCbRadius = 8.0; // buttons, inputs, controls
const double kCardRadius = 12.0; // hero card, popover, cards
const double kCoverRadius = 5.0; // covers in the grid
const double kHeroCoverRadius = 4.0; // the small hero cover

/// A serif display style for book titles / wordmarks (Newsreader).
TextStyle cbSerif({
  double size = 22,
  FontWeight weight = FontWeight.w400,
  Color color = CbColors.foreground,
  double? height,
  FontStyle? style,
}) =>
    TextStyle(
      fontFamily: kSerifFamily,
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      fontStyle: style,
    );

/// An uppercase, letter-spaced section label (Instrument Sans) — "CONTINUE
/// READING", "ALL BOOKS", "THEME", etc.
TextStyle cbSectionLabel({
  double size = 11.5,
  Color color = CbColors.sectionLabel,
  double letterSpacing = 0.14 * 11.5,
}) =>
    TextStyle(
      fontFamily: kSansFamily,
      fontSize: size,
      fontWeight: FontWeight.w500,
      color: color,
      // Flutter letter-spacing is in logical px, not em, so callers pass an
      // absolute value; the default here ≈ .14em at 11.5px.
      letterSpacing: letterSpacing,
      height: 1.0,
    );

/// Builds the dark [ThemeData] for a given [AccentTheme], mirroring Folio.
ThemeData buildCbTheme(AccentTheme accent) {
  final scheme = ColorScheme.dark(
    primary: accent.color,
    onPrimary: Colors.white,
    secondary: accent.color,
    surface: CbColors.surface,
    onSurface: CbColors.foreground,
    surfaceContainerHighest: CbColors.surfaceAlt,
    outline: CbColors.border,
    error: CbColors.destructive,
  );

  final radius = BorderRadius.circular(kCbRadius);

  // Instrument Sans is the base UI face; serif is opt-in via [cbSerif].
  final base = Typography.whiteMountainView.apply(
    fontFamily: kSansFamily,
    bodyColor: CbColors.foreground,
    displayColor: CbColors.foreground,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    fontFamily: kSansFamily,
    scaffoldBackgroundColor: CbColors.background,
    canvasColor: CbColors.background,
    dividerColor: CbColors.headerRule,
    splashFactory: InkRipple.splashFactory,
    dividerTheme: const DividerThemeData(color: CbColors.headerRule, space: 1, thickness: 1),
    cardTheme: CardThemeData(
      color: CbColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: CbColors.border),
        borderRadius: BorderRadius.circular(kCardRadius),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: CbColors.background,
      foregroundColor: CbColors.foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: CbColors.surface,
      indicatorColor: accent.color.withValues(alpha: 0.18),
      elevation: 0,
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: CbColors.surface,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: CbColors.surfaceAlt,
      side: const BorderSide(color: CbColors.border),
      labelStyle: const TextStyle(fontFamily: kSansFamily, color: CbColors.foreground),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kCbRadius)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: CbColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: CbColors.border),
        borderRadius: BorderRadius.circular(kCardRadius),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: CbColors.surface,
      surfaceTintColor: Colors.transparent,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: CbColors.popover,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: CbColors.popoverBorder),
        borderRadius: BorderRadius.circular(kCbRadius),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: accent.color,
        side: BorderSide(color: accent.color),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: kSansFamily, fontWeight: FontWeight.w500),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: kSansFamily, fontWeight: FontWeight.w500),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: CbColors.surface,
      hintStyle: const TextStyle(color: CbColors.placeholder, fontFamily: kSansFamily),
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: CbColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: CbColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: BorderSide(color: accent.color),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    ),
    textTheme: base,
  );
}
