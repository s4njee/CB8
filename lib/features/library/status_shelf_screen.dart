import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/empty_state.dart';
import 'widgets/library_grid.dart';

/// Which reading-state slice a [StatusShelfScreen] shows.
enum ReadingShelf {
  /// Opened but not finished — the "Reading now" tab.
  readingNow(
    ReadStatus.inProgress,
    icon: Icons.auto_stories_outlined,
    emptyTitle: 'Nothing in progress',
    emptyHint: 'Books you’re part-way through show up here',
  ),

  /// Read to the end — the "Finished" tab.
  finished(
    ReadStatus.completed,
    icon: Icons.task_alt_outlined,
    emptyTitle: 'Nothing finished yet',
    emptyHint: 'Books you read to the end show up here',
  );

  const ReadingShelf(
    this.status, {
    required this.icon,
    required this.emptyTitle,
    required this.emptyHint,
  });

  final ReadStatus status;
  final IconData icon;
  final String emptyTitle;
  final String emptyHint;
}

/// A responsive cover grid of every book in a given reading state, most-recently
/// read first. Backs the header's "Reading now" and "Finished" tabs. Uses a
/// fixed query (not the shared library filter) so it never clobbers the Library
/// tab's chips.
class StatusShelfScreen extends ConsumerWidget {
  /// Creates a reading-state shelf.
  const StatusShelfScreen({super.key, required this.shelf});

  /// The reading-state slice to show.
  final ReadingShelf shelf;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = LibraryQuery(
      readStatus: shelf.status,
      sort: LibrarySort.lastRead,
      descending: true,
      limit: 200,
    );
    final async = ref.watch(browseComicsProvider(query));

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load:\n$e', textAlign: TextAlign.center)),
      data: (comics) {
        if (comics.isEmpty) {
          return EmptyState(icon: shelf.icon, title: shelf.emptyTitle, hint: shelf.emptyHint);
        }
        return LibraryGrid(
          comics: comics,
          onOpen: (c) => context.push('/read/${c.id}'),
          onLongPress: (c) => showComicActionSheet(context, c),
          onRefresh: () async {
            invalidateLibraryProviders(ref);
            await ref.read(browseComicsProvider(query).future);
          },
        );
      },
    );
  }
}
