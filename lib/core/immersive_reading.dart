/// Mobile-only immersive-reading helpers.
///
/// On iOS/Android a full-bleed reader (comic / PDF) can hide the system status
/// and navigation bars so the page is truly edge-to-edge, then bring them back
/// when the in-app chrome is shown. On desktop these are no-ops — window chrome
/// is handled separately (see `window_control.dart`).
library;

import 'dart:io';

import 'package:flutter/services.dart';

bool get _isMobile => Platform.isIOS || Platform.isAndroid;

/// Match the system bars to the reader's in-app chrome: visible chrome keeps the
/// normal edge-to-edge bars; hidden chrome goes fully immersive so nothing
/// frames the page. Call this whenever the reader's chrome visibility flips.
void setReaderImmersion({required bool chromeVisible}) {
  if (!_isMobile) return;
  SystemChrome.setEnabledSystemUIMode(
    chromeVisible ? SystemUiMode.edgeToEdge : SystemUiMode.immersiveSticky,
  );
}

/// Restore the normal system bars when leaving a reader (call from `dispose`).
void restoreSystemChrome() {
  if (!_isMobile) return;
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
}
