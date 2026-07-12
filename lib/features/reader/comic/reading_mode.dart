import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/repositories/providers.dart';

/// The reader's globally-persisted view toggles: reading mode (page layout),
/// reading direction (LTR / RTL-manga), cover-first pairing, and HD upscaling.
///
/// Each is a small SharedPreferences-backed Riverpod notifier rather than
/// per-book state, deliberately: a manga reader wants RTL for *everything*,
/// not per title. Every reader watches these (the EPUB reader maps
/// [ReadingMode] onto Readium column counts; the comic/PDF readers use them
/// directly).

/// How comic pages are laid out. Persisted globally and applied to every comic.
enum ReadingMode {
  /// Continuous vertical scroll (webtoon-style).
  scroll,

  /// One page at a time; tap left/right thirds to turn.
  single,

  /// Two pages side-by-side; tap left/right to turn by spread.
  doublePage;

  /// Human-readable label for the reading-mode menu.
  String get label => switch (this) {
        ReadingMode.scroll => 'Vertical scroll',
        ReadingMode.single => 'Single page',
        ReadingMode.doublePage => 'Two pages',
      };

  /// Menu icon representing the mode.
  IconData get icon => switch (this) {
        ReadingMode.scroll => Icons.view_day_outlined,
        ReadingMode.single => Icons.crop_portrait,
        ReadingMode.doublePage => Icons.import_contacts_outlined,
      };
}

const _readerModeKey = 'reader_mode';

/// The globally-persisted comic [ReadingMode].
final readingModeProvider =
    NotifierProvider<ReadingModeController, ReadingMode>(ReadingModeController.new);

/// Loads and persists the active [ReadingMode] in shared preferences.
class ReadingModeController extends Notifier<ReadingMode> {
  @override
  ReadingMode build() {
    final stored = ref.watch(sharedPreferencesProvider).getString(_readerModeKey);
    return ReadingMode.values.firstWhere(
      (m) => m.name == stored,
      orElse: () => ReadingMode.single,
    );
  }

  /// Sets and persists the reading mode.
  void set(ReadingMode mode) {
    ref.read(sharedPreferencesProvider).setString(_readerModeKey, mode.name);
    state = mode;
  }
}

/// Page-turn direction for paged comic layouts (single / two-page).
enum ReadingDirection {
  /// Left-to-right — Western comics. Swipe/tap right advances.
  ltr,

  /// Right-to-left — manga. Swipe/tap left advances, and two-page spreads put
  /// the lower-numbered page on the right.
  rtl;

  /// Human-readable label for the direction toggle.
  String get label => switch (this) {
        ReadingDirection.ltr => 'Left to right',
        ReadingDirection.rtl => 'Right to left (manga)',
      };

  /// Whether this is right-to-left (manga) ordering.
  bool get isRtl => this == ReadingDirection.rtl;
}

const _directionKey = 'reader_direction';

/// The globally-persisted page-turn [ReadingDirection]. Applies to the paged
/// comic layouts; vertical scroll and reflowable EPUB are unaffected.
final readingDirectionProvider =
    NotifierProvider<ReadingDirectionController, ReadingDirection>(ReadingDirectionController.new);

/// Loads and persists the active [ReadingDirection] in shared preferences.
class ReadingDirectionController extends Notifier<ReadingDirection> {
  @override
  ReadingDirection build() {
    final stored = ref.watch(sharedPreferencesProvider).getString(_directionKey);
    return ReadingDirection.values.firstWhere(
      (d) => d.name == stored,
      orElse: () => ReadingDirection.ltr,
    );
  }

  /// Sets and persists the reading direction.
  void set(ReadingDirection direction) {
    ref.read(sharedPreferencesProvider).setString(_directionKey, direction.name);
    state = direction;
  }

  /// Flips between LTR and RTL.
  void toggle() => set(state.isRtl ? ReadingDirection.ltr : ReadingDirection.rtl);
}

const _coverFirstKey = 'reader_cover_first';

/// Whether two-page mode shows the first page alone (as a cover), then pairs the
/// rest: `[0] [1 2] [3 4] …`. Mirrors how a printed book's cover sits opposite a
/// blank, so left/right pages line up as the artist intended. Persisted globally.
final coverFirstProvider =
    NotifierProvider<CoverFirstController, bool>(CoverFirstController.new);

/// Loads and persists the cover-first toggle in shared preferences.
class CoverFirstController extends Notifier<bool> {
  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(_coverFirstKey) ?? false;

  /// Flips and persists the cover-first toggle.
  void toggle() => set(!state);

  /// Sets and persists the cover-first toggle.
  void set(bool value) {
    ref.read(sharedPreferencesProvider).setBool(_coverFirstKey, value);
    state = value;
  }
}

const _upscaleKey = 'reader_upscale';

/// Whether to request GPU-upscaled ("HD", Real-ESRGAN) comic pages from the
/// server. Persisted globally; only meaningful for remote comics, and the
/// server gracefully falls back to the standard page when the GPU service is
/// down, so leaving this on is always safe.
final upscaleProvider = NotifierProvider<UpscaleController, bool>(UpscaleController.new);

/// Loads and persists the "HD" upscale toggle in shared preferences.
class UpscaleController extends Notifier<bool> {
  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(_upscaleKey) ?? false;

  /// Flips and persists the HD toggle.
  void toggle() => set(!state);

  /// Sets and persists the HD toggle.
  void set(bool value) {
    ref.read(sharedPreferencesProvider).setBool(_upscaleKey, value);
    state = value;
  }
}
