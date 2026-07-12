import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
import 'widgets/empty_state.dart';
import 'widgets/library_grid.dart';

/// Recent tab — everything that's been opened, most-recent first. Mirrors CB8's
/// "Recently Read".
class RecentScreen extends ConsumerWidget {
  /// Creates the Recent tab.
  const RecentScreen({super.key});

  static const _query = LibraryQuery(
    hasBeenRead: true,
    sort: LibrarySort.lastRead,
    descending: true,
    limit: 200,
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comicsAsync = ref.watch(browseComicsProvider(_query));
    return comicsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load:\n$e', textAlign: TextAlign.center)),
      data: (comics) {
        if (comics.isEmpty) {
          return const EmptyState(
            icon: Icons.history,
            title: 'Nothing read yet',
            hint: 'Books you open will show up here',
          );
        }
        return LibraryGrid(
          comics: comics,
          onOpen: (comic) => context.push('/read/${comic.id}'),
          onLongPress: (comic) => showComicActionSheet(context, comic),
          onRefresh: () async {
            invalidateLibraryProviders(ref);
            await ref.read(browseComicsProvider(_query).future);
          },
        );
      },
    );
  }
}
