import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

import '../../../core/theme/app_theme.dart';

/// The reading view's **Contents sidebar** (the Folio design's left drawer).
///
/// Purely presentational: it renders the publication's ToC tree and reports the
/// tapped [Link]. The reader screen owns navigation (`goByLink`), the open/close
/// state, and closing on narrow widths. Fixed 280-wide; the caller sizes/slides
/// it. Flattens the ToC tree so nested chapters render indented, not dropped.
class ContentsDrawer extends StatelessWidget {
  /// Creates a contents sidebar over [entries].
  const ContentsDrawer({
    super.key,
    required this.title,
    required this.entries,
    required this.activeHref,
    required this.onTap,
    required this.onClose,
  });

  /// Book title shown under the CONTENTS label.
  final String title;

  /// The publication's table of contents (a tree — entries have children).
  final List<Link> entries;

  /// href of the reader's current position, used to highlight the active row.
  /// Compared on the path portion (fragment/query stripped) so a mid-chapter
  /// position still lights up its chapter.
  final String? activeHref;

  /// Called with the tapped entry; the caller navigates (and closes on narrow).
  final ValueChanged<Link> onTap;

  /// Called when the ✕ close button is tapped.
  final VoidCallback onClose;

  /// Flattens the toc tree into (link, depth) pairs so nested chapters render
  /// indented instead of being dropped.
  List<(Link, int)> _flatten(List<Link> links, int depth) {
    final out = <(Link, int)>[];
    for (final link in links) {
      out.add((link, depth));
      out.addAll(_flatten(link.children, depth + 1));
    }
    return out;
  }

  /// The path part of an href, without fragment or query — what we match on.
  String _base(String? href) => (href ?? '').split('#').first.split('?').first;

  @override
  Widget build(BuildContext context) {
    final rows = _flatten(entries, 0);
    final activeBase = _base(activeHref);

    return DecoratedBox(
      decoration: const BoxDecoration(
        color: CbColors.drawerBg,
        border: Border(right: BorderSide(color: CbColors.headerRule)),
      ),
      child: SafeArea(
        right: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'CONTENTS',
                    style: cbSectionLabel(size: 11, color: CbColors.placeholder),
                  ),
                  InkWell(
                    onTap: onClose,
                    customBorder: const CircleBorder(),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(Icons.close, size: 15, color: CbColors.placeholder),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: cbSerif(size: 16, weight: FontWeight.w500),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: rows.isEmpty
                    ? const Text(
                        'This book has no table of contents.',
                        style: TextStyle(color: CbColors.mutedForeground, fontSize: 13),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.zero,
                        itemCount: rows.length,
                        itemBuilder: (context, index) {
                          final (link, depth) = rows[index];
                          final active =
                              activeBase.isNotEmpty && _base(link.href) == activeBase;
                          return _ChapterRow(
                            label: link.title ?? 'Chapter ${index + 1}',
                            depth: depth,
                            active: active,
                            // No rule under the last row (matches the reference).
                            showRule: index != rows.length - 1,
                            onTap: () => onTap(link),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One chapter row: muted 13px text, indented by depth, with a hairline rule.
/// The active chapter reads in the accent color on a tinted, rounded pill.
class _ChapterRow extends StatelessWidget {
  const _ChapterRow({
    required this.label,
    required this.depth,
    required this.active,
    required this.showRule,
    required this.onTap,
  });

  final String label;
  final int depth;
  final bool active;
  final bool showRule;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final text = Text(
      label,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontFamily: kSansFamily,
        fontSize: 13,
        height: 1.3,
        color: active ? primary : CbColors.mutedForeground,
      ),
    );

    if (active) {
      return Padding(
        padding: EdgeInsets.only(left: depth * 12.0),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(
            color: CbColors.accentTint,
            borderRadius: BorderRadius.circular(7),
          ),
          child: InkWell(onTap: onTap, child: text),
        ),
      );
    }

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.fromLTRB(depth * 12.0, 9, 0, 9),
        decoration: BoxDecoration(
          border: showRule
              ? const Border(bottom: BorderSide(color: Color(0xFF191512)))
              : null,
        ),
        child: text,
      ),
    );
  }
}
