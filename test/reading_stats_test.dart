import 'package:cb8_flutter/data/models/reading_stats.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  DateTime day(int y, int m, int d, [int h = 12, int min = 0]) =>
      DateTime(y, m, d, h, min);

  group('computeReadingStats', () {
    test('empty history yields the empty snapshot', () {
      final s = computeReadingStats(const []);
      expect(s.isEmpty, isTrue);
      expect(s.estimatedMinutes, 0);
      expect(s.currentStreak, 0);
      expect(s.perDay, isEmpty);
    });

    test('counts distinct started and finished items', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 12, 5), completed: true),
        HistoryEvent(comicId: 2, timestamp: day(2026, 7, 1), completed: false),
      ], now: day(2026, 7, 1, 20));
      expect(s.itemsStarted, 2);
      expect(s.itemsFinished, 1);
      expect(s.eventsLogged, 3);
    });

    test('estimated minutes sum session spans, not gaps between sessions', () {
      // One item: two events 10 min apart (one session, 10 min), then a
      // 3-hour gap, then two events 5 min apart (second session, 5 min).
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 9, 0), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 9, 10), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 12, 10), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 12, 15), completed: false),
      ], now: day(2026, 7, 1, 20));
      expect(s.estimatedMinutes, 15); // 10 + 5, not the 3h gap
    });

    test('a lone event credits a small fixed session, not zero', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1, 9, 0), completed: false),
      ], now: day(2026, 7, 1, 20));
      expect(s.estimatedMinutes, greaterThan(0));
    });

    test('current streak counts consecutive days ending today', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 4), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 5), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 6), completed: false),
      ], now: day(2026, 7, 6, 20));
      expect(s.currentStreak, 3);
    });

    test('current streak survives "not read yet today" (ends yesterday)', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 4), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 5), completed: false),
      ], now: day(2026, 7, 6, 9)); // today has no events yet
      expect(s.currentStreak, 2);
    });

    test('current streak is zero when the last active day is stale', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 1), completed: false),
      ], now: day(2026, 7, 6, 9));
      expect(s.currentStreak, 0);
    });

    test('longest streak finds the best run regardless of recency', () {
      final s = computeReadingStats([
        // a 3-day run in the past…
        HistoryEvent(comicId: 1, timestamp: day(2026, 6, 1), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 6, 2), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 6, 3), completed: false),
        // …then a 1-day blip later
        HistoryEvent(comicId: 1, timestamp: day(2026, 6, 20), completed: false),
      ], now: day(2026, 6, 25));
      expect(s.longestStreak, 3);
      expect(s.currentStreak, 0);
    });

    test('per-day window is the trailing 30 days, oldest first, and busiest', () {
      final s = computeReadingStats([
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 6, 9), completed: false),
        HistoryEvent(comicId: 1, timestamp: day(2026, 7, 6, 10), completed: false),
        HistoryEvent(comicId: 2, timestamp: day(2026, 7, 5, 9), completed: false),
      ], now: day(2026, 7, 6, 20));
      expect(s.perDay.length, perDayWindow);
      expect(s.perDay.last.day, day(2026, 7, 6, 0, 0));
      expect(s.perDay.last.events, 2);
      expect(s.busiestDay!.day, day(2026, 7, 6, 0, 0));
      expect(s.busiestDay!.events, 2);
    });
  });
}
