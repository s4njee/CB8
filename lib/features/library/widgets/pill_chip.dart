import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Rounded filter/pivot pill used in horizontal chip rows (Browse's pivots,
/// the library's media-type filters). Fills with the accent color when
/// selected; includes its own trailing 8px gap so rows can just list chips.
class PillChip extends StatelessWidget {
  /// Creates a pill chip.
  const PillChip({super.key, required this.label, required this.selected, required this.onTap});

  /// Chip text.
  final String label;

  /// Whether this chip is the active choice.
  final bool selected;

  /// Called when the chip is tapped.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? primary : CbColors.surfaceAlt,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? primary : CbColors.border),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              color: selected ? Colors.white : CbColors.foreground,
            ),
          ),
        ),
      ),
    );
  }
}
