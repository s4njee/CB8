/**
 * LibraryDatabase — thin facade over the per-domain modules in `src/main/db/`.
 *
 * Each domain is exposed as a getter (`db.tags`, `db.libraries`, …) that
 * returns a namespace bound to the underlying SQLite handle. The
 * `bindAll(module, db)` helper takes a module of `(db, ...args) => R`
 * functions and returns `(...args) => R` — the same function set with
 * the leading `db` argument curried.
 *
 * Adding a new function to any underlying module is automatically
 * available through the facade with no edit here. Method names match
 * the module's exported names.
 *
 * The hierarchy work (series/volume) and the soft-delete sweeper share
 * this pattern; the older domains were converted to it post-v8 to drop
 * the per-method passthrough boilerplate.
 */

import Database from 'better-sqlite3';
import { openOrRecreate } from './db/schema';
import * as appMeta from './db/appMeta';
import * as tags from './db/tags';
import * as bookmarks from './db/bookmarks';
import * as favorites from './db/favorites';
import * as users from './db/users';
import * as history from './db/history';
import * as progress from './db/progress';
import * as libraries from './db/libraries';
import * as folders from './db/folders';
import * as comics from './db/comics';
import * as series from './db/series';
import * as volume from './db/volume';
import * as search from './db/search';

// ---------------------------------------------------------------------------
// bindAll — strip the leading `db` parameter from every function in a module
//
// `T` is the underlying module type; `Bound<T>` is the same shape with the
// leading `db: Database.Database` argument stripped out of every function.
// Non-function exports are passed through unchanged.
// ---------------------------------------------------------------------------

type Bound<T> = {
  [K in keyof T]: T[K] extends (db: Database.Database, ...args: infer A) => infer R
    ? (...args: A) => R
    : T[K];
};

function bindAll<T extends object>(module: T, db: Database.Database): Bound<T> {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(module) as (keyof T)[]) {
    const v = (module as Record<string, unknown>)[key as string];
    if (typeof v === 'function') {
      out[key as string] = (...args: unknown[]) =>
        (v as (...a: unknown[]) => unknown)(db, ...args);
    } else {
      out[key as string] = v;
    }
  }
  return out as Bound<T>;
}

// ---------------------------------------------------------------------------

export class LibraryDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = openOrRecreate(dbPath);
  }

  initialize(): void {
    // Schema already created in constructor; this is a no-op hook for callers.
  }

  /** Raw better-sqlite3 handle — used by the better-auth adapter. */
  get raw(): Database.Database { return this.db; }

  /**
   * Run a synchronous block inside a single SQLite transaction. Used by
   * the ingest pipeline to batch many small inserts into one commit,
   * which avoids per-row WAL fsync cost.
   */
  runInTransaction(fn: () => void): void {
    this.db.transaction(fn)();
  }

  // Domain accessors. Each getter rebuilds the bound namespace per access;
  // the per-call cost is one Object.keys + one shallow object copy, which is
  // negligible compared to the SQL these functions issue.

  get appMeta(): Bound<typeof appMeta>     { return bindAll(appMeta, this.db); }
  get bookmarks(): Bound<typeof bookmarks> { return bindAll(bookmarks, this.db); }
  get comics(): Bound<typeof comics>       { return bindAll(comics, this.db); }
  get favorites(): Bound<typeof favorites> { return bindAll(favorites, this.db); }
  get folders(): Bound<typeof folders>     { return bindAll(folders, this.db); }
  get history(): Bound<typeof history>     { return bindAll(history, this.db); }
  get libraries(): Bound<typeof libraries> { return bindAll(libraries, this.db); }
  get progress(): Bound<typeof progress>   { return bindAll(progress, this.db); }
  get search(): Bound<typeof search>       { return bindAll(search, this.db); }
  get series(): Bound<typeof series>       { return bindAll(series, this.db); }
  get tags(): Bound<typeof tags>           { return bindAll(tags, this.db); }
  get users(): Bound<typeof users>         { return bindAll(users, this.db); }
  get volume(): Bound<typeof volume>       { return bindAll(volume, this.db); }
}
