import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

import 'epub_reader_style.dart';

/// Full-text search bottom sheet for the EPUB reader.
///
/// Owns only the query/results UI; the search itself runs through the shared
/// Readium session ([reader]) because the search index lives with the open
/// publication. Result taps hand a [Locator] back to the reader screen, which
/// pops the sheet and navigates.
///
/// Note the reader's global keyboard handler stays active under this sheet;
/// typing in the field works only because `ReaderKeyboard` stands down while
/// an `EditableText` has focus (bugs.md #7) — keep that guard.
class SearchSheet extends StatefulWidget {
  /// Creates a search sheet running queries through [reader].
  const SearchSheet({super.key, required this.reader, required this.onTap});

  /// The reader session that owns the open publication (and its search index).
  final FlutterReadium reader;

  /// Called with the tapped result's locator; the caller navigates and closes
  /// the sheet.
  final ValueChanged<Locator> onTap;

  @override
  State<SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<SearchSheet> {
  final TextEditingController _query = TextEditingController();
  List<TextSearchResult> _results = [];
  bool _searching = false;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _doSearch() async {
    final text = _query.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _searching = true;
      _results = [];
    });
    try {
      final res = await widget.reader.searchInPublication(text);
      if (mounted) setState(() => _results = res);
    } catch (_) {
      // A failed search just shows "No results" — not worth an error banner.
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      // Keep the results above the software keyboard while typing.
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _query,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search book...',
                hintStyle: const TextStyle(color: Colors.white30),
                filled: true,
                fillColor: readerControlColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.search, color: Colors.white70),
                  onPressed: _doSearch,
                ),
              ),
              onSubmitted: (_) => _doSearch(),
            ),
          ),
          if (_searching)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_results.isEmpty)
            const Expanded(
              child: Center(
                child: Text(
                  'No results',
                  style: TextStyle(color: Colors.white30),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                itemCount: _results.length,
                separatorBuilder: (context, index) =>
                    const Divider(color: Colors.white12, height: 1),
                itemBuilder: (context, index) {
                  final res = _results[index];
                  final before = res.locator.text?.before ?? '';
                  final highlight = res.locator.text?.highlight ?? '';
                  final after = res.locator.text?.after ?? '';

                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 8,
                    ),
                    title: RichText(
                      text: TextSpan(
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
                        children: [
                          TextSpan(text: before),
                          TextSpan(
                            text: highlight,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontWeight: FontWeight.bold,
                              backgroundColor: Theme.of(
                                context,
                              ).colorScheme.primary.withValues(alpha: 0.15),
                            ),
                          ),
                          TextSpan(text: after),
                        ],
                      ),
                    ),
                    subtitle: Text(
                      res.locator.title ?? '',
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 11,
                      ),
                    ),
                    onTap: () => widget.onTap(res.locator),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
