import 'package:cb8_flutter/data/models/comic_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  ComicSummary base({
    String? originConnectionId,
    String? originComicId,
    int? lastPage,
    double? lastPercent,
    bool completed = false,
  }) =>
      ComicSummary(
        id: '1',
        title: 'Book',
        pageCount: 100,
        mediaType: 'book',
        lastPage: lastPage,
        lastPercent: lastPercent,
        completed: completed,
        originConnectionId: originConnectionId,
        originComicId: originComicId,
      );

  group('server-origin linkage', () {
    test('hasServerOrigin requires both origin ids', () {
      expect(base().hasServerOrigin, isFalse);
      expect(base(originConnectionId: 'srv').hasServerOrigin, isFalse);
      expect(base(originComicId: '42').hasServerOrigin, isFalse);
      expect(
        base(originConnectionId: 'srv', originComicId: '42').hasServerOrigin,
        isTrue,
      );
    });

    test('copyWith preserves the origin link', () {
      final c = base(originConnectionId: 'srv', originComicId: '42')
          .copyWith(sourceUri: '/tmp/x.epub');
      expect(c.originConnectionId, 'srv');
      expect(c.originComicId, '42');
      expect(c.sourceUri, '/tmp/x.epub');
    });

    test('withProgress adopts a pulled position but keeps identity/origin', () {
      final adopted = base(originConnectionId: 'srv', originComicId: '42')
          .withProgress(lastPercent: 62, completed: false);
      expect(adopted.lastPercent, 62);
      expect(adopted.progress, closeTo(0.62, 0.001));
      expect(adopted.originConnectionId, 'srv');
      expect(adopted.originComicId, '42');
      expect(adopted.id, '1');
    });

    test('withProgress can mark completed', () {
      final done = base(lastPercent: 40).withProgress(completed: true);
      expect(done.completed, isTrue);
      expect(done.progress, 1.0);
    });
  });
}
