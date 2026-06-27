import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../library/widgets/browse_grid_screen.dart';
import '../library/widgets/library_grid.dart';
import 'widgets/group_card.dart';

/// Folders tab — series auto-grouped from parsed metadata. Tapping a series
/// opens its comics, ordered by volume then chapter.
class SeriesScreen extends ConsumerWidget {
  /// Creates the Folders (series) tab.
  const SeriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seriesAsync = ref.watch(seriesProvider);
    return seriesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load series:\n$e', textAlign: TextAlign.center)),
      data: (series) {
        if (series.isEmpty) {
          return const _Empty(
            icon: Icons.folder_outlined,
            title: 'No series yet',
            hint: 'Series are detected from file names (e.g. "Title v01")',
          );
        }
        return LayoutBuilder(
          builder: (context, constraints) {
            final columns = LibraryGrid.columnsFor(constraints.maxWidth);
            return GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: columns,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                childAspectRatio: 0.56,
              ),
              itemCount: series.length,
              itemBuilder: (context, i) {
                final s = series[i];
                return GroupCard(
                  title: s.name,
                  subtitle: '${s.count} ${s.count == 1 ? 'item' : 'items'}',
                  cover: s.cover,
                  fallbackIcon: Icons.menu_book_outlined,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => BrowseGridScreen(
                        title: s.name,
                        query: LibraryQuery(seriesName: s.name, limit: 500),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.hint});
  final IconData icon;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: CbColors.mutedForeground),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(color: CbColors.mutedForeground)),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(hint,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground)),
          ),
        ],
      ),
    );
  }
}
