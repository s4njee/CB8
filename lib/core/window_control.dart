import 'dart:io';

import 'package:flutter/services.dart';

/// Thin bridge to native desktop window controls.
///
/// Currently only macOS implements the `cb8/window` channel (see
/// `macos/Runner/MainFlutterWindow.swift`); on other platforms the calls are
/// no-ops so callers don't need to platform-check.
class WindowControl {
  WindowControl._();

  static const MethodChannel _channel = MethodChannel('cb8/window');

  /// Toggle the native window between fullscreen and windowed.
  static Future<void> toggleFullscreen() async {
    if (!Platform.isMacOS) return;
    try {
      await _channel.invokeMethod<void>('toggleFullScreen');
    } on PlatformException {
      // Window not available (e.g. during teardown) — ignore.
    }
  }
}
