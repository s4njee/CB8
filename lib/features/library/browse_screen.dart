import 'package:flutter/material.dart';

import '../organize/tags_screen.dart';
import 'library_screen.dart';
import 'recent_screen.dart';
import 'widgets/pill_chip.dart';

/// The ways the Browse tab can slice the catalog. Collections and Series are
/// their own top-level destinations, so they're not repeated here.
enum _Pivot {
  all('All'),
  tags('Tags'),
  recent('Recent');

  const _Pivot(this.label);
  final String label;
}

/// Browse tab — the whole catalog under one roof. A pivot-chip row switches
/// between the full grid and the tags / recent slices.
class BrowseScreen extends StatefulWidget {
  /// Creates the Browse tab.
  const BrowseScreen({super.key});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  _Pivot _pivot = _Pivot.all;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              for (final p in _Pivot.values)
                PillChip(
                  label: p.label,
                  selected: p == _pivot,
                  onTap: () => setState(() => _pivot = p),
                ),
            ],
          ),
        ),
        Expanded(
          child: switch (_pivot) {
            _Pivot.all => const LibraryScreen(),
            _Pivot.tags => const TagsScreen(),
            _Pivot.recent => const RecentScreen(),
          },
        ),
      ],
    );
  }
}
