import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import 'widgets/comic_action_sheet.dart';
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
          return const _Empty();
        }
        return LibraryGrid(
          comics: comics,
          onOpen: (comic) => context.push('/read/${comic.id}'),
          onLongPress: (comic) => showComicActionSheet(context, comic),
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.history, size: 48, color: CbColors.mutedForeground),
          SizedBox(height: 12),
          Text('Nothing read yet', style: TextStyle(color: CbColors.mutedForeground)),
          SizedBox(height: 4),
          Text('Books you open will show up here',
              style: TextStyle(fontSize: 12, color: CbColors.mutedForeground)),
        ],
      ),
    );
  }
}
