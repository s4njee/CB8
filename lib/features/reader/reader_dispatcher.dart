import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/models/comic_summary.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';
import 'comic/comic_reader_screen.dart';
import 'epub/epub_reader_screen.dart';
import 'pdf/pdf_reader_screen.dart';

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
      // Remote books stream as a whole file; download to temp and read locally.
      // (Remote comics stream page-by-page, handled inside the comic reader.)
      final ext = comic.extension;
      final isBook = ext == 'pdf' || ext == 'epub';
      if (comic.sourceUri == null && isBook && source is RemoteSource) {
        final dir = await getTemporaryDirectory();
        final path = p.join(dir.path, 'remote_${comic.id}.$ext');
        await source.downloadFile(comic.id, path);
        resolved = comic.copyWith(sourceUri: path);
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
      return _ReaderError(message: _error == null ? 'Item not found.' : 'Could not open:\n$_error');
    }
    switch (comic.extension) {
      case 'cbz':
        return ComicReaderScreen(comic: comic);
      case 'pdf':
        // Native pdfrx viewer: crisp vector rendering + streams large PDFs.
        return PdfReaderScreen(comic: comic);
      case 'epub':
        return EpubReaderScreen(comic: comic);
      default:
        return _ReaderError(
          message: '${comic.extension?.toUpperCase() ?? 'This format'} is not supported yet.',
        );
    }
  }
}

class _ReaderError extends StatelessWidget {
  const _ReaderError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message,
                  textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('Back'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
