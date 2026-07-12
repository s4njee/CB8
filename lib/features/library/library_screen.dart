import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/db/database.dart' show MediaTypes;
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/comic_card.dart';
import 'widgets/empty_state.dart';
import 'widgets/library_grid.dart';
import 'widgets/pill_chip.dart';

/// The full-catalog grid (Browse's "All" pivot): a media-type filter row and
/// the responsive cover grid. The continue-reading and want-to-read shelves
/// live on [HomeScreen] now, so nothing repeats between the two tabs.
class LibraryScreen extends ConsumerWidget {
  /// Creates the catalog grid view.
  const LibraryScreen({super.key, this.title = 'All'});

  /// App-bar title.
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comicsAsync = ref.watch(comicsListProvider);
    final query = ref.watch(libraryQueryProvider);

    return RefreshIndicator(
      // Pull-to-refresh: re-pull the catalog from the active source. Essential
      // for remote servers, whose library can change server-side without any
      // change notification reaching the app.
      onRefresh: () async {
        invalidateLibraryProviders(ref);
        await ref.read(comicsListProvider.future);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _FilterRow(query: query)),
          comicsAsync.when(
            loading: () => const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => SliverFillRemaining(
              child: Center(child: Text('Failed to load library:\n$e', textAlign: TextAlign.center)),
            ),
            data: (comics) {
              if (comics.isEmpty) return const _EmptyLibrary();
              return SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: _ComicSliverGrid(comics: comics),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ComicSliverGrid extends StatelessWidget {
  const _ComicSliverGrid({required this.comics});
  final List<ComicSummary> comics;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final columns = LibraryGrid.columnsFor(constraints.crossAxisExtent);
        return SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: 0.56,
          ),
          delegate: SliverChildBuilderDelegate(
            (context, i) => ComicCard(
              comic: comics[i],
              onTap: () => context.push('/read/${comics[i].id}'),
              onLongPress: () => showComicActionSheet(context, comics[i]),
            ),
            childCount: comics.length,
          ),
        );
      },
    );
  }
}

/// Media-type / favorites / in-progress filter chips above the grid. The
/// selections live in [libraryQueryProvider], so they survive tab switches.
class _FilterRow extends ConsumerWidget {
  const _FilterRow({required this.query});
  final LibraryQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(libraryQueryProvider.notifier);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: [
          PillChip(
            label: 'All',
            selected: query.mediaType == null,
            onTap: () => controller.setMediaType(null),
          ),
          PillChip(
            label: 'Comics',
            selected: query.mediaType == MediaTypes.comic,
            onTap: () => controller.setMediaType(MediaTypes.comic),
          ),
          PillChip(
            label: 'Books',
            selected: query.mediaType == MediaTypes.book,
            onTap: () => controller.setMediaType(MediaTypes.book),
          ),
          const SizedBox(width: 8),
          PillChip(
            label: 'Favorites',
            selected: query.favoritesOnly,
            onTap: controller.toggleFavorites,
          ),
          PillChip(
            label: 'In progress',
            selected: query.readStatus == ReadStatus.inProgress,
            onTap: () => controller.setReadStatus(
              query.readStatus == ReadStatus.inProgress ? ReadStatus.all : ReadStatus.inProgress,
            ),
          ),
        ],
      ),
    );
  }
}

/// Sliver-shaped empty state (the grid lives in a CustomScrollView).
class _EmptyLibrary extends StatelessWidget {
  const _EmptyLibrary();
  @override
  Widget build(BuildContext context) {
    return const SliverFillRemaining(
      hasScrollBody: false,
      child: EmptyState(
        icon: Icons.auto_stories_outlined,
        title: 'Your library is empty',
        hint: 'Import CBZ, PDF, or EPUB files to get started',
      ),
    );
  }
}
