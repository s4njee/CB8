import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../library/widgets/browse_grid_screen.dart';
import '../library/widgets/empty_state.dart';
import '../library/widgets/library_grid.dart';
import 'widgets/group_card.dart';

/// Series tab — series auto-grouped from parsed metadata. Tapping a series
/// opens its comics, ordered by volume then chapter.
class SeriesScreen extends ConsumerWidget {
  /// Creates the Series tab.
  const SeriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seriesAsync = ref.watch(seriesProvider);
    return seriesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load series:\n$e', textAlign: TextAlign.center)),
      data: (series) {
        if (series.isEmpty) {
          return const EmptyState(
            icon: Icons.folder_outlined,
            title: 'No series yet',
            hint: 'Series are detected from file names (e.g. "Title v01")',
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            invalidateLibraryProviders(ref);
            await ref.read(seriesProvider.future);
          },
          child: LayoutBuilder(
          builder: (context, constraints) {
            final columns = LibraryGrid.columnsFor(constraints.maxWidth);
            return GridView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
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
        ));
      },
    );
  }
}
