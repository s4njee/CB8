import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../../../data/sources/library_source.dart';
import '../../../data/sources/remote_source.dart';
import '../../import/import_controller.dart';
import '../../import/media_probe.dart' show supportedExtensions;
import '../../organize/widgets/collection_item_picker.dart';
import 'comic_action_sheet.dart';
import 'library_grid.dart';

/// A titled grid for an arbitrary [LibraryQuery] — reused by the tag, collection
/// and series browsers. Cards open the reader on tap and the action sheet on
/// long-press.
///
/// When [collectionId] is set (collection view), the app bar shows an "Add"
/// action that opens the library picker for adding books/comics to it. In server
/// mode the app bar also shows "Download all", which saves every readable item in
/// the grid to this device for offline use (see [ImportController.downloadManyFromServer]).
class BrowseGridScreen extends ConsumerWidget {
  /// Creates a titled grid showing the results of [query].
  const BrowseGridScreen({
    super.key,
    required this.title,
    required this.query,
    this.collectionId,
  });

  /// App-bar title.
  final String title;

  /// Query whose results are displayed.
  final LibraryQuery query;

  /// Collection id this grid belongs to; enables the "Add items" action. Null
  /// for tag/series grids, which aren't manually curated.
  final String? collectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comicsAsync = ref.watch(browseComicsProvider(query));
    final source = ref.watch(activeSourceProvider);
    final isCollection = collectionId != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          // `source is RemoteSource` is checked inline so `source` promotes to
          // RemoteSource inside the closure below.
          if (source is RemoteSource)
            IconButton(
              icon: const Icon(Icons.download_outlined),
              tooltip: 'Download all to device',
              onPressed: () {
                final comics = ref.read(browseComicsProvider(query)).asData?.value;
                if (comics == null || comics.isEmpty) return;
                _downloadAll(context, source, comics);
              },
            ),
          if (isCollection)
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: 'Add books or comics',
              onPressed: () => showAddToCollectionSheet(
                context,
                collectionId: collectionId!,
                collectionName: title,
              ),
            ),
        ],
      ),
      body: comicsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load:\n$e', textAlign: TextAlign.center)),
        data: (comics) {
          if (comics.isEmpty) {
            return Center(
              child: Text(
                isCollection ? 'Empty — tap + to add books or comics' : 'Nothing here yet',
                style: const TextStyle(color: CbColors.mutedForeground),
                textAlign: TextAlign.center,
              ),
            );
          }
          return LibraryGrid(
            comics: comics,
            onOpen: (comic) => context.push('/read/${comic.id}'),
            onLongPress: (comic) => showComicActionSheet(context, comic),
            onRefresh: () async {
              invalidateLibraryProviders(ref);
              await ref.read(browseComicsProvider(query).future);
            },
          );
        },
      ),
    );
  }

  /// Confirms, then downloads every readable item in [comics] to the device,
  /// showing a cancellable progress dialog and a summary.
  Future<void> _downloadAll(
    BuildContext context,
    RemoteSource source,
    List<ComicSummary> comics,
  ) async {
    final n = comics
        .where((c) => c.extension != null && supportedExtensions.contains(c.extension))
        .length;
    final messenger = ScaffoldMessenger.of(context);
    if (n == 0) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Nothing here can be read on this device')),
      );
      return;
    }
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF141414),
        title: const Text('Download to device?'),
        content: Text('Save $n item${n == 1 ? '' : 's'} from “$title” for offline reading.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Download')),
        ],
      ),
    );
    if (go != true || !context.mounted) return;
    final result = await showDialog<BulkDownloadResult>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _BulkDownloadDialog(source: source, comics: comics),
    );
    if (result != null && context.mounted) {
      messenger.showSnackBar(SnackBar(content: Text(result.summary)));
    }
  }
}

/// Runs a bulk download and shows live progress. Pops with the [BulkDownloadResult]
/// when finished (or after the user cancels).
class _BulkDownloadDialog extends ConsumerStatefulWidget {
  const _BulkDownloadDialog({required this.source, required this.comics});

  final RemoteSource source;
  final List<ComicSummary> comics;

  @override
  ConsumerState<_BulkDownloadDialog> createState() => _BulkDownloadDialogState();
}

class _BulkDownloadDialogState extends ConsumerState<_BulkDownloadDialog> {
  int _done = 0;
  int _total = 0;
  String _current = '';
  bool _cancel = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    final result = await ref.read(importControllerProvider.notifier).downloadManyFromServer(
      widget.source,
      widget.comics,
      onItem: (done, total, title) {
        if (mounted) {
          setState(() {
            _done = done;
            _total = total;
            _current = title;
          });
        }
      },
      isCancelled: () => _cancel,
    );
    if (mounted) Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF141414),
      title: const Text('Downloading to device'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LinearProgressIndicator(value: _total > 0 ? _done / _total : null),
          const SizedBox(height: 12),
          Text(_total > 0 ? '$_done of $_total' : 'Starting…'),
          if (_current.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              _current,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _cancel ? null : () => setState(() => _cancel = true),
          child: Text(_cancel ? 'Stopping…' : 'Cancel'),
        ),
      ],
    );
  }
}
