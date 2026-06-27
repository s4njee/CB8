import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/connection.dart';
import '../../data/repositories/providers.dart';
import '../../data/sources/remote_source.dart';

/// Amber accent for the guest-mode indicator (browsing without a real sign-in,
/// so the server rejects progress writes).
const _guestColor = Color(0xFFE0A338);

/// App-bar control that shows the active connection and lets the user switch
/// between the on-device library and saved CB8 servers (or add one). When the
/// active server session is a guest (read-only — progress won't save), it shows
/// a "Guest" badge and offers a sign-in action.
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

    return PopupMenuButton<String>(
      tooltip: 'Switch library',
      onSelected: (value) async {
        switch (value) {
          case '__add__':
            await _showAddServer(context, ref);
          case '__manage__':
            await _showManageServers(context, ref);
          case '__signin__':
            final active = state.active;
            if (active != null) await _showSignIn(context, ref, active);
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
          PopupMenuItem(
            value: '__signin__',
            child: Row(
              children: [
                const Icon(Icons.login, size: 18, color: _guestColor),
                const SizedBox(width: 10),
                Flexible(child: Text('Sign in to ${state.active?.name ?? 'server'}')),
              ],
            ),
          ),
        ],
        const PopupMenuDivider(),
        if (state.connections.isNotEmpty)
          const PopupMenuItem(
            value: '__manage__',
            child: Row(
              children: [
                Icon(Icons.dns_outlined, size: 18),
                SizedBox(width: 10),
                Text('Manage servers…'),
              ],
            ),
          ),
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

Future<void> _showAddServer(BuildContext context, WidgetRef ref) async {
  await showDialog<void>(
    context: context,
    builder: (context) => const _AddServerDialog(),
  );
}

Future<void> _showSignIn(BuildContext context, WidgetRef ref, Connection conn) async {
  await showDialog<void>(
    context: context,
    builder: (context) => _SignInDialog(connection: conn),
  );
}

Future<void> _showManageServers(BuildContext context, WidgetRef ref) async {
  await showDialog<void>(
    context: context,
    builder: (context) => const _ManageServersDialog(),
  );
}

/// Lists saved servers and lets the user remove them. Removing a server only
/// forgets it on this device (and signs out of it) — the server's library is
/// untouched. Removing the active server falls back to the on-device library.
class _ManageServersDialog extends ConsumerWidget {
  const _ManageServersDialog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(connectionsProvider);
    final servers = state.connections;
    return AlertDialog(
      backgroundColor: const Color(0xFF141414),
      title: const Text('Manage servers'),
      content: SizedBox(
        width: 360,
        child: servers.isEmpty
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('No saved servers.', style: TextStyle(color: Colors.white70)),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final c in servers)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        c.id == state.activeId ? Icons.cloud_done_outlined : Icons.cloud_outlined,
                        size: 20,
                      ),
                      title: Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        c.baseUrl,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: Colors.white54),
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline, color: Color(0xFFE05252)),
                        tooltip: 'Remove ${c.name}',
                        onPressed: () => _confirmRemove(context, ref, c),
                      ),
                    ),
                ],
              ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
      ],
    );
  }
}

Future<void> _confirmRemove(BuildContext context, WidgetRef ref, Connection conn) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: const Color(0xFF141414),
      title: Text('Remove ${conn.name}?'),
      content: const Text(
        'Forgets this server on this device and signs you out of it. The library '
        'on the server is not affected.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
      ],
    ),
  );
  if (ok != true) return;
  await ref.read(connectionsProvider.notifier).removeConnection(conn.id);
  ref.invalidate(sessionStatusProvider);
}

/// Sign in to an already-saved server (upgrades a guest session to a real one).
class _SignInDialog extends ConsumerStatefulWidget {
  const _SignInDialog({required this.connection});

  final Connection connection;

  @override
  ConsumerState<_SignInDialog> createState() => _SignInDialogState();
}

class _SignInDialogState extends ConsumerState<_SignInDialog> {
  late final _username = TextEditingController(text: widget.connection.lastUsername ?? '');
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref
        .read(connectionsProvider.notifier)
        .login(widget.connection.id, _username.text, _password.text);
    if (!mounted) return;
    if (error == null) {
      // Refresh the guest badge and re-pull the catalog now that we're a real user.
      ref.invalidate(sessionStatusProvider);
      invalidateLibraryProviders(ref);
      Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF141414),
      title: Text('Sign in to ${widget.connection.name}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "You're browsing as a guest — sign in to save your reading progress.",
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _username,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Username'),
            ),
            TextField(
              controller: _password,
              obscureText: true,
              onSubmitted: (_) => _busy ? null : _submit(),
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Color(0xFFE05252), fontSize: 12)),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Sign in'),
        ),
      ],
    );
  }
}

class _AddServerDialog extends ConsumerStatefulWidget {
  const _AddServerDialog();

  @override
  ConsumerState<_AddServerDialog> createState() => _AddServerDialogState();
}

class _AddServerDialogState extends ConsumerState<_AddServerDialog> {
  final _name = TextEditingController(text: 'My server');
  final _url = TextEditingController(text: 'http://');
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _url.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(connectionsProvider.notifier).addAndConnect(
          _name.text,
          _url.text,
          username: _username.text,
          password: _password.text,
        );
    if (!mounted) return;
    if (error == null) {
      ref.invalidate(sessionStatusProvider);
      Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF141414),
      title: const Text('Add server'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
            TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'URL', hintText: 'http://host:port'),
            ),
            TextField(
              controller: _username,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Username',
                helperText: 'Needed to save progress (leave blank to browse as guest)',
                helperMaxLines: 2,
              ),
            ),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Color(0xFFE05252), fontSize: 12)),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _connect,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Connect'),
        ),
      ],
    );
  }
}
