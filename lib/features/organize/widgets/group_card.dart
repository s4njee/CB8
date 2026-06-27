import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// A cover-topped card for a collection or series group: cover (or fallback
/// icon), title, and a count subtitle. Mirrors CB8's FolderCard/GroupCard.
class GroupCard extends StatelessWidget {
  /// Creates a group card.
  const GroupCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.cover,
    this.fallbackIcon = Icons.folder_outlined,
  });

  /// Group name.
  final String title;

  /// Secondary line, typically an item count.
  final String subtitle;

  /// Called when the card is tapped.
  final VoidCallback onTap;

  /// Representative cover bytes; falls back to [fallbackIcon] when null.
  final Uint8List? cover;

  /// Icon shown when there is no [cover].
  final IconData fallbackIcon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(kCbRadius),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(kCbRadius),
              child: cover != null
                  ? Image.memory(cover!, fit: BoxFit.cover, gaplessPlayback: true)
                  : Container(
                      color: CbColors.surfaceAlt,
                      alignment: Alignment.center,
                      child: Icon(fallbackIcon, color: CbColors.mutedForeground, size: 32),
                    ),
            ),
          ),
          const SizedBox(height: 6),
          Text(title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(height: 1.2)),
          const SizedBox(height: 2),
          Text(subtitle,
              style: theme.textTheme.labelSmall?.copyWith(color: CbColors.mutedForeground)),
        ],
      ),
    );
  }
}
