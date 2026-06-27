import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/repositories/providers.dart';
import '../../../data/sources/library_source.dart';
import 'comic_action_sheet.dart';
import 'library_grid.dart';

/// A titled grid for an arbitrary [LibraryQuery] — reused by the tag, collection
/// and series browsers. Cards open the reader on tap and the action sheet on
/// long-press.
class BrowseGridScreen extends ConsumerWidget {
  /// Creates a titled grid showing the results of [query].
  const BrowseGridScreen({super.key, required this.title, required this.query});

  /// App-bar title.
  final String title;

  /// Query whose results are displayed.
  final LibraryQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comicsAsync = ref.watch(browseComicsProvider(query));
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: comicsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load:\n$e', textAlign: TextAlign.center)),
        data: (comics) {
          if (comics.isEmpty) {
            return const Center(
              child: Text('Nothing here yet', style: TextStyle(color: CbColors.mutedForeground)),
            );
          }
          return LibraryGrid(
            comics: comics,
            onOpen: (comic) => context.push('/read/${comic.id}'),
            onLongPress: (comic) => showComicActionSheet(context, comic),
          );
        },
      ),
    );
  }
}
