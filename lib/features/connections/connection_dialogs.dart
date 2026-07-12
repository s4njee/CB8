/// The dialogs behind the `ConnectionSwitcher` menu actions: add a server,
/// sign in to one, and manage (remove) saved servers.
///
/// Kept separate from the switcher widget so that file stays focused on the
/// switching UI; everything here is reached through the three `show…Dialog`
/// functions below. All mutations go through `connectionsProvider`, which owns
/// the saved-server list and the active session.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/connection.dart';
import '../../data/repositories/providers.dart';

/// Error-text red used by the sign-in / add-server forms.
const _errorColor = Color(0xFFE05252);

/// Opens the "Add server" dialog: name + URL, with optional credentials
/// (leaving them blank connects as a read-only guest).
Future<void> showAddServerDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (context) => const _AddServerDialog(),
  );
}

/// Opens the sign-in dialog for an already-saved server, upgrading a guest
/// session to a real one so progress writes are accepted.
Future<void> showSignInDialog(BuildContext context, Connection connection) {
  return showDialog<void>(
    context: context,
    builder: (context) => _SignInDialog(connection: connection),
  );
}

/// Opens the "Manage servers" dialog (list + remove).
Future<void> showManageServersDialog(BuildContext context) {
  return showDialog<void>(
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
      backgroundColor: CbColors.surface,
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
                        icon: const Icon(Icons.delete_outline, color: _errorColor),
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

/// Double-checks a server removal, then forgets it and refreshes the session
/// badge (the removed server may have been the active guest session).
Future<void> _confirmRemove(BuildContext context, WidgetRef ref, Connection conn) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: CbColors.surface,
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
      backgroundColor: CbColors.surface,
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
            if (_error != null) _ErrorLine(_error!),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy ? const _ButtonSpinner() : const Text('Sign in'),
        ),
      ],
    );
  }
}

/// Collects a name/URL (and optional credentials) for a new server, then saves
/// and connects in one step via `addAndConnect`.
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
      backgroundColor: CbColors.surface,
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
            if (_error != null) _ErrorLine(_error!),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _connect,
          child: _busy ? const _ButtonSpinner() : const Text('Connect'),
        ),
      ],
    );
  }
}

/// Red one-liner under the form fields for a failed connect/sign-in.
class _ErrorLine extends StatelessWidget {
  const _ErrorLine(this.error);
  final String error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(error, style: const TextStyle(color: _errorColor, fontSize: 12)),
    );
  }
}

/// Small in-button spinner shown while a connect/sign-in request is in flight.
class _ButtonSpinner extends StatelessWidget {
  const _ButtonSpinner();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2));
  }
}
