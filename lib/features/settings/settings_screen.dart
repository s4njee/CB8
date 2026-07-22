import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../data/repositories/providers.dart';
import '../import/import_controller.dart';
import '../library/duplicates_screen.dart';
import 'reading_stats_screen.dart';
import 'watched_folders_screen.dart';

/// Settings: appearance (accent color) and library import.
///
/// Server connections are managed from the app-bar connection switcher
/// (`ConnectionSwitcher`), not here. Sample-comic generation is a debug-only aid
/// and is hidden in release builds.
class SettingsScreen extends ConsumerWidget {
  /// Creates the Settings screen.
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accent = ref.watch(accentThemeProvider);
    final canManage = ref.watch(activeSourceProvider).supportsLibraryManagement;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('ACCENT', style: cbSectionLabel()),
          const SizedBox(height: 14),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final a in AccentTheme.values)
                _Swatch(
                  accent: a,
                  selected: a == accent,
                  onTap: () => ref.read(accentThemeProvider.notifier).select(a),
                ),
            ],
          ),
          const Divider(height: 40),
          Text('READING', style: cbSectionLabel()),
          const SizedBox(height: 4),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.insights_outlined),
            title: const Text('Reading stats'),
            subtitle: const Text('Time read, streaks, and finished books'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ReadingStatsScreen()),
            ),
          ),
          const Divider(height: 40),
          Text('LIBRARY', style: cbSectionLabel()),
          const SizedBox(height: 4),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.file_download_outlined),
            title: const Text('Import files'),
            subtitle: const Text('Add CBZ / PDF / EPUB from this device'),
            trailing: const Icon(Icons.add),
            onTap: () {
              ref.read(importControllerProvider.notifier).pickAndImport();
              Navigator.of(context).maybePop();
            },
          ),
          if (canManage) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.folder_outlined),
              title: const Text('Watched folders'),
              subtitle: const Text('Auto-import comics & books from chosen folders'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const WatchedFoldersScreen()),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.content_copy_outlined),
              title: const Text('Find duplicates'),
              subtitle: const Text('Spot and remove duplicate items'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DuplicatesScreen()),
              ),
            ),
          ],
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.playlist_remove_outlined),
            title: const Text('Clear Continue Reading'),
            subtitle: const Text('Empties the shelf — your place in each book is kept'),
            onTap: () => _confirmClearContinue(context, ref),
          ),
          // Synthetic sample content is a development aid only — hidden in
          // release builds.
          if (kDebugMode)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.auto_awesome_outlined),
              title: const Text('Load sample comics'),
              subtitle: const Text('Generate demo CBZ books (debug builds only)'),
              onTap: () {
                ref.read(importControllerProvider.notifier).importSamples();
                Navigator.of(context).maybePop();
              },
            ),
        ],
      ),
    );
  }
}

/// Confirms, then clears the continue-reading shelf while keeping every book's
/// saved position. See [clearContinueReading].
Future<void> _confirmClearContinue(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Clear Continue Reading?'),
      content: const Text(
        'Removes every book from the Continue Reading shelf. Your place in each '
        'one is kept — a book reappears here if you read it further.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear')),
      ],
    ),
  );
  if (confirmed != true) return;
  final cleared = await clearContinueReading(ref);
  messenger.showSnackBar(SnackBar(
    content: Text(cleared == 0
        ? 'Continue Reading is already empty'
        : 'Cleared $cleared ${cleared == 1 ? 'book' : 'books'} from Continue Reading'),
  ));
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.accent, required this.selected, required this.onTap});
  final AccentTheme accent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: accent.color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? Colors.white : CbColors.border,
            width: selected ? 3 : 1,
          ),
        ),
        child: selected ? const Icon(Icons.check, color: Colors.white, size: 20) : null,
      ),
    );
  }
}
