import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme.dart';

/// SharedPreferences instance, initialized in `main()` and injected here so the
/// theme controller can persist the selected accent synchronously.
///
/// Deliberately separate from the data layer's `sharedPreferencesProvider`
/// (main() overrides both with the same instance): core/theme must not import
/// the data layer, and sharing one provider would create that dependency.
final sharedPrefsProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('sharedPrefsProvider must be overridden in main()');
});

const _accentPrefKey = 'accent_theme';

/// Holds the selected [AccentTheme] (CB8's red/blue/green/purple/orange/teal),
/// persisting it like CB8 persisted the `data-theme` attribute.
final accentThemeProvider =
    NotifierProvider<AccentThemeController, AccentTheme>(AccentThemeController.new);

/// Loads and persists the selected [AccentTheme] in shared preferences.
class AccentThemeController extends Notifier<AccentTheme> {
  @override
  AccentTheme build() {
    final prefs = ref.watch(sharedPrefsProvider);
    final stored = prefs.getString(_accentPrefKey);
    return AccentTheme.values.firstWhere(
      (a) => a.name == stored,
      orElse: () => AccentTheme.red,
    );
  }

  /// Selects and persists the accent theme.
  void select(AccentTheme accent) {
    ref.read(sharedPrefsProvider).setString(_accentPrefKey, accent.name);
    state = accent;
  }
}

/// The live [ThemeData] derived from the selected accent.
final themeDataProvider = Provider<ThemeData>((ref) {
  return buildCbTheme(ref.watch(accentThemeProvider));
});
