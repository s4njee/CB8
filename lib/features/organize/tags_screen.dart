import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../library/widgets/browse_grid_screen.dart';
import '../library/widgets/empty_state.dart';

/// Tags tab — a chip cloud of all tags with counts. Tapping a tag opens its
/// filtered grid. Mirrors CB8's tag row.
class TagsScreen extends ConsumerWidget {
  /// Creates the Tags tab.
  const TagsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tagsAsync = ref.watch(tagsProvider);
    return tagsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Failed to load tags:\n$e', textAlign: TextAlign.center)),
      data: (tags) {
        if (tags.isEmpty) {
          return const EmptyState(
            icon: Icons.tag,
            title: 'No tags yet',
            hint: 'Long-press a book to add tags',
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            invalidateLibraryProviders(ref);
            await ref.read(tagsProvider.future);
          },
          child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final tag in tags)
                ActionChip(
                  backgroundColor: CbColors.surfaceAlt,
                  side: const BorderSide(color: CbColors.border),
                  label: Text('${tag.name}  ·  ${tag.count}'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => BrowseGridScreen(
                        title: '#${tag.name}',
                        query: LibraryQuery(tag: tag.name),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ));
      },
    );
  }
}
