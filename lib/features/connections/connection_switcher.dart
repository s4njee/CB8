/// App-bar control for switching between the on-device library and saved CB8
/// servers. The add / sign-in / manage dialogs it opens live in
/// `connection_dialogs.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/connection.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';
import 'connection_dialogs.dart';

/// Amber accent for the guest-mode indicator (browsing without a real sign-in,
/// so the server rejects progress writes).
const _guestColor = Color(0xFFE0A338);

/// App-bar control that shows the active connection and lets the user switch
/// between the on-device library and saved CB8 servers (or add one). When the
/// active server session is a guest (read-only — progress won't save), it shows
/// a "Guest" badge and offers a sign-in action.
///
/// The hybrid local/remote model is the app's defining feature, so on wide
/// layouts every source is an always-visible segment (no "which library am I
/// in?" ambiguity); phones and many-server setups fall back to the compact
/// popup trigger.
class ConnectionSwitcher extends ConsumerWidget {
  /// Creates the connection switcher control.
  const ConnectionSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(connectionsProvider);
    final isLocal = state.activeId == Connection.localId;
    final activeName = isLocal ? 'This device' : (state.active?.name ?? 'Server');
    final isGuest =
        !isLocal && ref.watch(sessionStatusProvider).asData?.value == RemoteSessionState.guest;

    final wide = MediaQuery.sizeOf(context).width >= 900;
    if (wide && state.connections.length <= 2) {
      return _SegmentedSwitcher(isLocal: isLocal, isGuest: isGuest);
    }

    return PopupMenuButton<String>(
      tooltip: 'Switch library',
      onSelected: (value) async {
        switch (value) {
          case '__add__':
            await showAddServerDialog(context);
          case '__manage__':
            await showManageServersDialog(context);
          case '__signin__':
            final active = state.active;
            if (active != null) await showSignInDialog(context, active);
          default:
            await ref.read(connectionsProvider.notifier).setActive(value);
        }
      },
      itemBuilder: (context) => [
        CheckedPopupMenuItem(
          value: Connection.localId,
          checked: isLocal,
          child: const Text('This device'),
        ),
        for (final c in state.connections)
          CheckedPopupMenuItem(
            value: c.id,
            checked: state.activeId == c.id,
            child: Text(c.name),
          ),
        if (isGuest) ...[
          const PopupMenuDivider(),
          _signInMenuItem(state.active?.name),
        ],
        const PopupMenuDivider(),
        if (state.connections.isNotEmpty) _manageMenuItem,
        const PopupMenuItem(value: '__add__', child: Text('Add server…')),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isLocal ? Icons.smartphone : (isGuest ? Icons.cloud_off : Icons.cloud_outlined),
              size: 18,
              color: isGuest ? _guestColor : null,
            ),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: Text(
                isGuest ? '$activeName · Guest' : activeName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: isGuest ? const TextStyle(color: _guestColor) : null,
              ),
            ),
            const Icon(Icons.arrow_drop_down, size: 18),
          ],
        ),
      ),
    );
  }
}

/// "Sign in to `<server>`" menu row, highlighted in the guest amber.
PopupMenuItem<String> _signInMenuItem(String? serverName) {
  return PopupMenuItem(
    value: '__signin__',
    child: Row(
      children: [
        const Icon(Icons.login, size: 18, color: _guestColor),
        const SizedBox(width: 10),
        Flexible(child: Text('Sign in to ${serverName ?? 'server'}')),
      ],
    ),
  );
}

/// "Manage servers…" menu row.
const _manageMenuItem = PopupMenuItem<String>(
  value: '__manage__',
  child: Row(
    children: [
      Icon(Icons.dns_outlined, size: 18),
      SizedBox(width: 10),
      Text('Manage servers…'),
    ],
  ),
);

/// Always-visible source segments for wide layouts: "This device" plus each
/// saved server, with a trailing overflow menu for sign-in / manage / add.
class _SegmentedSwitcher extends ConsumerWidget {
  const _SegmentedSwitcher({required this.isLocal, required this.isGuest});

  final bool isLocal;
  final bool isGuest;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(connectionsProvider);
    final notifier = ref.read(connectionsProvider.notifier);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Segment(
            icon: Icons.smartphone,
            label: 'This device',
            selected: isLocal,
            onTap: () => notifier.setActive(Connection.localId),
          ),
          for (final c in state.connections)
            _Segment(
              icon: isGuest && state.activeId == c.id ? Icons.cloud_off : Icons.cloud_outlined,
              label: isGuest && state.activeId == c.id ? '${c.name} · Guest' : c.name,
              selected: state.activeId == c.id,
              tint: isGuest && state.activeId == c.id ? _guestColor : null,
              onTap: () => notifier.setActive(c.id),
            ),
          PopupMenuButton<String>(
            tooltip: 'Server options',
            padding: EdgeInsets.zero,
            icon: const Icon(Icons.more_horiz, size: 16),
            onSelected: (value) async {
              switch (value) {
                case '__add__':
                  await showAddServerDialog(context);
                case '__manage__':
                  await showManageServersDialog(context);
                case '__signin__':
                  final active = state.active;
                  if (active != null) await showSignInDialog(context, active);
              }
            },
            itemBuilder: (context) => [
              if (isGuest) _signInMenuItem(state.active?.name),
              if (state.connections.isNotEmpty) _manageMenuItem,
              const PopupMenuItem(value: '__add__', child: Text('Add server…')),
            ],
          ),
        ],
      ),
    );
  }
}

/// One pill segment of the wide-layout switcher.
class _Segment extends StatelessWidget {
  const _Segment({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.tint,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// Overrides the text/icon color (the amber guest indicator).
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fg = tint ?? (selected ? scheme.onSurface : scheme.onSurface.withValues(alpha: 0.6));
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: selected
            ? BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(999),
              )
            : null,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: fg),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: fg),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
