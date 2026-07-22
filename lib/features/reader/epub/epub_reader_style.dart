import 'package:flutter/material.dart';

/// The EPUB reader's fixed dark-chrome palette.
///
/// The reader chrome (app bar, progress bar, modal bottom sheets) deliberately
/// stays dark no matter which page theme the user picks — only the book canvas
/// re-colors. That keeps the controls legible and consistent while the page
/// behind them switches between dark / light / sepia. These three surface
/// colors are shared by `unified_reader_screen.dart` and every sheet under
/// `epub/`; keeping them here is what keeps that chrome visually in sync.

/// Translucent warm near-black behind the app bar and the progress bar, so a
/// hint of the page shows through at the edges instead of a hard opaque band.
const readerChromeColor = Color(0xF20D0B0A);

/// Opaque warm near-black used as the background of every modal bottom sheet
/// (the Folio popover surface).
const readerPanelColor = Color(0xFF151110);

/// Slightly lighter warm surface for interactive controls sitting on a sheet
/// (choice buttons, text fields, dropdowns), so they read against the panel.
const readerControlColor = Color(0xFF211B14);
