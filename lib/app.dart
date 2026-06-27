import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/theme_controller.dart';

/// Root widget: a dark-themed, router-driven MaterialApp themed from the
/// selected CB8 accent.
class Cb8App extends ConsumerWidget {
  /// Creates the root app widget.
  const Cb8App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = ref.watch(themeDataProvider);
    return MaterialApp.router(
      title: 'CB8',
      debugShowCheckedModeBanner: false,
      theme: theme,
      darkTheme: theme,
      themeMode: ThemeMode.dark,
      scrollBehavior: const _CbScrollBehavior(),
      routerConfig: appRouter,
    );
  }
}

/// Adds an interactive scrollbar to vertical scrollables on desktop (where users
/// expect one), and enables mouse-drag scrolling. On touch platforms the default
/// behavior (no persistent scrollbar) is kept.
class _CbScrollBehavior extends MaterialScrollBehavior {
  const _CbScrollBehavior();

  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) {
    switch (getPlatform(context)) {
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
        if (details.direction == AxisDirection.down || details.direction == AxisDirection.up) {
          return Scrollbar(controller: details.controller, child: child);
        }
        return child;
      default:
        return super.buildScrollbar(context, child, details);
    }
  }
}
