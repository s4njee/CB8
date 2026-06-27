import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Wraps a reader so desktop keyboard keys drive page navigation, zoom, and
/// fullscreen.
///
/// - Right/Down/PageDown/Space = next, Left/Up/PageUp = previous
/// - Home/End = first/last, Escape = back
/// - Cmd/Ctrl + `=`/`-`/`0` = zoom in / out / reset (if callbacks given)
/// - `f` = toggle fullscreen (if callback given)
///
/// The touch tap-zones still work; this just adds the keys desktop users expect.
/// Uses a [HardwareKeyboard] handler rather than a [Focus]/[Shortcuts] wrapper
/// because the readers embed a `Scrollable` (PhotoView's PageView, pdfrx) that
/// grabs focus and consumes the arrow keys before an ancestor would see them.
class ReaderKeyboard extends StatefulWidget {
  /// Wraps [child], routing keyboard shortcuts to the given callbacks.
  const ReaderKeyboard({
    super.key,
    required this.child,
    required this.onNext,
    required this.onPrev,
    this.onFirst,
    this.onLast,
    this.onZoomIn,
    this.onZoomOut,
    this.onZoomReset,
    this.onToggleFullscreen,
  });

  /// The wrapped reader content.
  final Widget child;

  /// Advance one page (Right/Down/PageDown/Space).
  final VoidCallback onNext;

  /// Go back one page (Left/Up/PageUp).
  final VoidCallback onPrev;

  /// Jump to the first page (Home); omit to disable.
  final VoidCallback? onFirst;

  /// Jump to the last page (End); omit to disable.
  final VoidCallback? onLast;

  /// Zoom in (Cmd/Ctrl+`=`); omit to disable.
  final VoidCallback? onZoomIn;

  /// Zoom out (Cmd/Ctrl+`-`); omit to disable.
  final VoidCallback? onZoomOut;

  /// Reset zoom (Cmd/Ctrl+`0`); omit to disable.
  final VoidCallback? onZoomReset;

  /// Toggle fullscreen (`f`); omit to disable.
  final VoidCallback? onToggleFullscreen;

  @override
  State<ReaderKeyboard> createState() => _ReaderKeyboardState();
}

class _ReaderKeyboardState extends State<ReaderKeyboard> {
  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    super.dispose();
  }

  bool _onKey(KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return false;
    final key = event.logicalKey;
    final keyboard = HardwareKeyboard.instance;
    final cmd = keyboard.isMetaPressed || keyboard.isControlPressed;

    // Cmd/Ctrl-modified: zoom controls.
    if (cmd) {
      if (key == LogicalKeyboardKey.equal ||
          key == LogicalKeyboardKey.add ||
          key == LogicalKeyboardKey.numpadAdd) {
        return _fire(widget.onZoomIn);
      }
      if (key == LogicalKeyboardKey.minus || key == LogicalKeyboardKey.numpadSubtract) {
        return _fire(widget.onZoomOut);
      }
      if (key == LogicalKeyboardKey.digit0 || key == LogicalKeyboardKey.numpad0) {
        return _fire(widget.onZoomReset);
      }
      // Leave other Cmd/Ctrl combos (Cmd+W, Cmd+Q, …) to the system.
      return false;
    }

    if (key == LogicalKeyboardKey.keyF) {
      return _fire(widget.onToggleFullscreen);
    }
    if (key == LogicalKeyboardKey.arrowRight ||
        key == LogicalKeyboardKey.arrowDown ||
        key == LogicalKeyboardKey.pageDown ||
        key == LogicalKeyboardKey.space) {
      widget.onNext();
      return true;
    }
    if (key == LogicalKeyboardKey.arrowLeft ||
        key == LogicalKeyboardKey.arrowUp ||
        key == LogicalKeyboardKey.pageUp) {
      widget.onPrev();
      return true;
    }
    if (key == LogicalKeyboardKey.home && widget.onFirst != null) {
      widget.onFirst!();
      return true;
    }
    if (key == LogicalKeyboardKey.end && widget.onLast != null) {
      widget.onLast!();
      return true;
    }
    if (key == LogicalKeyboardKey.escape) {
      Navigator.of(context).maybePop();
      return true;
    }
    return false;
  }

  /// Invoke [cb] if present and report the key as handled; otherwise ignore it.
  bool _fire(VoidCallback? cb) {
    if (cb == null) return false;
    cb();
    return true;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
