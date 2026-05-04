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
  -- chapter_number is intrinsic to the comic (the issue/chapter index),
  -- distinct from series/volume which moved to series_id/volume_id FKs in v7.
  chapter_number REAL,
  completed INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  artist TEXT,
  genre TEXT,
  year INTEGER,
  summary TEXT,
  external_id TEXT,
  external_source TEXT,
  series_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
  volume_id INTEGER REFERENCES volume(id) ON DELETE SET NULL,
  deleted_at TEXT,
  publication_year INTEGER,
  publication_month INTEGER,
  comicinfo_json TEXT,
  user_edited_fields TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE COLLATE NOCASE,
  display_username TEXT,
  password_hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT UNIQUE COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  image TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- better-auth tables.
CREATE TABLE IF NOT EXISTS session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  password TEXT,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_account_user ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_account_provider ON account(provider_id, account_id);

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

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_name TEXT NOT NULL,
  localized_name TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown','ongoing','completed','hiatus','cancelled')),
  age_rating TEXT NOT NULL DEFAULT 'unknown'
    CHECK (age_rating IN ('unknown','g','pg','teen','mature','adults_only')),
  cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_library_name
  ON series(library_id, name COLLATE NOCASE)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_series_sort ON series(library_id, sort_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS volume (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  number REAL,
  name TEXT,
  cover_comic_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_volume_series_number
  ON volume(series_id, number)
  WHERE number IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_volume_series_implicit
  ON volume(series_id)
  WHERE number IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comics_series_id ON comics(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comics_volume_id ON comics(volume_id) WHERE volume_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comics_deleted ON comics(deleted_at) WHERE deleted_at IS NOT NULL;
`;
