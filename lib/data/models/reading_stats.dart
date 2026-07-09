/// Aggregated reading-activity stats derived from the reading-history log.
///
/// The history is an append-only list of timestamped events (one per debounced
/// progress save while reading). We can't measure exact reading time from
/// discrete events, so [estimatedMinutes] is derived by clustering a book's
/// events into *sessions* (gaps under [sessionGapMinutes] belong to the same
/// sitting) and summing each session's span — an honest lower bound, labelled
/// "estimated" in the UI.
class ReadingStats {
  /// Creates a stats snapshot.
  const ReadingStats({
    required this.estimatedMinutes,
    required this.daysActive,
    required this.currentStreak,
    required this.longestStreak,
    required this.itemsFinished,
    required this.itemsStarted,
    required this.eventsLogged,
    required this.perDay,
    required this.busiestDay,
  });

  /// An empty snapshot (no history yet).
  static const empty = ReadingStats(
    estimatedMinutes: 0,
    daysActive: 0,
    currentStreak: 0,
    longestStreak: 0,
    itemsFinished: 0,
    itemsStarted: 0,
    eventsLogged: 0,
    perDay: [],
    busiestDay: null,
  );

  /// Estimated total time spent reading, in minutes (see class doc).
  final int estimatedMinutes;

  /// Distinct calendar days with any reading activity.
  final int daysActive;

  /// Consecutive days with activity ending today or yesterday.
  final int currentStreak;

  /// Longest run of consecutive active days ever.
  final int longestStreak;

  /// Number of distinct items read to the end (a `completed` event).
  final int itemsFinished;

  /// Number of distinct items opened at all.
  final int itemsStarted;

  /// Total history events logged (a rough proxy for page turns).
  final int eventsLogged;

  /// Per-day activity for a trailing window, oldest first — for the bar chart.
  final List<DayActivity> perDay;

  /// The most active day in the window, or null when there's no activity.
  final DayActivity? busiestDay;

  /// True when there's nothing to show.
  bool get isEmpty => eventsLogged == 0;
}

/// Activity on a single calendar day.
class DayActivity {
  /// Creates a day bucket.
  const DayActivity({required this.day, required this.events});

  /// The calendar day (local midnight).
  final DateTime day;

  /// Number of events on that day.
  final int events;
}

/// One reading-history event, trimmed to what the stats math needs.
class HistoryEvent {
  /// Creates an event.
  const HistoryEvent({
    required this.comicId,
    required this.timestamp,
    required this.completed,
  });

  /// The item this event belongs to (for per-item session clustering).
  final int comicId;

  /// When it happened.
  final DateTime timestamp;

  /// Whether this event marked the item finished.
  final bool completed;
}

/// Events more than this many minutes apart (within one item) start a new
/// reading session.
const int sessionGapMinutes = 30;

/// A single event's assumed contribution when it's alone in a session — a
/// session of one event has zero span, so credit a small fixed amount rather
/// than nothing.
const int _loneSessionMinutes = 2;

/// Number of trailing days the [ReadingStats.perDay] window covers.
const int perDayWindow = 30;

/// Computes [ReadingStats] from raw history [events] (any order). [now] is
/// injectable so streak math is testable.
ReadingStats computeReadingStats(List<HistoryEvent> events, {DateTime? now}) {
  if (events.isEmpty) return ReadingStats.empty;
  final today = _dayOf(now ?? DateTime.now());

  // --- session-based estimated minutes, per item ---
  final byItem = <int, List<DateTime>>{};
  for (final e in events) {
    (byItem[e.comicId] ??= []).add(e.timestamp);
  }
  var totalMinutes = 0.0;
  for (final times in byItem.values) {
    times.sort();
    var sessionStart = times.first;
    var prev = times.first;
    for (var i = 1; i <= times.length; i++) {
      final gapExceeded = i == times.length ||
          times[i].difference(prev).inMinutes > sessionGapMinutes;
      if (gapExceeded) {
        final span = prev.difference(sessionStart).inSeconds / 60.0;
        totalMinutes += span < 1 ? _loneSessionMinutes : span;
        if (i < times.length) {
          sessionStart = times[i];
        }
      }
      if (i < times.length) prev = times[i];
    }
  }

  // --- day buckets, streaks ---
  final activeDays = <DateTime>{for (final e in events) _dayOf(e.timestamp)};
  final sortedDays = activeDays.toList()..sort();
  final counts = <DateTime, int>{};
  for (final e in events) {
    final d = _dayOf(e.timestamp);
    counts[d] = (counts[d] ?? 0) + 1;
  }

  final currentStreak = _currentStreak(activeDays, today);
  final longestStreak = _longestStreak(sortedDays);

  // --- finished / started ---
  final finished = <int>{
    for (final e in events)
      if (e.completed) e.comicId,
  };
  final started = byItem.keys.toSet();

  // --- per-day window (oldest first) ---
  final perDay = <DayActivity>[
    for (var i = perDayWindow - 1; i >= 0; i--)
      DayActivity(
        day: today.subtract(Duration(days: i)),
        events: counts[today.subtract(Duration(days: i))] ?? 0,
      ),
  ];
  DayActivity? busiest;
  for (final d in perDay) {
    if (d.events > 0 && (busiest == null || d.events > busiest.events)) busiest = d;
  }

  return ReadingStats(
    estimatedMinutes: totalMinutes.round(),
    daysActive: activeDays.length,
    currentStreak: currentStreak,
    longestStreak: longestStreak,
    itemsFinished: finished.length,
    itemsStarted: started.length,
    eventsLogged: events.length,
    perDay: perDay,
    busiestDay: busiest,
  );
}

DateTime _dayOf(DateTime t) => DateTime(t.year, t.month, t.day);

/// Streak of consecutive active days ending today or yesterday (so a streak
/// isn't "broken" just because you haven't read yet today).
int _currentStreak(Set<DateTime> days, DateTime today) {
  final yesterday = today.subtract(const Duration(days: 1));
  var cursor = days.contains(today)
      ? today
      : (days.contains(yesterday) ? yesterday : null);
  if (cursor == null) return 0;
  var streak = 0;
  while (days.contains(cursor)) {
    streak++;
    cursor = cursor!.subtract(const Duration(days: 1));
  }
  return streak;
}

int _longestStreak(List<DateTime> sortedDays) {
  if (sortedDays.isEmpty) return 0;
  var longest = 1;
  var run = 1;
  for (var i = 1; i < sortedDays.length; i++) {
    if (sortedDays[i].difference(sortedDays[i - 1]).inDays == 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}
