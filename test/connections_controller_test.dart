import 'package:cb8_flutter/data/db/database.dart';
import 'package:cb8_flutter/data/repositories/providers.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cb8_server.dart';

/// Covers the guest-login trap fixed in addAndConnect: a credentialed connect
/// must require a real login (not silently accept guest access), and re-adding an
/// existing URL must reuse the row instead of crashing on the UNIQUE constraint.
void main() {
  late FakeCb8Server server;
  late ProviderContainer container;

  // Each test spins up a fresh in-memory AppDatabase; that's intentional, not the
  // accidental-double-open this warning guards against.
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  setUp(() async {
    server = FakeCb8Server();
    await server.start();
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(AppDatabase.forTesting(NativeDatabase.memory())),
      sharedPreferencesProvider.overrideWithValue(prefs),
      cookieJarProvider.overrideWithValue(CookieJar()),
    ]);
    // Let the controller's initial (empty) load settle before each test.
    container.read(connectionsProvider);
    await pumpEventQueue();
  });
  tearDown(() async {
    container.dispose();
    await server.stop();
  });

  ConnectionsController ctrl() => container.read(connectionsProvider.notifier);
  List<dynamic> connections() => container.read(connectionsProvider).connections;

  test('no credentials → connects as a guest', () async {
    final err = await ctrl().addAndConnect('S', server.baseUrl);
    expect(err, isNull);
    expect(connections(), hasLength(1));
    final active = container.read(connectionsProvider).active!;
    expect(await container.read(remoteSourceProvider(active)).isLoggedIn(), isFalse);
  });

  test('valid credentials → authenticates', () async {
    final err = await ctrl().addAndConnect('S', server.baseUrl, username: 'root', password: 'root');
    expect(err, isNull);
    final active = container.read(connectionsProvider).active!;
    expect(await container.read(remoteSourceProvider(active)).isLoggedIn(), isTrue);
  });

  test('wrong credentials → rejected and rolled back (not a silent guest)', () async {
    final err = await ctrl().addAndConnect('S', server.baseUrl, username: 'root', password: 'WRONG');
    expect(err, isNotNull);
    expect(connections(), isEmpty); // the failed add was removed
  });

  test('credentials that only yield guest access are rejected', () async {
    // Server accepts no real login here, but guest access is on. Supplying
    // credentials must NOT be accepted as a guest session.
    final guestOnly = FakeCb8Server(validUser: 'someoneelse');
    await guestOnly.start();
    addTearDown(guestOnly.stop);
    final err = await ctrl().addAndConnect('S', guestOnly.baseUrl, username: 'root', password: 'root');
    expect(err, isNotNull);
  });

  test('re-adding the same URL reuses the row (no duplicate, no crash)', () async {
    await ctrl().addAndConnect('S', server.baseUrl); // guest first
    final err =
        await ctrl().addAndConnect('S', server.baseUrl, username: 'root', password: 'root'); // sign in
    expect(err, isNull);
    expect(connections(), hasLength(1)); // reused, not a UNIQUE-constraint crash
    final active = container.read(connectionsProvider).active!;
    expect(await container.read(remoteSourceProvider(active)).isLoggedIn(), isTrue);
  });
}
