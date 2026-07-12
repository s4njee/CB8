import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

/// Table-of-contents bottom sheet for the EPUB reader.
///
/// Purely presentational: it renders the publication's ToC tree and reports
/// the tapped [Link]. The reader screen owns the navigation (`goByLink`) and
/// pops the sheet, so this widget needs no Readium session of its own.
class TocSheet extends StatelessWidget {
  /// Creates a ToC sheet over [entries], reporting taps through [onTap].
  const TocSheet({super.key, required this.entries, required this.onTap});

  /// The publication's table of contents (a tree — entries have children).
  final List<Link> entries;

  /// Called with the tapped entry; the caller navigates and closes the sheet.
  final ValueChanged<Link> onTap;

  /// Flattens the toc tree into (link, depth) pairs so nested chapters (e.g.
  /// under "Part One") render indented instead of being dropped — a flat
  /// top-level-only list silently loses every sub-chapter.
  List<(Link, int)> _flatten(List<Link> links, int depth) {
    final out = <(Link, int)>[];
    for (final link in links) {
      out.add((link, depth));
      out.addAll(_flatten(link.children, depth + 1));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _flatten(entries, 0);
    return Container(
      height: MediaQuery.of(context).size.height * 0.65,
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Text(
              'Table of Contents',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          Expanded(
            child: rows.isEmpty
                ? const Center(
                    child: Text(
                      'This book has no table of contents.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  )
                : ListView.separated(
                    itemCount: rows.length,
                    separatorBuilder: (context, index) =>
                        const Divider(color: Colors.white10, height: 1),
                    itemBuilder: (context, index) {
                      final (link, depth) = rows[index];
                      return ListTile(
                        contentPadding: EdgeInsets.only(
                          left: 20 + depth * 16.0,
                          right: 20,
                        ),
                        title: Text(
                          link.title ?? 'Chapter ${index + 1}',
                          style: const TextStyle(color: Colors.white),
                        ),
                        onTap: () => onTap(link),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
