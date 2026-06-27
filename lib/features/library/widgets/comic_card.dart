import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/comic_summary.dart';

/// A single library tile — port of CB8's `ComicCard.tsx`.
///
/// 2:3 cover with a format badge (top-right), favorite heart (bottom-right),
/// a progress bar along the bottom edge, then title + page count below.
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
            borderRadius: BorderRadius.circular(kCbRadius),
            child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cover flexes to fill the space left after the text, so the card
          // never overflows its grid cell regardless of font scaling.
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(kCbRadius),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Cover(comic: comic),
                  if (comic.extension != null)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: _FormatBadge(ext: comic.extension!),
                    ),
                  if (comic.isFavorite)
                    const Positioned(
                      bottom: 6,
                      right: 6,
                      child: Icon(Icons.favorite, size: 18, color: Color(0xFFEF4444)),
                    ),
                  if (comic.progress > 0)
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
          const SizedBox(height: 6),
          Text(
            comic.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(height: 1.2),
          ),
          const SizedBox(height: 2),
          Text(
            comic.mediaType == 'book'
                ? '${comic.pageCount} ch'
                : '${comic.pageCount} pg',
            style: theme.textTheme.labelSmall?.copyWith(color: CbColors.mutedForeground),
          ),
        ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({required this.comic});
  final ComicSummary comic;

  @override
  Widget build(BuildContext context) {
    if (comic.coverThumbnail != null) {
      return Image.memory(comic.coverThumbnail!, fit: BoxFit.cover, gaplessPlayback: true);
    }
    if (comic.coverUrl != null) {
      return CachedNetworkImage(
        imageUrl: comic.coverUrl!,
        httpHeaders: comic.imageHeaders,
        fit: BoxFit.cover,
        placeholder: (_, _) => const _CoverPlaceholder(),
        errorWidget: (_, _, _) => const _CoverPlaceholder(),
      );
    }
    return const _CoverPlaceholder();
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();
  @override
  Widget build(BuildContext context) {
    return Container(
      color: CbColors.surfaceAlt,
      alignment: Alignment.center,
      child: const Icon(Icons.menu_book_outlined, color: CbColors.mutedForeground, size: 32),
    );
  }
}

class _FormatBadge extends StatelessWidget {
  const _FormatBadge({required this.ext});
  final String ext;

  @override
  Widget build(BuildContext context) {
    final color = switch (ext) {
      'epub' => const Color(0xFF34C759),
      'pdf' => const Color(0xFFE05252),
      _ => const Color(0xFF4A9EFF), // cbz/cbr and friends
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        ext.toUpperCase(),
        style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white),
      ),
    );
  }
}
