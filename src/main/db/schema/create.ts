export const SCHEMA = `
CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  cover_thumbnail BLOB,
  date_added TEXT NOT NULL DEFAULT (datetime('now')),
  last_page INTEGER,
  last_location TEXT,
  last_read TEXT,
  media_type TEXT NOT NULL DEFAULT 'comic',
  series_name TEXT,
  volume_number REAL,
  chapter_number REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  artist TEXT,
  genre TEXT,
  year INTEGER,
  summary TEXT,
  external_id TEXT,
  external_source TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  last_page INTEGER,
  last_location TEXT,
  last_read TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, comic_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  page INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, comic_id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS comic_tags (
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (comic_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_comics_file_path ON comics(file_path);
CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_comics_date_added ON comics(date_added);
CREATE INDEX IF NOT EXISTS idx_comics_file_size ON comics(file_size);
CREATE INDEX IF NOT EXISTS idx_comics_page_count ON comics(page_count);
CREATE INDEX IF NOT EXISTS idx_comics_series ON comics(series_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_comics_last_read ON comics(last_read);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_comic ON bookmarks(user_id, comic_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON reading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON reading_history(timestamp);

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL DEFAULT 'comic',
  date_created TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_comics (
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  PRIMARY KEY (library_id, comic_id)
);

CREATE INDEX IF NOT EXISTS idx_library_comics_library ON library_comics(library_id);
CREATE INDEX IF NOT EXISTS idx_library_comics_comic ON library_comics(comic_id);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  date_created TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS folder_comics (
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  PRIMARY KEY (folder_id, comic_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_comics_folder ON folder_comics(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_comics_comic ON folder_comics(comic_id);

CREATE TABLE IF NOT EXISTS library_folders (
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  PRIMARY KEY (library_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_library_folders_library ON library_folders(library_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_folder ON library_folders(folder_id);

CREATE TABLE IF NOT EXISTS dismissed_paths (
  file_path TEXT PRIMARY KEY NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
