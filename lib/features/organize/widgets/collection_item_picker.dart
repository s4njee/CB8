import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/db/database.dart' show MediaTypes;
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../../../data/sources/library_source.dart';
import '../../library/widgets/comic_cover.dart';

/// Asks the user to name a new collection. Returns the entered name, or null
/// if cancelled. Shared by the Collections tab and the item action sheet.
Future<String?> promptCollectionName(BuildContext context) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: CbColors.surface,
      title: const Text('New collection'),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Name'),
        onSubmitted: (v) => Navigator.of(context).pop(v),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Create')),
      ],
    ),
  );
}

/// Opens the full-screen picker for adding library items to the collection
/// [collectionId] (named [collectionName]). Membership edits apply immediately.
Future<void> showAddToCollectionSheet(
  BuildContext context, {
  required String collectionId,
  required String collectionName,
}) {
  return Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) =>
          _AddToCollectionScreen(collectionId: collectionId, collectionName: collectionName),
    ),
  );
}

/// Lists every library book/comic with a checkbox reflecting whether it belongs
/// to the collection, plus a media-type filter and title search.
class _AddToCollectionScreen extends ConsumerStatefulWidget {
  const _AddToCollectionScreen({required this.collectionId, required this.collectionName});

  final String collectionId;
  final String collectionName;

  @override
  ConsumerState<_AddToCollectionScreen> createState() => _AddToCollectionScreenState();
}

class _AddToCollectionScreenState extends ConsumerState<_AddToCollectionScreen> {
  List<ComicSummary> _all = [];
  Set<String> _members = {};
  String? _mediaType; // null = all, else MediaTypes.comic / .book
  String _search = '';
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
      final all = await source.listComics(const LibraryQuery(limit: 2000, sort: LibrarySort.title, descending: false));
      final members =
          await source.listComics(LibraryQuery(libraryId: widget.collectionId, limit: 2000));
      if (!mounted) return;
      setState(() {
        _all = all;
        _members = members.map((c) => c.id).toSet();
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _toggle(ComicSummary comic, bool member) async {
    setState(() {
      _members = member ? {..._members, comic.id} : (_members.where((id) => id != comic.id).toSet());
    });
    await ref.read(activeSourceProvider).setInLibrary(widget.collectionId, comic.id, member);
  }

  List<ComicSummary> get _visible {
    final q = _search.trim().toLowerCase();
    return _all.where((c) {
      if (_mediaType != null && c.mediaType != _mediaType) return false;
      if (q.isNotEmpty && !c.title.toLowerCase().contains(q)) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final items = _visible;
    return Scaffold(
      appBar: AppBar(
        title: Text('Add to ${widget.collectionName}', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: const Text('Done'),
          ),
        ],
      ),
      body: _error != null
          ? Center(child: Text('Failed to load:\n$_error', textAlign: TextAlign.center))
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                      child: TextField(
                        decoration: const InputDecoration(
                          hintText: 'Search title…',
                          isDense: true,
                          prefixIcon: Icon(Icons.search, size: 18),
                        ),
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      child: Row(
                        children: [
                          _FilterChip(
                            label: 'All',
                            selected: _mediaType == null,
                            onTap: () => setState(() => _mediaType = null),
                          ),
                          _FilterChip(
                            label: 'Comics',
                            selected: _mediaType == MediaTypes.comic,
                            onTap: () => setState(() => _mediaType = MediaTypes.comic),
                          ),
                          _FilterChip(
                            label: 'Books',
                            selected: _mediaType == MediaTypes.book,
                            onTap: () => setState(() => _mediaType = MediaTypes.book),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: items.isEmpty
                          ? const Center(
                              child: Text('Nothing matches',
                                  style: TextStyle(color: CbColors.mutedForeground)),
                            )
                          : ListView.builder(
                              itemCount: items.length,
                              itemBuilder: (context, i) {
                                final comic = items[i];
                                return CheckboxListTile(
                                  value: _members.contains(comic.id),
                                  onChanged: (v) => _toggle(comic, v ?? false),
                                  controlAffinity: ListTileControlAffinity.trailing,
                                  secondary: _CoverThumb(comic: comic),
                                  title: Text(comic.title,
                                      maxLines: 2, overflow: TextOverflow.ellipsis),
                                  subtitle: Text(
                                    comic.mediaType == MediaTypes.book ? 'Book' : 'Comic',
                                    style: const TextStyle(color: CbColors.mutedForeground, fontSize: 12),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }
}

/// Small 2:3 cover for a picker row — shares the lazy-loading [ComicCover].
class _CoverThumb extends StatelessWidget {
  const _CoverThumb({required this.comic});
  final ComicSummary comic;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: SizedBox(width: 32, height: 48, child: ComicCover(comic: comic)),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
      ),
    );
  }
}
