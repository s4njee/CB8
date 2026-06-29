import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/window_control.dart';
import '../comic/reading_mode.dart';

/// Centered message with a Back button — the shared empty/error state used by the
/// readers. Render it on top of whatever background the caller already provides
/// (a black [Scaffold], a [Stack], etc.).
class ReaderMessage extends StatelessWidget {
  /// Creates a reader message showing [message].
  const ReaderMessage({super.key, required this.message});

  /// The text to show.
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
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
    );
  }
}

/// Translucent top chrome shared by the comic and PDF readers: back button,
/// title, an optional macOS fullscreen toggle, and the reading-mode menu.
/// Returns a [Positioned], so place it directly inside the reader's [Stack].
class ReaderTopBar extends StatelessWidget {
  /// Creates the top bar for [title] showing reading [mode].
  const ReaderTopBar({
    super.key,
    required this.title,
    required this.mode,
    this.upscaleEnabled,
    this.onToggleUpscale,
    this.extraActions = const [],
  });

  /// The book/comic title.
  final String title;

  /// The current reading mode (drives the mode-menu icon and check).
  final ReadingMode mode;

  /// Reader-specific actions inserted before the reading-mode menu (e.g. the
  /// comic reader's direction / cover-first toggles). Empty for readers that
  /// have none.
  final List<Widget> extraActions;

  /// When non-null, shows an "HD" (Real-ESRGAN) toggle reflecting this on/off
  /// state. Null hides the toggle entirely (e.g. local files or the PDF reader,
  /// which can't be server-upscaled).
  final bool? upscaleEnabled;

  /// Called when the HD toggle is tapped. Only used when [upscaleEnabled] is set.
  final VoidCallback? onToggleUpscale;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
            if (onToggleUpscale != null)
              IconButton(
                tooltip: upscaleEnabled! ? 'HD upscaling on' : 'HD upscaling off',
                icon: Icon(
                  Icons.auto_awesome,
                  color: upscaleEnabled! ? Theme.of(context).colorScheme.primary : Colors.white,
                ),
                onPressed: onToggleUpscale,
              ),
            ...extraActions,
            if (Platform.isMacOS)
              IconButton(
                tooltip: 'Toggle fullscreen (f)',
                icon: const Icon(Icons.fullscreen, color: Colors.white),
                onPressed: WindowControl.toggleFullscreen,
              ),
            ReadingModeMenu(mode: mode, color: Colors.white),
            const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }
}

/// Translucent bottom chrome shared by the comic and PDF readers: a page slider
/// and a "current / total" label. Returns a [Positioned] for the reader's
/// [Stack]. [onSeek] receives a 0-based page index.
class ReaderBottomBar extends StatelessWidget {
  /// Creates the bottom bar for [page] of [count], seeking via [onSeek].
  const ReaderBottomBar({
    super.key,
    required this.page,
    required this.count,
    required this.onSeek,
  });

  /// The current 0-based page index.
  final int page;

  /// Total page count.
  final int count;

  /// Called with a 0-based page index when the slider moves.
  final ValueChanged<int> onSeek;

  @override
  Widget build(BuildContext context) {
    final maxVal = math.max(0.0, (count - 1).toDouble());
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black.withValues(alpha: 0.55),
        padding: EdgeInsets.only(
          bottom: MediaQuery.paddingOf(context).bottom + 8,
          top: 8,
          left: 12,
          right: 12,
        ),
        child: Row(
          children: [
            Expanded(
              child: Slider(
                value: page.toDouble().clamp(0.0, maxVal),
                min: 0,
                max: maxVal,
                onChanged: count > 1 ? (v) => onSeek(v.round()) : null,
              ),
            ),
            const SizedBox(width: 8),
            Text('${page + 1} / $count', style: const TextStyle(color: Colors.white)),
          ],
        ),
      ),
    );
  }
}

/// Reading-mode picker shared by every reader. Shows the current [mode]'s icon
/// and, on tap, a checked menu of all modes that writes the choice back to
/// [readingModeProvider].
class ReadingModeMenu extends ConsumerWidget {
  /// Creates a reading-mode menu for [mode].
  const ReadingModeMenu({super.key, required this.mode, this.color});

  /// The currently-active reading mode (shown as the button icon and checked row).
  final ReadingMode mode;

  /// Icon tint. Defaults to the ambient icon color (the EPUB reader's AppBar);
  /// the comic/PDF overlays pass white.
  final Color? color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<ReadingMode>(
      tooltip: 'Reading mode',
      icon: Icon(mode.icon, color: color),
      onSelected: (m) => ref.read(readingModeProvider.notifier).set(m),
      itemBuilder: (context) => [
        for (final m in ReadingMode.values)
          CheckedPopupMenuItem(
            value: m,
            checked: m == mode,
            child: Row(
              children: [Icon(m.icon, size: 18), const SizedBox(width: 10), Text(m.label)],
            ),
          ),
      ],
    );
  }
}
