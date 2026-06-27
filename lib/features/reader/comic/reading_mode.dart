import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/repositories/providers.dart';

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
