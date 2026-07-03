import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/comic_card.dart';
import 'widgets/comic_cover.dart';

/// Newest additions for the home "Recently added" shelf.
const _recentlyAddedQuery = LibraryQuery(
  sort: LibrarySort.dateAdded,
  descending: true,
  limit: 12,
);

/// Cheap "is the library empty at all?" probe (ignores search/filter state).
const _anyItemQuery = LibraryQuery(limit: 1);

/// The home tab: answers "what was I reading?" at a glance. A hero resume card
/// for the current book, an up-next row for other in-progress items, then the
/// want-to-read and recently-added shelves. The exhaustive grid lives in
/// Browse — home is about continuity, not inventory.
class HomeScreen extends ConsumerWidget {
  /// Creates the home tab.
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final continueAsync = ref.watch(continueReadingProvider);
    final wantAsync = ref.watch(wantToReadProvider);
    final recentAsync = ref.watch(browseComicsProvider(_recentlyAddedQuery));
    final anyAsync = ref.watch(browseComicsProvider(_anyItemQuery));

    final libraryEmpty = anyAsync.asData?.value.isEmpty ?? false;

    return RefreshIndicator(
      // Pull-to-refresh: re-pull the catalog from the active source. Essential
      // for remote servers, whose library can change server-side without any
      // change notification reaching the app.
      onRefresh: () async {
        invalidateLibraryProviders(ref);
        await ref.read(continueReadingProvider.future);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (libraryEmpty)
            const _EmptyState()
          else ...[
            SliverToBoxAdapter(
              child: continueAsync.maybeWhen(
                data: (items) => items.isEmpty ? const SizedBox.shrink() : _ContinueSection(items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: wantAsync.maybeWhen(
                data: (items) =>
                    items.isEmpty ? const SizedBox.shrink() : _Shelf(title: 'Want to read', items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: recentAsync.maybeWhen(
                data: (items) =>
                    items.isEmpty ? const SizedBox.shrink() : _Shelf(title: 'Recently added', items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ],
      ),
    );
  }
}

/// Hero resume card for the most recent in-progress book, plus a compact
/// "up next" row for the rest of the continue-reading shelf.
class _ContinueSection extends StatelessWidget {
  const _ContinueSection({required this.items});
  final List<ComicSummary> items;

  @override
  Widget build(BuildContext context) {
    final hero = items.first;
    final upNext = items.skip(1).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader('Continue reading'),
        _HeroResumeCard(comic: hero),
        if (upNext.isNotEmpty)
          SizedBox(
            height: 76,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              itemCount: upNext.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) => _UpNextCard(comic: upNext[i]),
            ),
          ),
      ],
    );
  }
}

class _HeroResumeCard extends StatelessWidget {
  const _HeroResumeCard({required this.comic});
  final ComicSummary comic;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: InkWell(
        onTap: () => context.push('/read/${comic.id}'),
        onLongPress: () => showComicActionSheet(context, comic),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: CbColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: CbColors.border),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 96,
                child: AspectRatio(
                  aspectRatio: 2 / 3,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(kCbRadius),
                    child: ComicCover(comic: comic),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      comic.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    if (comic.seriesName != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        comic.seriesName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, color: CbColors.mutedForeground),
                      ),
                    ],
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(
                        value: comic.progress,
                        minHeight: 4,
                        backgroundColor: CbColors.surfaceAlt,
                        valueColor: AlwaysStoppedAnimation(theme.colorScheme.primary),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      comicCaption(comic),
                      style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: () => context.push('/read/${comic.id}'),
                      icon: const Icon(Icons.play_arrow, size: 18),
                      label: const Text('Resume'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact resume card for the up-next row: small cover, title, progress.
class _UpNextCard extends StatelessWidget {
  const _UpNextCard({required this.comic});
  final ComicSummary comic;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: () => context.push('/read/${comic.id}'),
      onLongPress: () => showComicActionSheet(context, comic),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 220,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: CbColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: CbColors.border),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 36,
              child: AspectRatio(
                aspectRatio: 2 / 3,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: ComicCover(comic: comic),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    comic.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: LinearProgressIndicator(
                      value: comic.progress,
                      minHeight: 3,
                      backgroundColor: CbColors.surfaceAlt,
                      valueColor: AlwaysStoppedAnimation(theme.colorScheme.primary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal cover shelf with a section header, reusing the grid card.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.title, required this.items});
  final String title;
  final List<ComicSummary> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title),
        SizedBox(
          height: 210,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, i) => SizedBox(
              width: 120,
              child: ComicCard(
                comic: items[i],
                onTap: () => context.push('/read/${items[i].id}'),
                onLongPress: () => showComicActionSheet(context, items[i]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
      child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
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
