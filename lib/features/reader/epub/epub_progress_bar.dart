import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

import 'epub_reader_style.dart';

/// The EPUB reader's bottom progress bar: a scrubber slider plus a
/// "Ch 7/38 · 42%" label.
///
/// Readium exposes two different progress numbers, and this bar deliberately
/// uses both (bugs.md #6):
///  * the slider tracks per-resource `locations.progression` — position within
///    the *current chapter* — because [onSeek] feeds Readium's
///    `goToProgression`, which can only seek within the current resource. A
///    whole-book slider would jump somewhere it can't actually navigate to;
///  * the label leads with `locations.totalProgression` — position in the
///    *whole book* — because that's what a reader actually wants to know, with
///    the chapter count for context so the per-chapter scrubber still reads
///    sensibly.
class EpubProgressBar extends StatelessWidget {
  /// Creates the bar for the current [locator] within [readingOrder].
  const EpubProgressBar({
    super.key,
    required this.locator,
    required this.readingOrder,
    required this.onSeek,
  });

  /// The reader's latest position, or null before the first locator event
  /// (the slider then rests at 0).
  final Locator? locator;

  /// The publication's reading order, used to turn the locator's href into a
  /// "chapter x of y".
  final List<Link> readingOrder;

  /// Called with a 0..1 progression *within the current chapter* when the
  /// slider moves; the reader forwards it to `goToProgression`.
  final ValueChanged<double> onSeek;

  /// Index of the locator's resource in the reading order (0-based), or null
  /// when it can't be resolved. Locator hrefs may carry a fragment; compare on
  /// the path part only.
  int? _chapterIndex() {
    final href = locator?.href.split('#').first;
    if (href == null) return null;
    final i = readingOrder.indexWhere((l) => l.href.split('#').first == href);
    return i < 0 ? null : i;
  }

  @override
  Widget build(BuildContext context) {
    final rawProgression = locator?.locations?.progression ?? 0.0;
    final progression = rawProgression.clamp(0.0, 1.0).toDouble();

    final total = locator?.locations?.totalProgression;
    final chapterCount = readingOrder.length;
    final chapter = _chapterIndex();
    final bookPercent = total == null
        ? null
        : (total.clamp(0.0, 1.0) * 100).round();

    // "Ch 7/38 · 42%" for multi-chapter books with a known whole-book
    // position; degrade gracefully to whichever part is available.
    final label = [
      if (chapter != null && chapterCount > 1)
        'Ch ${chapter + 1}/$chapterCount',
      if (bookPercent != null)
        '$bookPercent%'
      else if (chapter == null || chapterCount <= 1)
        '${(progression * 100).round()}%',
    ].join(' · ');

    return Container(
      color: readerChromeColor,
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: 8 + MediaQuery.of(context).padding.bottom,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // On very narrow windows the row scrolls horizontally rather than
          // squeezing the slider below a usable width.
          const labelWidth = 104.0;
          const gap = 16.0;
          final sliderWidth = math.max(
            240.0,
            constraints.maxWidth - labelWidth - gap,
          );
          final totalWidth = sliderWidth + gap + labelWidth;

          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: math.max(constraints.maxWidth, totalWidth),
              child: Row(
                children: [
                  SizedBox(
                    width: sliderWidth,
                    child: SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        trackHeight: 4,
                        thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 6,
                        ),
                        overlayShape: const RoundSliderOverlayShape(
                          overlayRadius: 14,
                        ),
                        activeTrackColor: Theme.of(context).colorScheme.primary,
                        inactiveTrackColor: Colors.white24,
                        thumbColor: Theme.of(context).colorScheme.primary,
                      ),
                      child: Slider(value: progression, onChanged: onSeek),
                    ),
                  ),
                  const SizedBox(width: gap),
                  SizedBox(
                    width: labelWidth,
                    child: Text(
                      label,
                      textAlign: TextAlign.right,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
