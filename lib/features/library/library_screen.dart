import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/db/database.dart' show MediaTypes;
import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../organize/tags_screen.dart';
import 'recent_screen.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/comic_card.dart';
import 'widgets/comic_cover.dart';
import 'widgets/empty_state.dart';
import 'widgets/library_grid.dart';
import 'widgets/pill_chip.dart';

/// Newest additions for the "Recently added" shelf.
const _recentlyAddedQuery = LibraryQuery(
  sort: LibrarySort.dateAdded,
  descending: true,
  limit: 12,
);

/// Cheap "is the library empty at all?" probe (ignores search/filter state).
const _anyItemQuery = LibraryQuery(limit: 1);

/// The **Library** tab — the Folio catalog hub. Merges what used to be Home and
/// Browse: a continue-reading hero, the want-to-read / recently-added shelves,
/// and the full filterable "All books" grid. A subtle sub-pivot keeps the Tags
/// and Recent slices reachable (they used to live under Browse).
class LibraryScreen extends StatefulWidget {
  /// Creates the Library hub.
  const LibraryScreen({super.key});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

enum _Pivot {
  books('All books'),
  tags('Tags'),
  recent('Recent');

  const _Pivot(this.label);
  final String label;
}

class _LibraryScreenState extends State<LibraryScreen> {
  _Pivot _pivot = _Pivot.books;

  @override
  Widget build(BuildContext context) {
    final gutter = _gutterOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Sub-pivot row — subtle text tabs so Tags/Recent stay one tap away.
        Padding(
          padding: EdgeInsets.fromLTRB(gutter, 14, gutter, 6),
          child: Row(
            children: [
              for (final p in _Pivot.values)
                _SubTab(
                  label: p.label,
                  selected: p == _pivot,
                  onTap: () => setState(() => _pivot = p),
                ),
            ],
          ),
        ),
        Expanded(
          child: switch (_pivot) {
            _Pivot.books => const _AllBooksBody(),
            _Pivot.tags => const TagsScreen(),
            _Pivot.recent => const RecentScreen(),
          },
        ),
      ],
    );
  }
}

/// Page gutter — 40px at desktop widths (Folio), tighter on phones.
double _gutterOf(BuildContext context) => MediaQuery.sizeOf(context).width >= 768 ? 40 : 16;

/// A small Folio text sub-tab (accent underline when active).
class _SubTab extends StatelessWidget {
  const _SubTab({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 22),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.only(bottom: 3),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected ? primary : Colors.transparent,
                width: 1,
              ),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontFamily: kSansFamily,
              fontSize: 13.5,
              color: selected ? CbColors.foreground : CbColors.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

/// The "All books" pivot body: hero + shelves + filterable grid.
class _AllBooksBody extends ConsumerWidget {
  const _AllBooksBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final continueAsync = ref.watch(continueReadingProvider);
    final wantAsync = ref.watch(wantToReadProvider);
    final recentAsync = ref.watch(browseComicsProvider(_recentlyAddedQuery));
    final anyAsync = ref.watch(browseComicsProvider(_anyItemQuery));
    final comicsAsync = ref.watch(comicsListProvider);
    final query = ref.watch(libraryQueryProvider);
    final gutter = _gutterOf(context);

    final libraryEmpty = anyAsync.asData?.value.isEmpty ?? false;

    return RefreshIndicator(
      // Pull-to-refresh re-pulls the catalog from the active source — essential
      // for remote servers whose library can change with no change notification.
      onRefresh: () async {
        invalidateLibraryProviders(ref);
        await ref.read(comicsListProvider.future);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (libraryEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.auto_stories_outlined,
                title: 'Your library is empty',
                hint: 'Import CBZ, PDF, or EPUB files to get started',
              ),
            )
          else ...[
            SliverToBoxAdapter(
              child: continueAsync.maybeWhen(
                data: (items) =>
                    items.isEmpty ? const SizedBox.shrink() : _ContinueSection(items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: wantAsync.maybeWhen(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : _Shelf(title: 'Want to read', items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: recentAsync.maybeWhen(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : _Shelf(title: 'Recently added', items: items),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(child: _AllBooksHeader(query: query)),
            SliverToBoxAdapter(child: _FilterRow(query: query)),
            comicsAsync.when(
              loading: () => const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (e, _) => SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Center(
                      child: Text('Failed to load library:\n$e', textAlign: TextAlign.center)),
                ),
              ),
              data: (comics) {
                if (comics.isEmpty) {
                  return const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: Text('Nothing matches these filters',
                            style: TextStyle(color: CbColors.mutedForeground)),
                      ),
                    ),
                  );
                }
                return SliverPadding(
                  padding: EdgeInsets.fromLTRB(gutter, 4, gutter, 32),
                  sliver: _ComicSliverGrid(comics: comics),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// "ALL BOOKS" section label with a Sort control on the right.
class _AllBooksHeader extends ConsumerWidget {
  const _AllBooksHeader({required this.query});
  final LibraryQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gutter = _gutterOf(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(gutter, 22, gutter, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text('ALL BOOKS', style: cbSectionLabel()),
          const Spacer(),
          _SortMenu(query: query),
        ],
      ),
    );
  }
}

/// The three sort options exposed in the UI (a subset of [LibrarySort]).
enum _SortChoice {
  recent('Recent', LibrarySort.dateAdded, true),
  title('Title', LibrarySort.title, false),
  lastRead('Recently read', LibrarySort.lastRead, true);

  const _SortChoice(this.label, this.sort, this.descending);
  final String label;
  final LibrarySort sort;
  final bool descending;
}

/// "Sort: Recent ▾" faint control that opens a sort menu.
class _SortMenu extends ConsumerWidget {
  const _SortMenu({required this.query});
  final LibraryQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = _SortChoice.values.firstWhere(
      (c) => c.sort == query.sort,
      orElse: () => _SortChoice.recent,
    );
    return PopupMenuButton<_SortChoice>(
      tooltip: 'Sort',
      position: PopupMenuPosition.under,
      onSelected: (c) =>
          ref.read(libraryQueryProvider.notifier).setSort(c.sort, descending: c.descending),
      itemBuilder: (context) => [
        for (final c in _SortChoice.values)
          PopupMenuItem(
            value: c,
            child: Row(
              children: [
                Icon(Icons.check,
                    size: 16,
                    color: c == current ? Theme.of(context).colorScheme.primary : Colors.transparent),
                const SizedBox(width: 8),
                Text(c.label),
              ],
            ),
          ),
      ],
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Sort: ${current.label}',
              style: const TextStyle(fontSize: 12, color: CbColors.faint)),
          const Icon(Icons.arrow_drop_down, size: 18, color: CbColors.faint),
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
            crossAxisSpacing: 20,
            mainAxisSpacing: 24,
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

/// Media-type / favorites / in-progress filter chips. Selections live in
/// [libraryQueryProvider], so they survive tab switches.
class _FilterRow extends ConsumerWidget {
  const _FilterRow({required this.query});
  final LibraryQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(libraryQueryProvider.notifier);
    final gutter = _gutterOf(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.fromLTRB(gutter, 0, gutter, 4),
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

/// Hero resume card for the most recent in-progress book, plus a compact
/// "up next" row for the rest of the continue-reading shelf.
class _ContinueSection extends StatelessWidget {
  const _ContinueSection({required this.items});
  final List<ComicSummary> items;

  @override
  Widget build(BuildContext context) {
    final hero = items.first;
    final upNext = items.skip(1).toList();
    final gutter = _gutterOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(gutter, 10, gutter, 12),
          child: Text('CONTINUE READING', style: cbSectionLabel()),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: gutter),
          child: _HeroResumeCard(comic: hero),
        ),
        if (upNext.isNotEmpty)
          SizedBox(
            height: 78,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.fromLTRB(gutter, 12, gutter, 0),
              itemCount: upNext.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => _UpNextCard(comic: upNext[i]),
            ),
          ),
      ],
    );
  }
}

/// Large "pick up where you left off" card: cover, title/series, progress, and
/// an explicit Resume button. Capped at the Folio hero width (640).
class _HeroResumeCard extends StatelessWidget {
  const _HeroResumeCard({required this.comic});
  final ComicSummary comic;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 640),
      child: InkWell(
        onTap: () => context.push('/read/${comic.id}'),
        onLongPress: () => showComicActionSheet(context, comic),
        borderRadius: BorderRadius.circular(kCardRadius),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 22),
          decoration: BoxDecoration(
            color: CbColors.heroSurface,
            borderRadius: BorderRadius.circular(kCardRadius),
            border: Border.all(color: const Color(0xFF242019)),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 78,
                height: 114,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(kHeroCoverRadius),
                  child: ComicCover(comic: comic),
                ),
              ),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      comic.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: cbSerif(size: 22, height: 1.2),
                    ),
                    if (comic.seriesName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        comic.seriesName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, color: CbColors.mutedForeground),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(child: _ProgressBar(value: comic.progress)),
                        const SizedBox(width: 12),
                        Text(
                          '${(comic.progress * 100).round()}% · ${comicCaption(comic)}',
                          style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 20),
              OutlinedButton(
                onPressed: () => context.push('/read/${comic.id}'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: primary,
                  side: BorderSide(color: primary),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                ),
                child: const Text('Resume'),
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
    return InkWell(
      onTap: () => context.push('/read/${comic.id}'),
      onLongPress: () => showComicActionSheet(context, comic),
      borderRadius: BorderRadius.circular(kCbRadius),
      child: Container(
        width: 224,
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: CbColors.surface,
          borderRadius: BorderRadius.circular(kCbRadius),
          border: Border.all(color: CbColors.border),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 38,
              height: 56,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: ComicCover(comic: comic),
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
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, height: 1.2),
                  ),
                  const SizedBox(height: 7),
                  _ProgressBar(value: comic.progress),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal cover shelf with a section label, reusing the grid card.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.title, required this.items});
  final String title;
  final List<ComicSummary> items;

  @override
  Widget build(BuildContext context) {
    final gutter = _gutterOf(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(gutter, 24, gutter, 12),
          child: Text(title.toUpperCase(), style: cbSectionLabel()),
        ),
        SizedBox(
          height: 214,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(horizontal: gutter),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 16),
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

/// Thin rounded accent-colored progress bar (Folio: 3px, warm track).
class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.value});
  final double value;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: LinearProgressIndicator(
        value: value,
        minHeight: 3,
        backgroundColor: CbColors.progressTrack,
        valueColor: AlwaysStoppedAnimation(Theme.of(context).colorScheme.primary),
      ),
    );
  }
}
