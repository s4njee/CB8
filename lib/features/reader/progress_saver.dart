import 'dart:async';

/// Debounces reader progress writes.
///
/// Every reader used to persist progress on *each* page turn / locator event —
/// a DB write (plus a reading-history insert) or an HTTP PUT per event, each of
/// which also triggers a catalog-wide provider refetch via
/// `libraryChangesProvider`. Flipping through pages fired that whole pipeline
/// per flip. Scheduling through this class keeps only the latest write and runs
/// it after a short quiet period; [flush] (called from the reader's `dispose`)
/// runs any pending write immediately so the final position is never lost.
///
/// Every reader screen owns one instance. The scheduled write typically pairs
/// the local `setProgress` with `mirrorProgressToOrigin` (progress_sync.dart)
/// so both stores see the same debounced cadence.
class ProgressSaver {
  /// Creates a saver that waits [delay] after the last schedule before writing.
  ProgressSaver({this.delay = const Duration(milliseconds: 800)});

  /// Quiet period after the last [schedule] before the write runs.
  final Duration delay;

  Timer? _timer;
  void Function()? _pending;

  /// Schedules [write] to run after [delay], replacing any pending write.
  ///
  /// [write] must not depend on widget state that dies before `dispose` —
  /// capture what it needs (e.g. the source) at schedule time.
  void schedule(void Function() write) {
    _pending = write;
    _timer?.cancel();
    _timer = Timer(delay, flush);
  }

  /// Runs the pending write (if any) now. Safe to call repeatedly.
  void flush() {
    _timer?.cancel();
    _timer = null;
    final write = _pending;
    _pending = null;
    write?.call();
  }
}
