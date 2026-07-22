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
import '../library/status_shelf_screen.dart';
import '../organize/collections_screen.dart';
import '../organize/series_screen.dart';
import '../settings/settings_screen.dart';

/// One destination in the Folio header's tab strip.
class _Destination {
  const _Destination(this.label, this.body);
  final String label;
  final Widget body;
}

// The Folio header keeps every CB8 destination as a text tab. Home and Browse
// merged into a single "Library" hub (hero + shelves + grid, with Tags/Recent
// as sub-pivots there); "Reading now" and "Finished" are reading-state slices;
// Collections and Series stay first-class.
const _destinations = <_Destination>[
  _Destination('Library', LibraryScreen()),
  _Destination('Reading now', StatusShelfScreen(shelf: ReadingShelf.readingNow)),
  _Destination('Finished', StatusShelfScreen(shelf: ReadingShelf.finished)),
  _Destination('Collections', CollectionsScreen()),
  _Destination('Series', SeriesScreen()),
];

/// Index of the Library destination (search results land there).
const _libraryIndex = 0;

/// App chrome: the Folio-style top header (serif wordmark + text tabs + search +
/// account) on every width. On phones the tabs drop to a scrollable strip under
/// the header instead of a side rail / bottom bar.
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

  void _select(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;

    // Surface import results as a snackbar.
    ref.listen<ImportState>(importControllerProvider, (prev, next) {
      if (prev?.running == true && !next.running && next.message != null) {
        ScaffoldMessenger.of(context)
          ..clearSnackBars()
          ..showSnackBar(SnackBar(content: Text(next.message!)));
      }
    });

    final shell = Scaffold(
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: _FolioHeader(
              index: _index,
              wide: wide,
              onSelect: _select,
              // Search filters the catalog grid, which lives on Library — jump
              // there so typing a query visibly does something from any tab.
              onNonEmptySearch: () {
                if (_index != _libraryIndex) _select(_libraryIndex);
              },
            ),
          ),
          Expanded(child: _destinations[_index].body),
        ],
      ),
    );

    final Widget content = _wrapWithDropTarget(context, shell);

    // Native macOS menu bar. Guarded to macOS: the `PlatformProvidedMenuItem`s
    // (about/quit/toggleFullScreen) only exist on macOS and throw elsewhere.
    if (!Platform.isMacOS) return content;
    final importing = ref.watch(importControllerProvider).running;
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
                        borderRadius: BorderRadius.circular(kCardRadius),
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

/// The Folio top header. On wide layouts everything sits on one row; on narrow
/// layouts the tabs move to a scrollable strip below the wordmark row.
class _FolioHeader extends ConsumerWidget {
  const _FolioHeader({
    required this.index,
    required this.wide,
    required this.onSelect,
    required this.onNonEmptySearch,
  });

  final int index;
  final bool wide;
  final ValueChanged<int> onSelect;
  final VoidCallback onNonEmptySearch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabs = [
      for (var i = 0; i < _destinations.length; i++)
        _HeaderTab(
          label: _destinations[i].label,
          selected: i == index,
          onTap: () => onSelect(i),
        ),
    ];

    final decoration = const BoxDecoration(
      border: Border(bottom: BorderSide(color: CbColors.headerRule)),
    );

    if (wide) {
      return Container(
        decoration: decoration,
        padding: const EdgeInsets.fromLTRB(40, 16, 40, 16),
        child: Row(
          children: [
            const _Wordmark(),
            const SizedBox(width: 28),
            ...tabs,
            const Spacer(),
            SizedBox(width: 260, child: _SearchField(onNonEmptySearch: onNonEmptySearch)),
            const SizedBox(width: 12),
            const _RightCluster(),
          ],
        ),
      );
    }

    // Narrow: wordmark + account row, then a full-width search, then a
    // scrollable tab strip.
    return Container(
      decoration: decoration,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      child: Column(
        children: [
          Row(
            children: [
              const _Wordmark(),
              const Spacer(),
              const _RightCluster(),
            ],
          ),
          const SizedBox(height: 10),
          _SearchField(onNonEmptySearch: onNonEmptySearch),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: tabs),
          ),
        ],
      ),
    );
  }
}

/// Serif wordmark — "CB" in the primary text color, "8" in the accent.
class _Wordmark extends StatelessWidget {
  const _Wordmark();

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Text.rich(
      TextSpan(children: [
        const TextSpan(text: 'CB'),
        TextSpan(text: '8', style: TextStyle(color: primary)),
      ]),
      style: const TextStyle(
        fontFamily: kSansFamily,
        fontSize: 21,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
      ),
    );
  }
}

/// A header text tab with a 1px accent underline when active.
class _HeaderTab extends StatelessWidget {
  const _HeaderTab({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 22),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.only(bottom: 3),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: selected ? primary : Colors.transparent),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontFamily: kSansFamily,
              fontSize: 13.5,
              color: selected ? CbColors.foreground : CbColors.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}

/// Right-side account cluster: connection switcher, import (+), and the avatar
/// (opens Settings).
class _RightCluster extends ConsumerWidget {
  const _RightCluster();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final importing = ref.watch(importControllerProvider).running;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const ConnectionSwitcher(),
        IconButton(
          icon: importing
              ? const SizedBox(
                  width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.add),
          tooltip: 'Import files',
          onPressed: importing
              ? null
              : () => ref.read(importControllerProvider.notifier).pickAndImport(),
        ),
        const SizedBox(width: 4),
        _Avatar(),
      ],
    );
  }
}

/// Circular accent avatar in the top-right. Opens Settings (CB8 has no user
/// accounts — this is the settings/overflow anchor the Folio design places here).
class _Avatar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Tooltip(
      message: 'Settings',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ),
        child: Container(
          width: 30,
          height: 30,
          decoration: const BoxDecoration(color: CbColors.avatarBg, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Icon(Icons.settings_outlined, size: 16, color: primary),
        ),
      ),
    );
  }
}

class _SearchField extends ConsumerStatefulWidget {
  const _SearchField({this.onNonEmptySearch});

  /// Called when a non-empty query is submitted to the library filter.
  final VoidCallback? onNonEmptySearch;

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
      if (v.trim().isNotEmpty) widget.onNonEmptySearch?.call();
    });
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: TextField(
        onChanged: _onChanged,
        textAlignVertical: TextAlignVertical.center,
        style: const TextStyle(fontSize: 13),
        decoration: const InputDecoration(
          hintText: 'Search titles, authors…',
          prefixIcon: Icon(Icons.search, size: 18),
          isDense: true,
        ),
      ),
    );
  }
}
