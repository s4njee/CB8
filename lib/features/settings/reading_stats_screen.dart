import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/reading_stats.dart';
import '../../data/repositories/providers.dart';
import '../library/widgets/empty_state.dart';

/// A dashboard of the reader's own activity, computed from the on-device
/// reading-history log. Remote sources don't expose an aggregate yet, so this
/// shows a friendly empty state when the active source can't provide stats.
class ReadingStatsScreen extends ConsumerWidget {
  /// Creates the reading-stats screen.
  const ReadingStatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(readingStatsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Reading stats')),
      body: statsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('Couldn’t load stats:\n$e', textAlign: TextAlign.center),
        ),
        data: (stats) {
          // Null means "this source can't provide stats" (a remote server);
          // empty means "local, but nothing logged yet".
          if (stats == null) {
            return const EmptyState(
              icon: Icons.insights_outlined,
              title: 'Stats live on your device',
              hint: 'Reading stats are tracked for your on-device library. '
                  'Switch to “This device” to see them.',
            );
          }
          if (stats.isEmpty) {
            return const EmptyState(
              icon: Icons.auto_stories_outlined,
              title: 'No reading yet',
              hint: 'Open a book or comic and your stats will start to fill in.',
            );
          }
          return _StatsBody(stats: stats);
        },
      ),
    );
  }
}

class _StatsBody extends StatelessWidget {
  const _StatsBody({required this.stats});
  final ReadingStats stats;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.7,
          children: [
            _StatCard(
              label: 'Time read',
              value: _formatDuration(stats.estimatedMinutes),
              hint: 'estimated',
              icon: Icons.timer_outlined,
            ),
            _StatCard(
              label: 'Current streak',
              value: '${stats.currentStreak}',
              hint: stats.currentStreak == 1 ? 'day' : 'days',
              icon: Icons.local_fire_department_outlined,
            ),
            _StatCard(
              label: 'Finished',
              value: '${stats.itemsFinished}',
              hint: stats.itemsFinished == 1 ? 'book' : 'books',
              icon: Icons.task_alt_outlined,
            ),
            _StatCard(
              label: 'Days active',
              value: '${stats.daysActive}',
              hint: 'best streak ${stats.longestStreak}',
              icon: Icons.calendar_today_outlined,
            ),
          ],
        ),
        const SizedBox(height: 24),
        const Text('Last 30 days',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        const SizedBox(height: 12),
        _ActivityChart(perDay: stats.perDay, busiest: stats.busiestDay),
        const SizedBox(height: 8),
        Text(
          '${stats.itemsStarted} ${stats.itemsStarted == 1 ? 'item' : 'items'} '
          'opened · ${stats.eventsLogged} sessions logged',
          style: const TextStyle(fontSize: 12, color: CbColors.mutedForeground),
        ),
      ],
    );
  }
}

String _formatDuration(int minutes) {
  if (minutes < 60) return '${minutes}m';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h ${m}m';
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
  });
  final String label;
  final String value;
  final String hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CbColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CbColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: CbColors.mutedForeground),
              const SizedBox(width: 6),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12, color: CbColors.mutedForeground)),
              ),
            ],
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(value,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w600)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(hint,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 11, color: CbColors.mutedForeground)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A simple bar chart of per-day activity — no chart dependency, just Columns.
class _ActivityChart extends StatelessWidget {
  const _ActivityChart({required this.perDay, required this.busiest});
  final List<DayActivity> perDay;
  final DayActivity? busiest;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final maxEvents = busiest?.events ?? 1;
    return Container(
      height: 120,
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      decoration: BoxDecoration(
        color: CbColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CbColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final d in perDay)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 1),
                child: Tooltip(
                  message: '${d.day.month}/${d.day.day}: '
                      '${d.events} ${d.events == 1 ? 'session' : 'sessions'}',
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      FractionallySizedBox(
                        heightFactor: d.events == 0
                            ? 0.02
                            : (d.events / maxEvents).clamp(0.06, 1.0),
                        child: Container(
                          decoration: BoxDecoration(
                            color: d.events == 0
                                ? CbColors.surfaceAlt
                                : primary.withValues(alpha: 0.85),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

