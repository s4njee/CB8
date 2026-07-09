import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';
import 'comic/comic_reader_screen.dart';
import 'pdf/pdf_reader_screen.dart';
import 'progress_sync.dart';
import 'unified_reader_screen.dart';
import 'widgets/reader_widgets.dart';

/// Opens the right reader for a catalog item's format.
///
/// Loads the item fresh on mount (not via a cached provider) so the resume page
/// always reflects the latest saved progress, while the chosen reader stays
/// stable for the duration of the reading session.
class ReaderDispatcher extends ConsumerStatefulWidget {
  /// Creates a dispatcher that opens the item with [comicId].
  const ReaderDispatcher({super.key, required this.comicId});

  /// Id of the catalog item to open.
  final String comicId;

  @override
  ConsumerState<ReaderDispatcher> createState() => _ReaderDispatcherState();
}

class _ReaderDispatcherState extends ConsumerState<ReaderDispatcher> {
  ComicSummary? _comic;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final source = ref.read(activeSourceProvider);
      final comic = await source.getComic(widget.comicId);
      if (comic == null) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      var resolved = comic;
      // Remote books are downloaded to a temp file and read locally. The CB8
      // server does not expose WebPub/OPDS manifests yet, so mobile follows the
      // same download-first path as desktop.
      final ext = comic.extension;
      final isBook = ext == 'pdf' || ext == 'epub';
      if (comic.sourceUri == null && isBook && source is RemoteSource) {
        final dir = await getTemporaryDirectory();
        final path = p.join(dir.path, 'remote_${comic.id}.$ext');
        // Cache across opens: re-downloading a whole book (a large EPUB/PDF can
        // be tens of MB) every time made reopening slow. Download to a `.part`
        // file and rename on success, so an interrupted/partial download is never
        // cached and served as a corrupt book.
        final file = File(path);
        if (!await file.exists() || await file.length() == 0) {
          final partPath = '$path.part';
          await source.downloadFile(comic.id, partPath);
          await File(partPath).rename(path);
        }
        resolved = comic.copyWith(sourceUri: path);
      }

      // Downloaded-for-offline copy? Its origin server may have a newer position
      // from another device. Offer to jump there before opening.
      if (resolved.hasServerOrigin) {
        final remote = await pullNewerOriginProgress(ref, resolved);
        if (remote != null && mounted) {
          final jump = await _askJump(remote.fraction);
          if (jump == true) {
            resolved = resolved.withProgress(
              lastPage: remote.lastPage,
              lastLocation: remote.lastLocation,
              lastPercent: remote.lastPercent,
              completed: remote.completed,
            );
            // Persist locally so the adopted position sticks even if they stop
            // before it's re-saved by reading.
            await ref.read(activeSourceProvider).setProgress(
                  resolved.id,
                  page: remote.lastPage,
                  location: remote.lastLocation,
                  percent: remote.lastPercent,
                  completed: remote.completed,
                );
          }
        }
      }

      if (!mounted) return;
      setState(() {
        _comic = resolved;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  /// Asks whether to jump to the server's newer position ([fraction] is 0..1).
  Future<bool?> _askJump(double fraction) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Continue from another device?'),
        content: Text(
          'You’re further along on your server — ${(fraction * 100).round()}% '
          'read. Jump there, or keep reading from your saved place on this '
          'device?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay here'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Jump ahead'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final comic = _comic;
    if (comic == null) {
      return _errorScreen(
        _error == null ? 'Item not found.' : 'Could not open:\n$_error',
      );
    }
    switch (comic.extension) {
      case 'cbz':
      case 'cbt':
        return ComicReaderScreen(comic: comic);
      case 'pdf':
        return PdfReaderScreen(comic: comic);
      case 'epub':
        return UnifiedReaderScreen(comic: comic);
      default:
        return _errorScreen(
          '${comic.extension?.toUpperCase() ?? 'This format'} is not supported yet.',
        );
    }
  }

  Widget _errorScreen(String message) => Scaffold(
    backgroundColor: Colors.black,
    body: ReaderMessage(message: message),
  );
}
