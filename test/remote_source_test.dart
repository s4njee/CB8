import 'package:cb8_flutter/data/sources/remote_source.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_cb8_server.dart';

void main() {
  late FakeCb8Server server;
  late RemoteSource source;

  setUp(() async {
    server = FakeCb8Server();
    await server.start();
    source = RemoteSource(id: '1', name: 'Test', baseUrl: server.baseUrl, cookieJar: CookieJar());
  });
  tearDown(() async => server.stop());

  group('session state', () {
    test('guest when not logged in and guest access is on', () async {
      expect(await source.sessionState(), RemoteSessionState.guest);
      expect(await source.isAuthenticated(), isTrue); // usable for browsing
      expect(await source.isLoggedIn(), isFalse); // but not a real login
    });

    test('unauthenticated when guest access is off', () async {
      server.guestAccess = false;
      expect(await source.sessionState(), RemoteSessionState.unauthenticated);
      expect(await source.isAuthenticated(), isFalse);
    });

    test('login captures the session cookie and becomes authenticated', () async {
      await source.login('root', 'root');
      expect(await source.sessionState(), RemoteSessionState.authenticated);
      expect(await source.isLoggedIn(), isTrue);
    });

    test('offline when the server is unreachable', () async {
      await server.stop();
      expect(await source.sessionState(), RemoteSessionState.offline);
    });
  });

  group('progress', () {
    test('guest write is rejected (401) but never throws', () async {
      // Regression: a guest 401 used to surface as an unhandled exception that
      // crashed the reader. setProgress must swallow it.
      await source.setProgress('1', page: 3, location: 'epubcfi(/6/4!/x)');
      expect(server.acceptedProgress, isEmpty);
    });

    test('authenticated write persists and round-trips via getComic', () async {
      await source.login('root', 'root');
      await source.setProgress('1', page: 3, location: 'epubcfi(/6/4!/x)');
      expect(server.acceptedProgress.single, containsPair('page', 3));
      final c = await source.getComic('1');
      expect(c!.lastPage, 3);
      expect(c.lastLocation, 'epubcfi(/6/4!/x)');
    });

    test('getComic derives completed from lastPage vs pageCount', () async {
      await source.login('root', 'root');
      await source.setProgress('1', page: 9); // pageCount 10 → final page
      expect((await source.getComic('1'))!.completed, isTrue);
    });
  });
}
