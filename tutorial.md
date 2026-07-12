# CB8 tutorial — a friendly tour for non-programmers

This guide is for people who are **new to code** (or new to this project) and want
to understand how CB8 is built and how to make small changes with confidence. It
assumes no computer-science background. If a word looks like jargon, there's a
plain-English definition the first time it appears.

CB8 is an app for reading comics and e-books. There are two programs in this one
folder:

- **The app** (what you install on a phone or tablet) — written in a language
  called **Dart** using a toolkit called **Flutter**. This is everything in the
  `lib/` folder.
- **The server** (an optional home computer that stores your library and shares
  it to your devices) — written in **TypeScript**. This lives in the `webui/`
  folder and has its own guides. This tutorial is about **the app**.

If you want the deep technical version after this, read
[`README.md`](README.md) (a longer developer intro) and
[`ARCHITECTURE.md`](ARCHITECTURE.md) (the full design). This file is the gentle
on-ramp.

---

## 1. The mental model: an app is a stack of screens made of "widgets"

A Flutter app is built out of **widgets**. A widget is just a *description of a
piece of the screen* — a button, a line of text, an image, a whole page. Widgets
nest inside other widgets, like boxes inside boxes: a page contains a list, the
list contains rows, a row contains an image and some text.

The key idea: **you never draw pixels yourself.** You describe what you want
("a red button that says Resume"), and Flutter figures out how to paint it. When
something changes (you tap the button, new data arrives), Flutter rebuilds the
affected description and repaints only what changed.

You'll see two flavours of widget in this codebase:

- **Stateless** — a widget that just shows what it's given and never changes on
  its own (e.g. a cover thumbnail). Think of it as a printed photo.
- **Stateful / Consumer** — a widget that can change over time (e.g. the reader,
  which tracks your page). Think of it as a whiteboard you keep rewriting.

Don't worry about memorising this — you'll recognise it in the files.

---

## 2. How the project folders are organised

Open the `lib/` folder (that's the whole app). Here's the map, plain-English:

```
lib/
  main.dart        ← the app's front door: the very first code that runs
  app.dart         ← sets the overall look (dark theme) and starts navigation

  core/            ← small shared building blocks (colours, the app's theme)

  data/            ← everything about GETTING and SAVING your library
    db/            ← the on-device database (where your local library is stored)
    models/        ← the "shapes" of things: what a "comic" or a "server" looks like
    sources/       ← two ways to get books: from THIS device, or from a SERVER
    repositories/  ← the wiring that connects data to the screens

  features/        ← the actual screens, grouped by what they do
    shell/         ← the frame around everything: the tab bar / side rail + top bar
    library/       ← Home, Browse, the grid of covers, the cards
    organize/      ← Collections, Series, Tags
    connections/   ← the "This device / My server" switcher and its dialogs
    reader/        ← opening a book and reading it
      epub/        ← the e-book reader's parts (see §6)
      comic/       ← the comic (CBZ) reader
      pdf/         ← the PDF reader
    import/        ← adding files, and downloading from a server for offline use
    settings/      ← the Settings screen, reading stats, watched folders

test/              ← automated checks that prove the app still works
```

A helpful habit: **the folder name tells you the job.** Looking for the cover
grid? `features/library`. Looking for how a book is opened? `features/reader`.

---

## 3. The one big idea that makes CB8 special

CB8 can show your books from **two places**, and the screens never know which:

- **This device** — books stored right on your phone/tablet.
- **A server** — a home computer running the CB8 server that holds your library.

There is a single "menu" of things a library can do — list books, remember your
place, mark favourites — described in one file:
[`lib/data/sources/library_source.dart`](lib/data/sources/library_source.dart).
Both the local library and the server library promise to provide that same menu.
The screens only ever talk to "the current library," never to a specific one.

Why this matters for *you*: if you add a new capability (say, "star rating"), you
add it to that one menu file, then fill it in for both the local and server
versions. The screens come along for free. This is the project's golden rule:
**screens never ask "is this local or a server?"**

---

## 4. Following one real action from tap to result

Let's trace what happens when you **tap a cover to read a book**. You can open
these files and follow along — you don't need to change anything.

1. **You tap a cover.** The cover is a `ComicCard`
   ([`lib/features/library/widgets/comic_card.dart`](lib/features/library/widgets/comic_card.dart)).
   Tapping it tells the app to go to a web-style address inside the app:
   `/read/123` (123 being the book's id).

2. **The app routes there.** The list of in-app addresses lives in
   [`lib/core/router/app_router.dart`](lib/core/router/app_router.dart). `/read/123`
   maps to the **reader dispatcher**.

3. **The dispatcher picks the right reader.**
   [`lib/features/reader/reader_dispatcher.dart`](lib/features/reader/reader_dispatcher.dart)
   loads the book's details, notices its type (`.cbz`, `.pdf`, `.epub`), and opens
   the matching reader. (It also does the clever "you're further along on another
   device — jump there?" check for downloaded books.)

4. **The reader shows the book** and, as you turn pages, quietly saves your place.

That's the whole shape of the app: **a tap becomes an address, an address becomes
a screen, a screen talks to the current library.**

---

## 5. Where your reading place is remembered

Every time you turn a page, CB8 records where you are — but not *instantly*. If it
saved on every single page flip it would be wasteful, so it **waits until you
pause** (about a second) and then saves once. That politeness lives in one tiny
file:
[`lib/features/reader/progress_saver.dart`](lib/features/reader/progress_saver.dart)
(the "debounce" — a fancy word for "wait for a lull before acting").

For e-books, "what page am I on" isn't meaningful (text reflows), so CB8 stores a
**percentage through the whole book** instead. That's why the Home screen can show
a real progress bar for e-books.

If a book was **downloaded from a server** for offline reading, saving also sends
your place back to the server so your other devices catch up. That mirroring is in
[`lib/features/reader/progress_sync.dart`](lib/features/reader/progress_sync.dart).

---

## 6. A worked example of "good structure": the e-book reader

The e-book reader is a great before/after lesson. It used to be **one enormous
file of ~2,200 lines** that did everything at once — rendering, settings, the
table of contents, search, text-to-speech, the progress bar. Big files like that
are hard to read and easy to break.

It's now split into small files that each do *one* job, in
[`lib/features/reader/epub/`](lib/features/reader/epub/):

| File | Its one job |
|---|---|
| `epub_preferences.dart` | Remembers your font, size, theme, margins |
| `typography_sheet.dart` | The panel where you change those settings |
| `toc_sheet.dart` | The table-of-contents list |
| `search_sheet.dart` | Search-inside-the-book |
| `tts_controls.dart` | Read-aloud (text to speech) controls |
| `epub_progress_bar.dart` | The bottom "Chapter 7/38 · 42%" bar |
| `epub_reader_style.dart` | The shared dark colours for the reader |

The main file, `unified_reader_screen.dart`, shrank to ~570 lines and now just
**coordinates** those pieces. This is the lesson to copy in your own changes:
**when a file is trying to do many things, give each thing its own file.**

---

## 7. How to actually run and change the app

You'll need **Flutter** installed (see [`README.md`](README.md) for setup). Then,
from the project folder in a terminal:

```bash
flutter pub get      # download the libraries the app depends on (do this once)
flutter run          # build and launch the app on a connected phone/simulator
```

While `flutter run` is going, the single most useful trick is **hot reload**:
save a file and press `r` in the terminal, and your change appears in the running
app in under a second, *without losing your place*. Change a colour, press `r`,
see it. This tight loop is the best way to learn — poke something and watch what
happens.

Two commands to run **before you consider a change finished**:

```bash
flutter analyze      # a spell-checker for code: flags mistakes without running it
flutter test         # runs the automated checks in test/ — all should pass
```

If `analyze` is clean and `test` is all green, your change didn't break anything
the project knows how to check for.

---

## 8. A safe first change to try

Want to feel the loop? Try changing the app's accent colour default.

1. Open [`lib/core/theme/app_theme.dart`](lib/core/theme/app_theme.dart).
2. Find the list of accent colours (`AccentTheme`). The first one, `red`, is the
   default.
3. With `flutter run` active, tweak a value and press `r`. Watch the buttons and
   highlights change.
4. Run `flutter analyze` — still clean? Good.
5. Changed your mind? In the terminal, `git checkout lib/core/theme/app_theme.dart`
   throws your edit away and restores the original. (`git` is the project's
   undo-history; nothing you try is permanent until you deliberately "commit" it.)

Small, reversible experiments like this are exactly how everyone learns a
codebase. You will not break anything you can't undo.

---

## 9. Where to read more, by curiosity

- **"What can the app do?"** → [`FEATURES.md`](FEATURES.md)
- **"How is it all wired together?"** → [`ARCHITECTURE.md`](ARCHITECTURE.md)
- **"I'm a developer, give me the real intro"** → [`README.md`](README.md)
- **"Rules for changing code here"** → [`AGENTS.md`](AGENTS.md)
- **"How's the server deployed?"** → [`webui/DEPLOY.md`](webui/DEPLOY.md)

The most important takeaway: **the code is organised so you rarely need to hold
all of it in your head at once.** Find the folder whose name matches your task,
open the file whose name matches the thing, read the comment at the top of that
file, and make a small change. Then `analyze`, `test`, and see it run.
