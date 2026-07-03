import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/db/database.dart' show MediaTypes;
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/comic_card.dart';
import 'widgets/library_grid.dart';

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
              if (comics.isEmpty) return const _EmptyState();
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
          _Chip(
            label: 'All',
            selected: query.mediaType == null,
            onTap: () => controller.setMediaType(null),
          ),
          _Chip(
            label: 'Comics',
            selected: query.mediaType == MediaTypes.comic,
            onTap: () => controller.setMediaType(MediaTypes.comic),
          ),
          _Chip(
            label: 'Books',
            selected: query.mediaType == MediaTypes.book,
            onTap: () => controller.setMediaType(MediaTypes.book),
          ),
          const SizedBox(width: 8),
          _Chip(
            label: 'Favorites',
            selected: query.favoritesOnly,
            onTap: controller.toggleFavorites,
          ),
          _Chip(
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

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? primary : CbColors.surfaceAlt,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? primary : CbColors.border),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: selected ? Colors.white : CbColors.foreground,
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return const SliverFillRemaining(
      hasScrollBody: false,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_stories_outlined, size: 48, color: CbColors.mutedForeground),
            SizedBox(height: 12),
            Text('Your library is empty', style: TextStyle(color: CbColors.mutedForeground)),
            SizedBox(height: 4),
            Text('Import CBZ, PDF, or EPUB files to get started',
                style: TextStyle(fontSize: 12, color: CbColors.mutedForeground)),
          ],
        ),
      ),
    );
  }
}
