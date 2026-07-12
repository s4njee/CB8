import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

import 'epub_preferences.dart';
import 'epub_reader_style.dart';

/// The EPUB reader's typography/layout settings bottom sheet.
///
/// Edits the reader's [EpubReaderPreferences] *in place*: each control calls a
/// `set*` method (which persists the field and returns the minimal Readium
/// patch), hands that patch to [onApply], and rebuilds itself. The reader
/// screen's `onApply` forwards the patch to the live book and `setState`s so
/// anything it renders from the prefs (e.g. the page background) follows —
/// this is what makes changes preview live behind the open sheet.
class TypographySheet extends StatefulWidget {
  /// Creates a settings sheet editing [prefs].
  const TypographySheet({
    super.key,
    required this.prefs,
    required this.onApply,
    required this.onReset,
  });

  /// The reader's preference store; mutated directly by this sheet.
  final EpubReaderPreferences prefs;

  /// Called after each change with the patch to push to the rendered book.
  final ValueChanged<EPUBPreferences> onApply;

  /// Called when the reset button is tapped. The caller runs
  /// `EpubReaderPreferences.reset()` and applies its patches; the sheet then
  /// re-reads the (now default) values from [prefs].
  final VoidCallback onReset;

  @override
  State<TypographySheet> createState() => _TypographySheetState();
}

class _TypographySheetState extends State<TypographySheet> {
  EpubReaderPreferences get _prefs => widget.prefs;

  /// Push [patch] to the book and refresh this sheet's controls, which read
  /// their values straight from the (just-mutated) preference store.
  void _apply(EPUBPreferences patch) {
    widget.onApply(patch);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Container(
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.only(bottom: 24),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 12, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: TabBar(
                      labelColor: Colors.white,
                      unselectedLabelColor: Colors.white38,
                      indicatorColor: Colors.white,
                      tabs: [
                        Tab(text: 'Text & Spacing'),
                        Tab(text: 'Layout & Options'),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Reset settings',
                    icon: const Icon(Icons.restart_alt),
                    color: Colors.white70,
                    onPressed: () {
                      widget.onReset();
                      setState(() {});
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _buildTextSpacingTab(context),
                  _buildLayoutTab(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextSpacingTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Theme',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: EpubReaderTheme.values.map((t) {
              return _choiceButton(
                context,
                selected: t == _prefs.theme,
                onPressed: () => _apply(_prefs.setTheme(t)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(t.icon, size: 16),
                    const SizedBox(width: 8),
                    Text(t.label),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Font size',
                style: TextStyle(color: Colors.white, fontSize: 15),
              ),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.remove, color: Colors.white),
                    onPressed: () =>
                        _apply(_prefs.setFontScale(_prefs.fontScale - 0.1)),
                  ),
                  Text(
                    '${(_prefs.fontScale * 100).round()}%',
                    style: const TextStyle(color: Colors.white),
                  ),
                  IconButton(
                    icon: const Icon(Icons.add, color: Colors.white),
                    onPressed: () =>
                        _apply(_prefs.setFontScale(_prefs.fontScale + 0.1)),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Font Family',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: EpubFont.values.map((f) {
              return _choiceButton(
                context,
                selected: f == _prefs.font,
                onPressed: () => _apply(_prefs.setFont(f)),
                child: Text(f.label),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          _sliderRow(
            'Line height',
            _prefs.lineHeight,
            0.8,
            2.0,
            (v) => _apply(_prefs.setLineHeight(v)),
          ),
          _sliderRow(
            'Margins',
            _prefs.pageMargins,
            0.5,
            2.0,
            (v) => _apply(_prefs.setPageMargins(v)),
          ),
          _sliderRow(
            'Word spacing',
            _prefs.wordSpacing,
            -0.2,
            1.0,
            (v) => _apply(_prefs.setWordSpacing(v)),
          ),
          _sliderRow(
            'Letter spacing',
            _prefs.letterSpacing,
            -0.1,
            0.5,
            (v) => _apply(_prefs.setLetterSpacing(v)),
          ),
        ],
      ),
    );
  }

  Widget _buildLayoutTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Text Alignment',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _alignBtn(context, TextAlign.left, Icons.format_align_left),
              _alignBtn(context, TextAlign.center, Icons.format_align_center),
              _alignBtn(context, TextAlign.right, Icons.format_align_right),
              _alignBtn(context, TextAlign.justify, Icons.format_align_justify),
            ],
          ),
          const SizedBox(height: 20),
          _switchRow(
            'Publisher styles',
            _prefs.publisherStyles,
            (v) => _apply(_prefs.setPublisherStyles(v)),
          ),
          _switchRow(
            'Text normalization',
            _prefs.textNormalization,
            (v) => _apply(_prefs.setTextNormalization(v)),
          ),
          _switchRow(
            'Ligatures',
            _prefs.ligatures,
            (v) => _apply(_prefs.setLigatures(v)),
          ),
          _switchRow(
            'Hyphens',
            _prefs.hyphens,
            (v) => _apply(_prefs.setHyphens(v)),
          ),
          const SizedBox(height: 16),
          const Text(
            'Reading Progression',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _choiceButton(
                context,
                selected:
                    _prefs.readingProgression == EpubReadingProgression.ltr,
                minWidth: 144,
                onPressed: () => _apply(
                  _prefs.setReadingProgression(EpubReadingProgression.ltr),
                ),
                child: const Text('Left to right'),
              ),
              _choiceButton(
                context,
                selected:
                    _prefs.readingProgression == EpubReadingProgression.rtl,
                minWidth: 144,
                onPressed: () => _apply(
                  _prefs.setReadingProgression(EpubReadingProgression.rtl),
                ),
                child: const Text('Right to left'),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text(
            'Image Filter',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _choiceButton(
                context,
                selected: _prefs.imageFilter == null,
                onPressed: () => _apply(_prefs.setImageFilter(null)),
                child: const Text('None'),
              ),
              ...EpubImageFilter.values.map((f) {
                return _choiceButton(
                  context,
                  selected: f == _prefs.imageFilter,
                  onPressed: () => _apply(_prefs.setImageFilter(f)),
                  child: Text(f.name),
                );
              }),
            ],
          ),
        ],
      ),
    );
  }

  /// Pill-shaped selectable option button used by every choice group above.
  Widget _choiceButton(
    BuildContext context, {
    required bool selected,
    required VoidCallback onPressed,
    required Widget child,
    double minWidth = 96,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return ConstrainedBox(
      constraints: BoxConstraints(minWidth: minWidth, minHeight: 40),
      child: FilledButton.tonal(
        style: FilledButton.styleFrom(
          backgroundColor: selected ? scheme.primary : readerControlColor,
          foregroundColor: selected ? Colors.black : Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
        onPressed: onPressed,
        child: child,
      ),
    );
  }

  Widget _alignBtn(BuildContext context, TextAlign align, IconData icon) {
    final active = _prefs.textAlign == align;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: IconButton(
          style: IconButton.styleFrom(
            backgroundColor: active
                ? Theme.of(context).colorScheme.primary
                : readerControlColor,
            foregroundColor: active ? Colors.black : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          icon: Icon(icon),
          onPressed: () => _apply(_prefs.setTextAlign(align)),
        ),
      ),
    );
  }

  Widget _sliderRow(
    String label,
    double val,
    double min,
    double max,
    ValueChanged<double> onChange,
  ) {
    return Row(
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 14),
          ),
        ),
        Expanded(
          child: Slider(value: val, min: min, max: max, onChanged: onChange),
        ),
        Text(
          val.toStringAsFixed(1),
          style: const TextStyle(color: Colors.white70, fontSize: 13),
        ),
      ],
    );
  }

  Widget _switchRow(String label, bool val, ValueChanged<bool> onChange) {
    return SwitchListTile(
      title: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 14),
      ),
      value: val,
      onChanged: onChange,
      contentPadding: EdgeInsets.zero,
      activeThumbColor: Colors.white,
      activeTrackColor: Colors.white54,
      inactiveThumbColor: Colors.white38,
      inactiveTrackColor: Colors.white10,
    );
  }
}
