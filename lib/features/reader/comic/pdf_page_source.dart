import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:pdfrx/pdfrx.dart';

import 'comic_page_source.dart';

/// Renders PDF pages to images so PDFs flow through the same comic reader (and
/// thus the same scroll / single / two-page modes + fit-to-screen). Pages render
/// lazily and are cached by Flutter's image cache.
///
/// Two hard-won robustness rules for large PDFs:
///  1. Renders are **serialized** through a [_RenderGate]. pdfium is not
///     reentrant — concurrent `page.render()` calls on one document corrupt its
///     state and abort the process (SIGABRT). A 500-page PDF in scroll mode
///     otherwise fires dozens of renders at once and takes the app down.
///  2. A failed render **never throws**; it yields a placeholder. Throwing made
///     Flutter's image cache retry endlessly, storming pdfium with more failing
///     calls until it crashed.
class PdfPageSource implements ComicPageSource {
  /// Wraps an open [PdfDocument]; [renderWidth] is the target raster width.
  PdfPageSource(this._doc, {this.renderWidth = 1600});

  final PdfDocument _doc;

  /// Target width (px) each page is rasterized to before fit-to-screen scaling.
  final double renderWidth;
  final _RenderGate _gate = _RenderGate();

  /// Opens a PDF from a file path and wraps it as a page source.
  static Future<PdfPageSource> openFile(String path) async {
    return PdfPageSource(await PdfDocument.openFile(path));
  }

  @override
  int get pageCount => _doc.pages.length;

  @override
  ImageProvider imageFor(int index) => _PdfPageImage(_doc, index, renderWidth, _gate);

  @override
  void dispose() => _doc.dispose();
}

/// Runs async tasks strictly one at a time (FIFO), so only one pdfium render is
/// ever in flight per document.
class _RenderGate {
  Future<void> _tail = Future<void>.value();

  Future<T> run<T>(Future<T> Function() task) {
    final next = _tail.then((_) => task());
    // Keep the chain alive regardless of this task's success/failure.
    _tail = next.then((_) {}, onError: (_) {});
    return next;
  }
}

class _PdfPageImage extends ImageProvider<_PdfPageKey> {
  _PdfPageImage(this.doc, this.pageIndex, this.width, this.gate);

  final PdfDocument doc;
  final int pageIndex; // 0-based
  final double width;
  final _RenderGate gate;

  @override
  Future<_PdfPageKey> obtainKey(ImageConfiguration configuration) {
    return SynchronousFuture(_PdfPageKey(identityHashCode(doc), pageIndex, width.round()));
  }

  @override
  ImageStreamCompleter loadImage(_PdfPageKey key, ImageDecoderCallback decode) {
    return OneFrameImageStreamCompleter(_render());
  }

  Future<ImageInfo> _render() async {
    try {
      final page = doc.pages[pageIndex];
      // Target width, but cap the longest side so a high-resolution page can't
      // allocate a giant bitmap and OOM-kill the app.
      const maxSide = 4096;
      double w = width;
      double h = width * page.height / page.width;
      if (!w.isFinite || !h.isFinite || w <= 0 || h <= 0) return _placeholder();
      final scale = math.min(1.0, maxSide / math.max(w, h));
      final wi = math.max(1, (w * scale).round());
      final hi = math.max(1, (h * scale).round());

      // Render the FULL page scaled to fill the bitmap (without fullWidth/
      // fullHeight pdfrx draws the page at 72-dpi in the top-left corner), and
      // serialize the call so pdfium only handles one render at a time.
      final rendered = await gate.run(() => page.render(
            width: wi,
            height: hi,
            fullWidth: wi.toDouble(),
            fullHeight: hi.toDouble(),
          ));
      if (rendered == null) return _placeholder();

      final completer = Completer<ui.Image>();
      ui.decodeImageFromPixels(
        rendered.pixels,
        rendered.width,
        rendered.height,
        // pdfrx renders BGRA8888; rgba8888 here swaps red/blue.
        ui.PixelFormat.bgra8888,
        completer.complete,
      );
      final image = await completer.future;
      rendered.dispose();
      return ImageInfo(image: image);
    } catch (_) {
      // A single page failing must never take down the reader.
      return _placeholder();
    }
  }

  /// A tiny dark-gray image shown in place of a page that couldn't be rendered.
  Future<ImageInfo> _placeholder() async {
    const w = 2, h = 3;
    final pixels = Uint8List(w * h * 4);
    for (var i = 0; i < pixels.length; i += 4) {
      pixels[i] = 0x2A;
      pixels[i + 1] = 0x2A;
      pixels[i + 2] = 0x2A;
      pixels[i + 3] = 0xFF;
    }
    final completer = Completer<ui.Image>();
    ui.decodeImageFromPixels(pixels, w, h, ui.PixelFormat.rgba8888, completer.complete);
    return ImageInfo(image: await completer.future);
  }
}

class _PdfPageKey {
  const _PdfPageKey(this.docId, this.pageIndex, this.width);
  final int docId;
  final int pageIndex;
  final int width;

  @override
  bool operator ==(Object other) =>
      other is _PdfPageKey &&
      other.docId == docId &&
      other.pageIndex == pageIndex &&
      other.width == width;

  @override
  int get hashCode => Object.hash(docId, pageIndex, width);
}
