import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/comic_summary.dart';
import 'comic_cover.dart';

/// A single library tile.
///
/// 2:3 cover with reading state layered on top — a progress bar while in
/// progress, a dimmed cover with a check once finished, a favorite heart —
/// then a title and a humanized one-line caption below. Format is demoted to
/// muted caption text (only shown before a book is started); reading state is
/// the loud signal, not the file type.
///
/// On desktop the card lifts slightly on hover and opens the action menu on
/// right-click (same as long-press on touch).
class ComicCard extends StatefulWidget {
  /// Creates a library tile for [comic].
  const ComicCard({super.key, required this.comic, this.onTap, this.onLongPress});

  /// The item this card represents.
  final ComicSummary comic;

  /// Called when the card is tapped (opens the reader).
  final VoidCallback? onTap;

  /// Called on long-press / right-click (opens the action sheet).
  final VoidCallback? onLongPress;

  @override
  State<ComicCard> createState() => _ComicCardState();
}

/// One-line reading-state caption: "Finished", "Page 5 of 12", "38% read",
/// or, for unstarted items, "EPUB · 42 chapters". Used on the hero/resume cards
/// where the extra detail is welcome; grid cells use [comicStatusLine] instead.
String comicCaption(ComicSummary comic) {
  if (comic.completed) return 'Finished';
  final isBook = comic.mediaType == 'book';
  if (comic.progress > 0) {
    if (!isBook && comic.lastPage != null && comic.pageCount > 0) {
      return 'Page ${comic.lastPage! + 1} of ${comic.pageCount}';
    }
    return '${(comic.progress * 100).round()}% read';
  }
  final unit = isBook
      ? (comic.pageCount == 1 ? 'chapter' : 'chapters')
      : (comic.pageCount == 1 ? 'page' : 'pages');
  return [
    if (comic.extension != null) comic.extension!.toUpperCase(),
    if (comic.pageCount > 0) '${comic.pageCount} $unit',
  ].join(' · ');
}

/// Folio-style compact status line for a grid cell. In-progress items report
/// their percentage in the accent color; finished ("Read") and unstarted
/// ("New") items use muted text. Returns the label and whether it's an accent.
({String label, bool accent}) comicStatusLine(ComicSummary comic) {
  if (comic.completed) return (label: 'Read', accent: false);
  if (comic.progress > 0) {
    return (label: '${(comic.progress * 100).round()}%', accent: true);
  }
  return (label: 'New', accent: false);
}

class _ComicCardState extends State<ComicCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final comic = widget.comic;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        // Right-click opens the same menu as long-press.
        onSecondaryTapUp: widget.onLongPress == null ? null : (_) => widget.onLongPress!(),
        child: AnimatedScale(
          scale: _hover ? 1.03 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: InkWell(
            onTap: widget.onTap,
            onLongPress: widget.onLongPress,
            borderRadius: BorderRadius.circular(kCoverRadius),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Cover flexes to fill the space left after the text, so the card
                // never overflows its grid cell regardless of font scaling.
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(kCoverRadius),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        // Finished books recede so the unread ones pop.
                        Opacity(
                          opacity: comic.completed ? 0.55 : 1.0,
                          child: ComicCover(comic: comic),
                        ),
                        if (comic.completed)
                          const Positioned(
                            top: 6,
                            right: 6,
                            child: _FinishedCheck(),
                          ),
                        if (comic.isFavorite)
                          const Positioned(
                            bottom: 6,
                            right: 6,
                            child: Icon(Icons.favorite, size: 18, color: Color(0xFFEF4444)),
                          ),
                        if (!comic.completed && comic.progress > 0)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: LinearProgressIndicator(
                              value: comic.progress,
                              minHeight: 3,
                              backgroundColor: Colors.black.withValues(alpha: 0.4),
                              valueColor: AlwaysStoppedAnimation(theme.colorScheme.primary),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 9),
                Text(
                  comic.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.25,
                    color: CbColors.foreground,
                  ),
                ),
                const SizedBox(height: 3),
                Builder(builder: (context) {
                  final status = comicStatusLine(comic);
                  return Text(
                    status.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: status.accent ? theme.colorScheme.primary : CbColors.sectionLabel,
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Small check chip marking a finished book (top-right of the cover).
class _FinishedCheck extends StatelessWidget {
  const _FinishedCheck();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: CbColors.surface,
        shape: BoxShape.circle,
        border: Border.all(color: CbColors.border),
      ),
      child: const Icon(Icons.check, size: 12, color: CbColors.mutedForeground),
    );
  }
}
