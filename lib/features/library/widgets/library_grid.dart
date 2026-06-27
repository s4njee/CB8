import 'package:flutter/material.dart';

import '../../../data/models/comic_summary.dart';
import 'comic_card.dart';

/// Responsive cover grid — port of CB8's `LibraryGrid.tsx` breakpoints
/// (2 cols on phones up to ~8 on very wide screens).
class LibraryGrid extends StatelessWidget {
  /// Creates a responsive cover grid for [comics].
  const LibraryGrid({super.key, required this.comics, this.onOpen, this.onLongPress});

  /// Items to display.
  final List<ComicSummary> comics;

  /// Called when a cover is tapped.
  final void Function(ComicSummary)? onOpen;

  /// Called on long-press (opens the action sheet).
  final void Function(ComicSummary)? onLongPress;

  /// Column count for a given available [width], matching CB8's breakpoints.
  static int columnsFor(double width) {
    if (width >= 1536) return 8;
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 640) return 3;
    return 2;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = columnsFor(constraints.maxWidth);
        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            // 2:3 cover + room for the two text lines below it.
            childAspectRatio: 0.56,
          ),
          itemCount: comics.length,
          itemBuilder: (context, i) {
            final comic = comics[i];
            return ComicCard(
              comic: comic,
              onTap: () => onOpen?.call(comic),
              onLongPress: onLongPress == null ? null : () => onLongPress!.call(comic),
            );
          },
        );
      },
    );
  }
}
