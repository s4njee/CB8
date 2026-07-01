import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../import/watched_folders.dart';

/// Manages the folders CB8 watches for automatic ingestion: add a folder, force
/// a rescan, or remove one. See [WatchedFoldersController].
class WatchedFoldersScreen extends ConsumerStatefulWidget {
  /// Creates the watched-folders screen.
  const WatchedFoldersScreen({super.key});

  @override
  ConsumerState<WatchedFoldersScreen> createState() => _WatchedFoldersScreenState();
}

class _WatchedFoldersScreenState extends ConsumerState<WatchedFoldersScreen> {
  bool _busy = false;

  Future<void> _addFolder() async {
    final path = await FilePicker.getDirectoryPath();
    if (path == null) return;
    setState(() => _busy = true);
    final error = await ref.read(watchedFoldersProvider.notifier).addFolder(path);
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    }
  }

  Future<void> _rescan(String id) async {
    setState(() => _busy = true);
    final count = await ref.read(watchedFoldersProvider.notifier).rescan(id);
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(count == 0 ? 'No new files found' : 'Imported $count new file${count == 1 ? '' : 's'}'),
    ));
  }

  Future<void> _rescanAll() async {
    setState(() => _busy = true);
    final count = await ref.read(watchedFoldersProvider.notifier).rescanAll();
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(count == 0 ? 'No new files found' : 'Imported $count new file${count == 1 ? '' : 's'}'),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final folders = ref.watch(watchedFoldersProvider);
    final liveWatch = Platform.isMacOS || Platform.isWindows || Platform.isLinux;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Watched folders'),
        actions: [
          if (folders.isNotEmpty)
            IconButton(
              tooltip: 'Rescan all',
              onPressed: _busy ? null : _rescanAll,
              icon: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _addFolder,
        icon: const Icon(Icons.create_new_folder_outlined),
        label: const Text('Add folder'),
      ),
      body: folders.isEmpty
          ? _Empty(liveWatch: liveWatch)
          : ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: Text(
                    liveWatch
                        ? 'Folders are rescanned on launch and watched live while CB8 runs. '
                            'Files are referenced in place, not copied.'
                        : 'Tap a folder to rescan it for new files. Files are referenced '
                            'in place, not copied.',
                    style: const TextStyle(color: CbColors.mutedForeground, fontSize: 13),
                  ),
                ),
                for (final f in folders)
                  ListTile(
                    leading: const Icon(Icons.folder_outlined),
                    title: Text(f.path, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(f.lastScanned == null
                        ? 'Never scanned'
                        : 'Last scanned ${_ago(f.lastScanned!)}'),
                    onTap: _busy ? null : () => _rescan(f.id),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'Stop watching',
                      onPressed: _busy
                          ? null
                          : () => ref.read(watchedFoldersProvider.notifier).removeFolder(f.id),
                    ),
                  ),
              ],
            ),
    );
  }

  static String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inHours < 1) return '${d.inMinutes}m ago';
    if (d.inDays < 1) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.liveWatch});
  final bool liveWatch;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.folder_open_outlined, size: 48, color: CbColors.mutedForeground),
            const SizedBox(height: 12),
            const Text('No watched folders', style: TextStyle(color: CbColors.mutedForeground)),
            const SizedBox(height: 4),
            Text(
              liveWatch
                  ? 'Add a folder to auto-import its comics and books, and keep it in sync.'
                  : 'Add a folder, then rescan it to import its comics and books.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }
}
