import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../library/widgets/browse_grid_screen.dart';
import '../library/widgets/empty_state.dart';
import '../library/widgets/library_grid.dart';
import 'widgets/collection_item_picker.dart';
import 'widgets/group_card.dart';

/// Collections tab — user-created named collections (CB8 "libraries"). Create a
/// collection here; add books to it from a book's long-press menu.
class CollectionsScreen extends ConsumerWidget {
  /// Creates the Collections tab.
  const CollectionsScreen({super.key});

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final name = await promptCollectionName(context);
    if (name == null || name.trim().isEmpty) return;
    await ref.read(activeSourceProvider).createLibrary(name.trim());
    ref.invalidate(librariesProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final librariesAsync = ref.watch(librariesProvider);
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
            child: TextButton.icon(
              onPressed: () => _create(context, ref),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New collection'),
            ),
          ),
        ),
        Expanded(
          child: librariesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) =>
                Center(child: Text('Failed to load:\n$e', textAlign: TextAlign.center)),
            data: (libraries) {
              if (libraries.isEmpty) {
                return const EmptyState(
                  icon: Icons.collections_bookmark_outlined,
                  title: 'No collections yet',
                  hint: 'Create one above, then add books from their long-press menu',
                );
              }
              return RefreshIndicator(
                onRefresh: () async {
                  invalidateLibraryProviders(ref);
                  await ref.read(librariesProvider.future);
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
                    itemCount: libraries.length,
                    itemBuilder: (context, i) {
                      final lib = libraries[i];
                      return GroupCard(
                        title: lib.name,
                        subtitle: '${lib.count} ${lib.count == 1 ? 'item' : 'items'}',
                        cover: lib.cover,
                        fallbackIcon: Icons.collections_bookmark_outlined,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => BrowseGridScreen(
                              title: lib.name,
                              query: LibraryQuery(libraryId: lib.id, limit: 500),
                              collectionId: lib.id,
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ));
            },
          ),
        ),
      ],
    );
  }
}

