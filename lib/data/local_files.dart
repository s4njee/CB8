/// App-owned storage for library files.
///
/// Invariant: `Comics.uri` stores paths RELATIVE to [appStorageDir] for files
/// the app owns. On iOS the data-container UUID changes on every reinstall, so
/// an absolute path stored in the DB goes stale even though the files
/// themselves are migrated. Imported files are copied in so the app always
/// owns them (no security-scoped bookmark needed for re-reads); absolute paths
/// appear only for external files (watched folders) and legacy desktop rows.
library;

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// The base directory all relative library paths resolve against
/// (the platform's application-support dir).
Future<Directory> appStorageDir() => getApplicationSupportDirectory();

/// Resolve a stored library uri (relative to [appStorageDir], or a legacy
/// absolute path) into an absolute filesystem path.
Future<String> resolveLibraryPath(String stored) async {
  if (p.isAbsolute(stored)) return stored; // desktop / legacy rows
  final base = await appStorageDir();
  return p.join(base.path, stored);
}

/// Copy an externally-picked file into app-owned storage, returning its path
/// relative to [appStorageDir] (stable across reinstalls).
Future<String> importIntoLibrary(String externalPath) async {
  final base = await appStorageDir();
  final dir = Directory(p.join(base.path, 'library'));
  await dir.create(recursive: true);
  final dest = p.join(dir.path, p.basename(externalPath));
  await File(externalPath).copy(dest);
  return p.join('library', p.basename(externalPath));
}
