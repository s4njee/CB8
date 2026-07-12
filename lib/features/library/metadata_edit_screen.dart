import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/comic_metadata.dart';
import '../../data/repositories/providers.dart';
import '../import/metadata_scraper.dart';

/// Full-screen editor for a catalog item's bibliographic metadata.
///
/// Loads the current [ComicMetadata] from the active source, lets the user edit
/// every field, and writes it back through `updateMetadata` (the local library
/// then refreshes live via its change stream). A "Search online" action pulls
/// candidate metadata from keyless public providers (see [MetadataScraper]).
class MetadataEditScreen extends ConsumerStatefulWidget {
  /// Creates the editor for the item [comicId], titled [comicTitle].
  const MetadataEditScreen({super.key, required this.comicId, required this.comicTitle});

  /// Id of the item being edited.
  final String comicId;

  /// Initial title, shown while the full record loads.
  final String comicTitle;

  @override
  ConsumerState<MetadataEditScreen> createState() => _MetadataEditScreenState();
}

class _MetadataEditScreenState extends ConsumerState<MetadataEditScreen> {
  final _title = TextEditingController();
  final _series = TextEditingController();
  final _volume = TextEditingController();
  final _chapter = TextEditingController();
  final _author = TextEditingController();
  final _artist = TextEditingController();
  final _genre = TextEditingController();
  final _year = TextEditingController();
  final _summary = TextEditingController();

  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _title.text = widget.comicTitle;
    _load();
  }

  Future<void> _load() async {
    final meta = await ref.read(activeSourceProvider).getMetadata(widget.comicId);
    if (!mounted) return;
    if (meta != null) _apply(meta, replaceAll: true);
    setState(() => _loading = false);
  }

  /// Fills the form from [meta]. When [replaceAll] is false (applying a scraped
  /// result) only the fields the result provides are overwritten.
  void _apply(ComicMetadata meta, {required bool replaceAll}) {
    void set(TextEditingController c, String? value) {
      if (value != null && value.isNotEmpty) {
        c.text = value;
      } else if (replaceAll) {
        c.clear();
      }
    }

    set(_title, meta.title);
    if (replaceAll) {
      _series.text = meta.seriesName ?? '';
      _volume.text = meta.volumeNumber == null ? '' : _trimNum(meta.volumeNumber!);
      _chapter.text = meta.chapterNumber == null ? '' : _trimNum(meta.chapterNumber!);
    }
    set(_author, meta.author);
    set(_artist, meta.artist);
    set(_genre, meta.genre);
    set(_year, meta.year?.toString());
    set(_summary, meta.summary);
  }

  static String _trimNum(double n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

  @override
  void dispose() {
    for (final c in [
      _title, _series, _volume, _chapter, _author, _artist, _genre, _year, _summary,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title can’t be empty')),
      );
      return;
    }
    setState(() => _saving = true);
    final meta = ComicMetadata(
      title: title,
      seriesName: _series.text.trim(),
      volumeNumber: double.tryParse(_volume.text.trim()),
      chapterNumber: double.tryParse(_chapter.text.trim()),
      author: _author.text.trim(),
      artist: _artist.text.trim(),
      genre: _genre.text.trim(),
      year: int.tryParse(_year.text.trim()),
      summary: _summary.text.trim(),
    );
    await ref.read(activeSourceProvider).updateMetadata(widget.comicId, meta);
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  Future<void> _searchOnline() async {
    final result = await showModalBottomSheet<ScrapedResult>(
      context: context,
      backgroundColor: CbColors.surface,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ScraperSheet(initialQuery: _title.text.trim()),
    );
    if (result == null || !mounted) return;
    setState(() {
      _apply(
        ComicMetadata(
          title: result.title,
          author: result.author,
          genre: result.genre,
          year: result.year,
          summary: result.summary,
        ),
        replaceAll: false,
      );
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Applied metadata from ${result.source}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit metadata'),
        actions: [
          IconButton(
            tooltip: 'Search online',
            onPressed: _loading ? null : _searchOnline,
            icon: const Icon(Icons.travel_explore),
          ),
          TextButton(
            onPressed: _loading || _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save'),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _field(_title, 'Title'),
                _field(_series, 'Series'),
                Row(
                  children: [
                    Expanded(child: _field(_volume, 'Volume', number: true)),
                    const SizedBox(width: 12),
                    Expanded(child: _field(_chapter, 'Chapter', number: true)),
                  ],
                ),
                _field(_author, 'Author / writer'),
                _field(_artist, 'Artist'),
                _field(_genre, 'Genre'),
                _field(_year, 'Year', number: true),
                _field(_summary, 'Summary', maxLines: 5),
              ],
            ),
    );
  }

  Widget _field(TextEditingController c, String label, {bool number = false, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: c,
        maxLines: maxLines,
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : null,
        inputFormatters: number
            ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
            : null,
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}

/// Bottom sheet that queries external providers and returns the chosen match.
class _ScraperSheet extends StatefulWidget {
  const _ScraperSheet({required this.initialQuery});
  final String initialQuery;

  @override
  State<_ScraperSheet> createState() => _ScraperSheetState();
}

class _ScraperSheetState extends State<_ScraperSheet> {
  final _scraper = MetadataScraper();
  late final TextEditingController _query;
  List<ScrapedResult> _results = const [];
  bool _searching = false;
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    _query = TextEditingController(text: widget.initialQuery);
    if (widget.initialQuery.isNotEmpty) _run();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _searching = true;
      _searched = true;
    });
    final results = await _scraper.search(_query.text);
    if (!mounted) return;
    setState(() {
      _results = results;
      _searching = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Search online', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _query,
            autofocus: widget.initialQuery.isEmpty,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _run(),
            decoration: InputDecoration(
              hintText: 'Title, author…',
              isDense: true,
              prefixIcon: const Icon(Icons.search, size: 18),
              suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _run),
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.5),
            child: _body(),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    if (_searching) {
      return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    }
    if (!_searched) {
      return const SizedBox.shrink();
    }
    if (_results.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: Text('No matches found', style: TextStyle(color: CbColors.mutedForeground)),
        ),
      );
    }
    return ListView.builder(
      shrinkWrap: true,
      itemCount: _results.length,
      itemBuilder: (context, i) {
        final r = _results[i];
        return ListTile(
          contentPadding: EdgeInsets.zero,
          leading: r.thumbnailUrl == null
              ? const Icon(Icons.menu_book_outlined)
              : Image.network(
                  r.thumbnailUrl!,
                  width: 36,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Icon(Icons.menu_book_outlined),
                ),
          title: Text(r.title, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            r.subtitle.isEmpty ? r.source : '${r.subtitle} · ${r.source}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          onTap: () => Navigator.of(context).pop(r),
        );
      },
    );
  }
}
