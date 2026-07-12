import 'dart:async';
import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/theme/theme_controller.dart';
import 'data/repositories/providers.dart';

/// App entry point: initializes the platform singletons the providers need
/// (preferences, PDF engine, session cookies) before the first frame, then
/// mounts the Riverpod [ProviderScope] with those instances overridden in.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  pdfrxFlutterInitialize();
  // Both are platform-channel round trips with no dependency on each other;
  // running them concurrently shaves their combined latency off first frame.
  final (prefs, supportDir) = await (
    SharedPreferences.getInstance(),
    getApplicationSupportDirectory(),
  ).wait;

  // Persistent cookie jar so server sessions survive restarts.
  final cookieDir = Directory(p.join(supportDir.path, '.cookies'));
  await cookieDir.create(recursive: true);
  final cookieJar = PersistCookieJar(storage: FileStorage('${cookieDir.path}/'));

  runApp(
    ProviderScope(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
        sharedPreferencesProvider.overrideWithValue(prefs),
        cookieJarProvider.overrideWithValue(cookieJar),
      ],
      child: const Cb8App(),
    ),
  );
}
