import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/connection.dart';
import '../../data/repositories/providers.dart';

/// App-bar control that shows the active connection and lets the user switch
/// between the on-device library and saved CB8 servers (or add one).
class ConnectionSwitcher extends ConsumerWidget {
  /// Creates the connection switcher control.
  const ConnectionSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(connectionsProvider);
    final isLocal = state.activeId == Connection.localId;
    final activeName = isLocal ? 'This device' : (state.active?.name ?? 'Server');

    return PopupMenuButton<String>(
      tooltip: 'Switch library',
      onSelected: (value) async {
        if (value == '__add__') {
          await _showAddServer(context, ref);
        } else {
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
        const PopupMenuDivider(),
        const PopupMenuItem(value: '__add__', child: Text('Add server…')),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(isLocal ? Icons.smartphone : Icons.cloud_outlined, size: 18),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: Text(activeName, maxLines: 1, overflow: TextOverflow.ellipsis),
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
              decoration: const InputDecoration(labelText: 'Username (optional)'),
            ),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password (optional)'),
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
