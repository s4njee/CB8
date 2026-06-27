import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../import/import_controller.dart';

/// Settings — for the foundation this exposes the accent-theme picker (CB8's
/// theme menu). Connections, import, and reader prefs land in later milestones.
class SettingsScreen extends ConsumerWidget {
  /// Creates the Settings screen.
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accent = ref.watch(accentThemeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Accent', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
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
          const ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.cloud_outlined),
            title: Text('Connections'),
            subtitle: Text('Connect to a CB8 server — coming soon'),
          ),
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
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.auto_awesome_outlined),
            title: const Text('Load sample comics'),
            subtitle: const Text('Generate a few demo CBZ books to try the reader'),
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
