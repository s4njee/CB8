import 'dart:async';
import 'dart:io';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/library_source.dart';
import '../connections/connection_switcher.dart';
import '../import/import_controller.dart';
import '../import/watched_folders.dart';
import '../library/library_screen.dart';
import '../library/recent_screen.dart';
import '../organize/collections_screen.dart';
import '../organize/series_screen.dart';
import '../organize/tags_screen.dart';
import '../settings/settings_screen.dart';

/// One destination in the primary navigation.
class _Destination {
  const _Destination(this.label, this.icon, this.selectedIcon, this.body);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget body;
}

const _destinations = <_Destination>[
  _Destination('All', Icons.grid_view_outlined, Icons.grid_view, LibraryScreen()),
  _Destination('Recent', Icons.history_outlined, Icons.history, RecentScreen()),
  _Destination('Collections', Icons.collections_bookmark_outlined,
      Icons.collections_bookmark, CollectionsScreen()),
  _Destination('Series', Icons.menu_book_outlined, Icons.menu_book, SeriesScreen()),
  _Destination('Tags', Icons.tag_outlined, Icons.tag, TagsScreen()),
];

/// App chrome with adaptive navigation: a bottom [NavigationBar] on phones and a
/// [NavigationRail] on wide layouts — the CB8 TabBar/Sidebar split.
class AppShell extends ConsumerStatefulWidget {
  /// Creates the app shell.
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;
  bool _dragging = false; // desktop drag-and-drop hover state

  @override
  void initState() {
    super.initState();
    // Construct the watched-folders controller so it rescans (and, on desktop,
    // begins live-watching) the user's folders at launch.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(watchedFoldersProvider);
    });
    // Dev aid: `--dart-define=SEED=true` auto-loads sample comics on first run
    // (used to demo on a fresh simulator). No effect in normal builds.
    if (const bool.fromEnvironment('SEED')) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final existing =
            await ref.read(activeSourceProvider).listComics(const LibraryQuery(limit: 1));
        if (existing.isEmpty) {
          await ref.read(importControllerProvider.notifier).importSamples();
        }
      });
    }
    // Dev aid: `--dart-define=MOCK_SERVER=http://host:port` auto-adds that server
    // connection on first run so server mode can be exercised without typing.
    const mockServer = String.fromEnvironment('MOCK_SERVER');
    if (mockServer.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final state = ref.read(connectionsProvider);
        final exists = state.connections.any((c) => c.baseUrl == mockServer);
        if (!exists) {
          await ref.read(connectionsProvider.notifier).addConnection('Mock server', mockServer);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 768;
    final dest = _destinations[_index];

    // Surface import results as a snackbar.
    ref.listen<ImportState>(importControllerProvider, (prev, next) {
      if (prev?.running == true && !next.running && next.message != null) {
        ScaffoldMessenger.of(context)
          ..clearSnackBars()
          ..showSnackBar(SnackBar(content: Text(next.message!)));
      }
    });
    final importing = ref.watch(importControllerProvider).running;

    final appBar = AppBar(
      titleSpacing: 16,
      title: Row(
        children: [
          Text.rich(
            TextSpan(children: [
              const TextSpan(
                  text: 'CB', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
              TextSpan(
                text: '8',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                    color: Theme.of(context).colorScheme.primary),
              ),
            ]),
          ),
          const SizedBox(width: 16),
          Expanded(child: _SearchField()),
        ],
      ),
      actions: [
        const ConnectionSwitcher(),
        IconButton(
          icon: importing
              ? const SizedBox(
                  width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.add),
          tooltip: 'Import files',
          onPressed:
              importing ? null : () => ref.read(importControllerProvider.notifier).pickAndImport(),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined),
          tooltip: 'Settings',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const SettingsScreen()),
          ),
        ),
        const SizedBox(width: 4),
      ],
    );

    final Widget shell = wide
        ? Scaffold(
            appBar: appBar,
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: _index,
                  onDestinationSelected: (i) => setState(() => _index = i),
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: CbColors.surface,
                  destinations: [
                    for (final d in _destinations)
                      NavigationRailDestination(
                        icon: Icon(d.icon),
                        selectedIcon: Icon(d.selectedIcon),
                        label: Text(d.label),
                      ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: dest.body),
              ],
            ),
          )
        : Scaffold(
            appBar: appBar,
            body: dest.body,
            bottomNavigationBar: NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                for (final d in _destinations)
                  NavigationDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selectedIcon),
                    label: d.label,
                  ),
              ],
            ),
          );

    final Widget content = _wrapWithDropTarget(context, shell);

    // Native macOS menu bar. Guarded to macOS: the `PlatformProvidedMenuItem`s
    // (about/quit/toggleFullScreen) only exist on macOS and throw on iOS /
    // Windows / Linux ("no platform provided menu for ...").
    if (!Platform.isMacOS) return content;
    return PlatformMenuBar(
      menus: [
        PlatformMenu(
          label: 'CB8',
          menus: [
            const PlatformProvidedMenuItem(type: PlatformProvidedMenuItemType.about),
            const PlatformProvidedMenuItem(type: PlatformProvidedMenuItemType.quit),
          ],
        ),
        PlatformMenu(
          label: 'File',
          menus: [
            PlatformMenuItem(
              label: 'Import Files…',
              shortcut: const SingleActivator(LogicalKeyboardKey.keyO, meta: true),
              onSelected: importing
                  ? null
                  : () => ref.read(importControllerProvider.notifier).pickAndImport(),
            ),
          ],
        ),
        const PlatformMenu(
          label: 'View',
          menus: [
            PlatformProvidedMenuItem(type: PlatformProvidedMenuItemType.toggleFullScreen),
          ],
        ),
      ],
      child: content,
    );
  }

  /// On desktop, lets users drop CBZ/PDF/EPUB files (or folders) onto the window
  /// to import them. A no-op passthrough on mobile (desktop_drop has no iOS).
  Widget _wrapWithDropTarget(BuildContext context, Widget child) {
    if (!(Platform.isMacOS || Platform.isWindows || Platform.isLinux)) return child;
    final scheme = Theme.of(context).colorScheme;
    return DropTarget(
      onDragEntered: (_) => setState(() => _dragging = true),
      onDragExited: (_) => setState(() => _dragging = false),
      onDragDone: (detail) {
        setState(() => _dragging = false);
        final paths = detail.files.map((f) => f.path).where((p) => p.isNotEmpty).toList();
        if (paths.isNotEmpty) {
          ref.read(importControllerProvider.notifier).importDropped(paths);
        }
      },
      child: Stack(
        children: [
          child,
          if (_dragging)
            Positioned.fill(
              child: IgnorePointer(
                child: ColoredBox(
                  color: scheme.primary.withValues(alpha: 0.10),
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 22),
                      decoration: BoxDecoration(
                        color: CbColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: scheme.primary, width: 2),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.file_download_outlined, size: 28),
                          SizedBox(width: 12),
                          Text('Drop CBZ / PDF / EPUB to import',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SearchField extends ConsumerStatefulWidget {
  @override
  ConsumerState<_SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends ConsumerState<_SearchField> {
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  // Debounce so each keystroke doesn't fire a query — on a remote source that
  // was a network round-trip per character.
  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(libraryQueryProvider.notifier).setSearch(v);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: TextField(
        onChanged: _onChanged,
        textAlignVertical: TextAlignVertical.center,
        decoration: const InputDecoration(
          hintText: 'Search',
          prefixIcon: Icon(Icons.search, size: 18),
          isDense: true,
        ),
      ),
    );
  }
}
