import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/comic_summary.dart';
import '../../data/models/groups.dart';
import '../../data/repositories/providers.dart';
import 'widgets/comic_cover.dart';

/// Lists groups of likely-duplicate catalog items (identical files, or matching
/// titles) and lets the user delete the redundant copies. Backed by
/// `findDuplicates()` on the active source via [duplicatesProvider].
class DuplicatesScreen extends ConsumerWidget {
  /// Creates the duplicate-detection screen.
  const DuplicatesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dupes = ref.watch(duplicatesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Find duplicates')),
      body: dupes.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to scan:\n$e', textAlign: TextAlign.center)),
        data: (groups) {
          if (groups.isEmpty) return const _NoDuplicates();
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              for (final group in groups) _DuplicateGroupTile(group: group),
            ],
          );
        },
      ),
    );
  }
}

class _DuplicateGroupTile extends ConsumerWidget {
  const _DuplicateGroupTile({required this.group});
  final DuplicateGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            '${group.reason} · ${group.items.length} copies',
            style: const TextStyle(fontWeight: FontWeight.w600, color: CbColors.mutedForeground),
          ),
        ),
        for (final item in group.items) _DuplicateRow(item: item),
        const Divider(height: 24),
      ],
    );
  }
}

class _DuplicateRow extends ConsumerWidget {
  const _DuplicateRow({required this.item});
  final ComicSummary item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      leading: SizedBox(
        width: 36,
        height: 52,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: ComicCover(comic: item),
        ),
      ),
      title: Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        [
          if (item.extension != null) item.extension!.toUpperCase(),
          item.mediaType == 'book' ? '${item.pageCount} ch' : '${item.pageCount} pg',
        ].join(' · '),
      ),
      onTap: () => context.push('/read/${item.id}'),
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
        tooltip: 'Delete this copy',
        onPressed: () => _confirmDelete(context, ref),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF141414),
        title: const Text('Delete this copy?'),
        content: Text('Removes “${item.title}” and its imported file from this device.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    // The list refreshes automatically via the local source's change stream.
    await ref.read(activeSourceProvider).deleteComic(item.id);
  }
}

class _NoDuplicates extends StatelessWidget {
  const _NoDuplicates();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified_outlined, size: 48, color: CbColors.mutedForeground),
          SizedBox(height: 12),
          Text('No duplicates found', style: TextStyle(color: CbColors.mutedForeground)),
        ],
      ),
    );
  }
}
