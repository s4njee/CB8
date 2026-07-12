import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// The app's standard "nothing here yet" body: a muted icon, a one-line title,
/// and an optional hint telling the user how to fill the screen.
///
/// Every list/grid screen (library, collections, series, tags, recent, stats…)
/// renders this same shape so empty states feel consistent; only the icon and
/// copy vary. Box widget — in sliver contexts wrap it in a
/// `SliverFillRemaining(hasScrollBody: false, …)`.
class EmptyState extends StatelessWidget {
  /// Creates an empty-state body.
  const EmptyState({super.key, required this.icon, required this.title, this.hint});

  /// Large muted glyph identifying the screen (e.g. a tag for the tags view).
  final IconData icon;

  /// One-line headline ("No collections yet").
  final String title;

  /// Optional call to action ("Long-press a book to add tags").
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: CbColors.mutedForeground),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(color: CbColors.mutedForeground)),
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(
                hint!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
