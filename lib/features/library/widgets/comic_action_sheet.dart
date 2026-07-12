import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';
import '../../../data/sources/remote_source.dart';
import '../../import/media_probe.dart' show supportedExtensions;
import '../../import/offline_downloads.dart';
import '../../organize/widgets/collection_item_picker.dart' show promptCollectionName;
import '../metadata_edit_screen.dart';

/// Long-press action sheet for a catalog item: favorite, manage tags, and add to
/// collections. All edits go through the active source, so the library refreshes
/// live via the change stream.
Future<void> showComicActionSheet(BuildContext context, ComicSummary comic) {
  HapticFeedback.mediumImpact(); // confirm the long-press (mobile)
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: CbColors.surface,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _ComicActionSheet(comic: comic),
  );
}

class _ComicActionSheet extends ConsumerStatefulWidget {
  const _ComicActionSheet({required this.comic});
  final ComicSummary comic;

  @override
  ConsumerState<_ComicActionSheet> createState() => _ComicActionSheetState();
}

class _ComicActionSheetState extends ConsumerState<_ComicActionSheet> {
  final _tagController = TextEditingController();
  List<String> _tags = [];
  Set<String> _memberLibraries = {};
  bool _favorite = false;
  bool _wantToRead = false;
  bool _loading = true;
  bool _downloaded = false;
  bool _downloading = false;
  double? _downloadProgress;

  /// Whether the active source supports owner-style management (edit/delete/
  /// want-to-read). False for remote servers — those rows are then hidden.
  bool get _canManage => ref.read(activeSourceProvider).supportsLibraryManagement;

  /// Whether this item can be downloaded for offline use: the active source is a
  /// server and the format is one the on-device readers can open. Hidden for the
  /// local library (already on device) and for formats like CBR/MOBI.
  bool get _canDownload {
    final source = ref.read(activeSourceProvider);
    return source is RemoteSource &&
        supportedExtensions.contains(widget.comic.extension);
  }

  @override
  void initState() {
    super.initState();
    _favorite = widget.comic.isFavorite;
    _load();
  }

  Future<void> _load() async {
    final source = ref.read(activeSourceProvider);
    final tags = await source.tagsForComic(widget.comic.id);
    final libs = await source.librariesForComic(widget.comic.id);
    final want = _canManage ? await source.isWantToRead(widget.comic.id) : false;
    final downloaded = source is RemoteSource &&
            supportedExtensions.contains(widget.comic.extension)
        ? await ref.read(offlineDownloaderProvider).isDownloaded(source, widget.comic)
        : false;
    if (!mounted) return;
    setState(() {
      _tags = tags;
      _memberLibraries = libs;
      _wantToRead = want;
      _downloaded = downloaded;
      _loading = false;
    });
  }

  @override
  void dispose() {
    _tagController.dispose();
    super.dispose();
  }

  void _toggleFavorite() {
    setState(() => _favorite = !_favorite);
    ref.read(activeSourceProvider).setFavorite(widget.comic.id, _favorite);
  }

  void _toggleWantToRead() {
    setState(() => _wantToRead = !_wantToRead);
    ref.read(activeSourceProvider).setWantToRead(widget.comic.id, _wantToRead);
  }

  Future<void> _download() async {
    final source = ref.read(activeSourceProvider);
    if (source is! RemoteSource) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _downloading = true;
      _downloadProgress = null;
    });
    try {
      final outcome = await ref.read(offlineDownloaderProvider).downloadFromServer(
        source,
        widget.comic,
        onProgress: (received, total) {
          if (!mounted) return;
          setState(() => _downloadProgress = total > 0 ? received / total : null);
        },
      );
      if (!mounted) return;
      setState(() {
        _downloading = false;
        _downloaded = true;
      });
      messenger.showSnackBar(SnackBar(
        content: Text(outcome == DownloadOutcome.alreadyDownloaded
            ? 'Already on this device'
            : 'Saved to this device — find it under “This device”'),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _downloading = false);
      final msg = e is UnsupportedError
          ? (e.message ?? 'That format can’t be read on this device')
          : 'Download failed — check your connection and try again';
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> _editMetadata() async {
    final navigator = Navigator.of(context);
    final saved = await navigator.push<bool>(
      MaterialPageRoute(
        builder: (_) => MetadataEditScreen(
          comicId: widget.comic.id,
          comicTitle: widget.comic.title,
        ),
      ),
    );
    if (saved == true && mounted) navigator.maybePop();
  }

  Future<void> _delete() async {
    final navigator = Navigator.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: CbColors.surface,
        title: const Text('Delete from library?'),
        content: Text(
          'Removes “${widget.comic.title}” from your library. This also deletes '
          'the imported file from this device.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(activeSourceProvider).deleteComic(widget.comic.id);
    if (mounted) navigator.maybePop();
  }

  Future<void> _addTag(String raw) async {
    final name = raw.trim();
    if (name.isEmpty || _tags.contains(name)) {
      _tagController.clear();
      return;
    }
    final next = [..._tags, name];
    setState(() {
      _tags = next;
      _tagController.clear();
    });
    await ref.read(activeSourceProvider).setTagsForComic(widget.comic.id, next);
  }

  Future<void> _removeTag(String name) async {
    final next = _tags.where((t) => t != name).toList();
    setState(() => _tags = next);
    await ref.read(activeSourceProvider).setTagsForComic(widget.comic.id, next);
  }

  Future<void> _toggleLibrary(String libraryId, bool member) async {
    setState(() {
      if (member) {
        _memberLibraries = {..._memberLibraries, libraryId};
      } else {
        _memberLibraries = _memberLibraries.where((id) => id != libraryId).toSet();
      }
    });
    await ref.read(activeSourceProvider).setInLibrary(libraryId, widget.comic.id, member);
  }

  Future<void> _createCollection() async {
    final name = await promptCollectionName(context);
    if (name == null || name.trim().isEmpty) return;
    final id = await ref.read(activeSourceProvider).createLibrary(name.trim());
    ref.invalidate(librariesProvider);
    if (id.isNotEmpty) await _toggleLibrary(id, true);
  }

  @override
  Widget build(BuildContext context) {
    final libraries = ref.watch(librariesProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.comic.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(_favorite ? Icons.favorite : Icons.favorite_border,
                  color: _favorite ? const Color(0xFFEF4444) : null),
              title: Text(_favorite ? 'Favorited' : 'Add to favorites'),
              onTap: _toggleFavorite,
            ),
            if (_canDownload)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: _downloading
                    ? SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, value: _downloadProgress),
                      )
                    : Icon(
                        _downloaded ? Icons.download_done : Icons.download_outlined,
                        color: _downloaded
                            ? Theme.of(context).colorScheme.primary
                            : null,
                      ),
                title: Text(_downloading
                    ? 'Downloading…'
                    : (_downloaded ? 'On this device' : 'Download to device')),
                subtitle: Text(_downloading
                    ? (_downloadProgress == null
                        ? 'Starting…'
                        : '${(_downloadProgress! * 100).round()}%')
                    : (_downloaded
                        ? 'Available offline'
                        : 'Save for offline reading')),
                onTap: (_downloading || _downloaded) ? null : _download,
              ),
            if (_canManage) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(_wantToRead ? Icons.bookmark_added : Icons.bookmark_add_outlined,
                    color: _wantToRead ? Theme.of(context).colorScheme.primary : null),
                title: Text(_wantToRead ? 'On your want-to-read shelf' : 'Want to read'),
                onTap: _toggleWantToRead,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit metadata'),
                onTap: _editMetadata,
              ),
            ],
            const Divider(),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              const Text('Tags', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final tag in _tags)
                    Chip(
                      label: Text(tag),
                      onDeleted: () => _removeTag(tag),
                      backgroundColor: CbColors.surfaceAlt,
                    ),
                ],
              ),
              TextField(
                controller: _tagController,
                decoration: const InputDecoration(
                  hintText: 'Add a tag…',
                  isDense: true,
                  prefixIcon: Icon(Icons.tag, size: 18),
                ),
                onSubmitted: _addTag,
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Collections', style: TextStyle(fontWeight: FontWeight.w600)),
                  TextButton.icon(
                    onPressed: _createCollection,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('New'),
                  ),
                ],
              ),
              libraries.maybeWhen(
                data: (libs) => libs.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No collections yet — create one above.',
                            style: TextStyle(color: Color(0xFF888888))),
                      )
                    : Column(
                        children: [
                          for (final lib in libs)
                            CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              value: _memberLibraries.contains(lib.id),
                              title: Text(lib.name),
                              onChanged: (v) => _toggleLibrary(lib.id, v ?? false),
                            ),
                        ],
                      ),
                orElse: () => const SizedBox(height: 8),
              ),
              if (_canManage) ...[
                const Divider(),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                  title: const Text('Delete from library',
                      style: TextStyle(color: Color(0xFFEF4444))),
                  onTap: _delete,
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

