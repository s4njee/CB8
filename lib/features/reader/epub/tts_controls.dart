import 'package:flutter/material.dart';
import 'package:flutter_readium/flutter_readium.dart';

import 'epub_reader_style.dart';

/// Read-aloud (TTS) UI for the EPUB reader: the playback bar shown under the
/// page while TTS is active, and the voice/speed/pitch settings sheet.
///
/// Both are dumb views over the reader screen's TTS session state — enabling
/// TTS, the highlight decoration, and persisting the chosen settings all stay
/// in `unified_reader_screen.dart`, which owns the Readium session lifecycle.

/// The TTS playback control bar (settings / previous / play-pause / next /
/// stop). The reader shows it only while TTS is active.
///
/// Drives navigation directly through [reader] (previous/pause/resume/next
/// need no extra state), but stop goes through [onStop] because leaving TTS
/// also flips reader-screen state, not just the engine.
class TtsControlsBar extends StatelessWidget {
  /// Creates the control bar for the active TTS session on [reader].
  const TtsControlsBar({
    super.key,
    required this.reader,
    required this.playerState,
    required this.onStop,
    required this.onOpenSettings,
  });

  /// The reader session whose TTS playback this bar controls.
  final FlutterReadium reader;

  /// Latest engine state (from `onTimebasedPlayerStateChanged`); drives the
  /// play/pause/loading toggle. Null until the engine reports once.
  final ReadiumTimebasedState? playerState;

  /// Stops read-aloud entirely (the reader also clears its TTS-active state).
  final VoidCallback onStop;

  /// Opens the [TtsSettingsSheet].
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final isPlaying = playerState?.state == TimebasedState.playing;
    final isLoading = playerState?.state == TimebasedState.loading;

    return Container(
      color: const Color(0xFF1C1C1E),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            tooltip: 'Read Aloud Settings',
            icon: const Icon(Icons.settings, color: Colors.white70),
            onPressed: onOpenSettings,
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                tooltip: 'Previous',
                icon: const Icon(Icons.skip_previous, color: Colors.white),
                onPressed: () => reader.previous(),
              ),
              const SizedBox(width: 8),
              if (isLoading)
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              else
                IconButton(
                  tooltip: isPlaying ? 'Pause' : 'Play',
                  icon: Icon(
                    isPlaying
                        ? Icons.pause_circle_filled
                        : Icons.play_circle_filled,
                    size: 36,
                    color: Colors.white,
                  ),
                  onPressed: () {
                    if (isPlaying) {
                      reader.pause();
                    } else {
                      reader.resume();
                    }
                  },
                ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Next',
                icon: const Icon(Icons.skip_next, color: Colors.white),
                onPressed: () => reader.next(),
              ),
            ],
          ),
          IconButton(
            tooltip: 'Stop',
            icon: const Icon(Icons.stop, color: Colors.white70),
            onPressed: onStop,
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet for read-aloud speed, pitch, and voice selection.
///
/// Keeps local copies of the values so its sliders track live while the sheet
/// is open (the parent's `setState` doesn't rebuild an already-shown modal);
/// every change is still reported immediately through the callbacks so the
/// engine and persistence stay current.
class TtsSettingsSheet extends StatefulWidget {
  /// Creates the settings sheet seeded with the current TTS settings.
  const TtsSettingsSheet({
    super.key,
    required this.voices,
    required this.selectedVoice,
    required this.speechRate,
    required this.pitch,
    required this.onSpeechRateChanged,
    required this.onPitchChanged,
    required this.onVoiceChanged,
  });

  /// Voices the platform TTS engine offers (queried once on open).
  final List<ReaderTTSVoice> voices;

  /// The currently-selected voice, or null if none is available.
  final ReaderTTSVoice? selectedVoice;

  /// Current speech-rate multiplier.
  final double speechRate;

  /// Current voice pitch.
  final double pitch;

  /// Reports a new speech rate (the reader persists and applies it live).
  final ValueChanged<double> onSpeechRateChanged;

  /// Reports a new pitch (the reader persists and applies it live).
  final ValueChanged<double> onPitchChanged;

  /// Reports a new voice choice (the reader persists and applies it live).
  final ValueChanged<ReaderTTSVoice?> onVoiceChanged;

  @override
  State<TtsSettingsSheet> createState() => _TtsSettingsSheetState();
}

class _TtsSettingsSheetState extends State<TtsSettingsSheet> {
  late double _speechRate;
  late double _pitch;
  ReaderTTSVoice? _selectedVoice;

  @override
  void initState() {
    super.initState();
    _speechRate = widget.speechRate;
    _pitch = widget.pitch;
    _selectedVoice = widget.selectedVoice;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Read Aloud Settings',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              const SizedBox(
                width: 80,
                child: Text('Speed', style: TextStyle(color: Colors.white70)),
              ),
              Expanded(
                child: Slider(
                  value: _speechRate,
                  min: 0.5,
                  max: 2.0,
                  divisions: 6,
                  label: '${_speechRate}x',
                  onChanged: (val) {
                    setState(() => _speechRate = val);
                    widget.onSpeechRateChanged(val);
                  },
                ),
              ),
              Text(
                '${_speechRate.toStringAsFixed(1)}x',
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const SizedBox(
                width: 80,
                child: Text('Pitch', style: TextStyle(color: Colors.white70)),
              ),
              Expanded(
                child: Slider(
                  value: _pitch,
                  min: 0.5,
                  max: 1.5,
                  divisions: 10,
                  label: '$_pitch',
                  onChanged: (val) {
                    setState(() => _pitch = val);
                    widget.onPitchChanged(val);
                  },
                ),
              ),
              Text(
                _pitch.toStringAsFixed(1),
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Voice', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 8),
          Flexible(
            child: widget.voices.isEmpty
                ? const Text(
                    'No voices available',
                    style: TextStyle(
                      color: Colors.white30,
                      fontStyle: FontStyle.italic,
                    ),
                  )
                : Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: readerControlColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<ReaderTTSVoice>(
                        dropdownColor: readerControlColor,
                        isExpanded: true,
                        value: _selectedVoice,
                        style: const TextStyle(color: Colors.white),
                        iconEnabledColor: Colors.white70,
                        hint: const Text(
                          'Select Voice',
                          style: TextStyle(color: Colors.white38),
                        ),
                        items: widget.voices.map((voice) {
                          final details = [
                            if (voice.language.isNotEmpty) voice.language,
                            voice.gender.name,
                          ].join(', ');
                          return DropdownMenuItem<ReaderTTSVoice>(
                            value: voice,
                            child: Text(
                              '${voice.name} ($details)',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (voice) {
                          setState(() => _selectedVoice = voice);
                          widget.onVoiceChanged(voice);
                        },
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
