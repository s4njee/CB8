# R8/ProGuard keep rules for release builds (referenced from build.gradle.kts).
#
# Note: drift, sqlite3_flutter_libs and pdfrx do their work in Dart + bundled
# native libraries (FFI). R8 only shrinks JVM bytecode, so those native paths are
# unaffected and need no keep rules. The rules below cover the JVM-side plugins
# and silence warnings R8 emits for optional/desugared references.

# --- Flutter engine (the Flutter Gradle plugin also applies its own rules) ---
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.**

# --- flutter_inappwebview (EPUB reader engine; uses reflection + JS bridge) ---
-keep class com.pichillilorenzo.flutter_inappwebview_android.** { *; }
-dontwarn com.pichillilorenzo.flutter_inappwebview_android.**

# --- AndroidX / WebKit referenced by the WebView plugin ---
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# --- sqlite3_flutter_libs loads its native lib by name; keep the loader shim ---
-keep class com.tekartik.sqflite.** { *; }
-dontwarn com.tekartik.**

# Generic: don't warn on missing optional desugar/annotation references.
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
