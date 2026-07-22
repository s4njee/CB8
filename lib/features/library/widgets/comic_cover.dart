import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/comic_summary.dart';
import '../../../data/repositories/providers.dart';

/// A comic's cover image, source-agnostic. Resolves, in order:
///  1. inline bytes already on the summary (remote pre-load / legacy),
///  2. a remote thumbnail URL (disk-cached),
///  3. for local items — whose list query skips the BLOB to stay light — the
///     cover loaded lazily by id via [localCoverProvider].
///
/// When no real cover exists, falls back to a **typographic cover** (a warm
/// low-chroma color block with the serif title + author) so cover-less books
/// read like the Folio design rather than showing a generic placeholder.
/// Fills its parent (`BoxFit.cover`); the caller owns clipping and sizing.
class ComicCover extends ConsumerWidget {
  /// Creates a cover for [comic].
  const ComicCover({super.key, required this.comic});

  /// The item whose cover to show.
  final ComicSummary comic;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inline = comic.coverThumbnail;
    if (inline != null) {
      return Image.memory(inline, fit: BoxFit.cover, gaplessPlayback: true);
    }
    final url = comic.coverUrl;
    if (url != null) {
      return CachedNetworkImage(
        imageUrl: url,
        httpHeaders: comic.imageHeaders,
        fit: BoxFit.cover,
        placeholder: (_, _) => const CoverPlaceholder(),
        errorWidget: (_, _, _) => TypographicCover(comic: comic),
      );
    }
    return ref.watch(localCoverProvider(comic.id)).maybeWhen(
          // A resolved-but-null cover means the book genuinely has none — draw
          // the typographic fallback. While still loading, keep the neutral
          // placeholder so covers don't flash a title block then swap to art.
          data: (bytes) => bytes == null
              ? TypographicCover(comic: comic)
              : Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true),
          orElse: () => const CoverPlaceholder(),
        );
  }
}

/// Neutral placeholder shown only while a cover is still loading.
class CoverPlaceholder extends StatelessWidget {
  /// Creates a cover placeholder.
  const CoverPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: CbColors.surfaceAlt,
      child: Center(
        child: Icon(Icons.menu_book_outlined, color: CbColors.mutedForeground, size: 28),
      ),
    );
  }
}

/// A generated, typographic book cover for items without cover art — a warm
/// low-chroma color block (hue derived deterministically from the title) with
/// the serif title top-left and an uppercase author/series line bottom, matching
/// the Folio grid covers.
class TypographicCover extends StatelessWidget {
  /// Creates a typographic cover for [comic].
  const TypographicCover({super.key, required this.comic});

  /// The item whose title/series drives the cover.
  final ComicSummary comic;

  // Small stable FNV-1a hash so a title always maps to the same hue.
  static int _hash(String s) {
    var h = 0x811c9dc5;
    for (final c in s.codeUnits) {
      h ^= c;
      h = (h * 0x01000193) & 0xffffffff;
    }
    return h;
  }

  @override
  Widget build(BuildContext context) {
    final hue = (_hash(comic.title) % 360).toDouble();
    // Desaturated, dark block; lighter same-hue tints for the text.
    final bg = HSLColor.fromAHSL(1, hue, 0.22, 0.16).toColor();
    final titleTint = HSLColor.fromAHSL(1, hue, 0.24, 0.82).toColor();
    final authorTint = HSLColor.fromAHSL(1, hue, 0.20, 0.58).toColor();
    final author = (comic.seriesName ?? '').trim();

    return LayoutBuilder(
      builder: (context, c) {
        // Scale type to the cover so small (hero/up-next) covers stay legible.
        final w = c.maxWidth;
        final titleSize = (w * 0.11).clamp(9.0, 18.0);
        final authorSize = (w * 0.055).clamp(6.0, 9.5);
        final pad = (w * 0.10).clamp(8.0, 16.0);
        return Container(
          color: bg,
          padding: EdgeInsets.all(pad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                comic.title,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: cbSerif(size: titleSize, color: titleTint, height: 1.25),
              ),
              if (author.isNotEmpty)
                Text(
                  author.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: kSansFamily,
                    fontSize: authorSize,
                    letterSpacing: authorSize * 0.1,
                    color: authorTint,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
