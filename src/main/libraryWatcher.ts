import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { LibraryDatabase } from './libraryDatabase';
import { IngestService } from './ingestService';
import { isSupportedFile } from '../shared/mediaTypes';
import type { WatchRoot } from './db/watchRoots';

const EVENT_DEBOUNCE_MS = 2000;
const ROOT_REFRESH_MS = 60_000;
const RECONCILE_INTERVAL_MS = 10 * 60_000;

interface ActiveRoot {
  info: WatchRoot;
  dirs: Map<string, fs.FSWatcher>;
  pending: Set<string>;
  eventTimer: NodeJS.Timeout | null;
  reconcileTimer: NodeJS.Timeout | null;
  processing: Promise<void>;
  stopped: boolean;
}

interface TrackedPathRow {
  file_path: string;
  series_id: number | null;
}

export class LibraryWatcher {
  private roots = new Map<number, ActiveRoot>();
  private refreshTimer: NodeJS.Timeout | null = null;
  private stopped = true;

  constructor(private db: LibraryDatabase) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.refreshRoots();
    this.refreshTimer = setInterval(() => {
      void this.refreshRoots();
    }, ROOT_REFRESH_MS);
    this.refreshTimer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    await Promise.all([...this.roots.values()].map((root) => this.stopRoot(root)));
    this.roots.clear();
  }

  async refreshRoots(): Promise<void> {
    if (this.stopped) return;
    let rows: WatchRoot[];
    try {
      rows = this.db.watchRoots.listEnabledWatchRoots();
    } catch (err) {
      console.warn('[CB8 watcher] failed to read watch roots:', err instanceof Error ? err.message : err);
      return;
    }

    const liveIds = new Set(rows.map((r) => r.id));
    for (const [id, root] of this.roots) {
      if (!liveIds.has(id)) {
        await this.stopRoot(root);
        this.roots.delete(id);
      }
    }

    for (const row of rows) {
      if (this.roots.has(row.id)) continue;
      await this.startRoot(row);
    }
  }

  private async startRoot(info: WatchRoot): Promise<void> {
    const rootPath = path.resolve(info.rootPath);
    const root: ActiveRoot = {
      info: { ...info, rootPath },
      dirs: new Map(),
      pending: new Set(),
      eventTimer: null,
      reconcileTimer: null,
      processing: Promise.resolve(),
      stopped: false,
    };

    try {
      const stat = await fsp.stat(rootPath);
      if (!stat.isDirectory()) {
        console.warn(`[CB8 watcher] watch root is not a directory: ${rootPath}`);
        return;
      }
    } catch (err) {
      console.warn(`[CB8 watcher] cannot watch ${rootPath}:`, err instanceof Error ? err.message : err);
      return;
    }

    this.roots.set(info.id, root);
    await this.watchDirectoryRecursive(root, rootPath);
    root.reconcileTimer = setInterval(() => {
      this.enqueue(root, root.info.rootPath);
    }, RECONCILE_INTERVAL_MS);
    root.reconcileTimer.unref?.();
    this.enqueue(root, rootPath);
    console.log(`[CB8 watcher] watching ${rootPath}`);
  }

  private async stopRoot(root: ActiveRoot): Promise<void> {
    root.stopped = true;
    if (root.eventTimer) clearTimeout(root.eventTimer);
    if (root.reconcileTimer) clearInterval(root.reconcileTimer);
    for (const watcher of root.dirs.values()) {
      try { watcher.close(); } catch { /* ignore */ }
    }
    root.dirs.clear();
    try { await root.processing; } catch { /* ignore */ }
  }

  private async watchDirectoryRecursive(root: ActiveRoot, dirPath: string): Promise<void> {
    const resolved = path.resolve(dirPath);
    if (root.stopped || root.dirs.has(resolved)) return;

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(resolved, { withFileTypes: true });
    } catch {
      return;
    }

    try {
      const watcher = fs.watch(resolved, { persistent: false }, (_eventType, filename) => {
        if (root.stopped) return;
        const changedPath = filename
          ? path.join(resolved, filename.toString())
          : resolved;
        this.enqueue(root, changedPath);
      });
      watcher.on('error', (err) => {
        console.warn(`[CB8 watcher] ${resolved}:`, err.message);
        root.dirs.delete(resolved);
      });
      root.dirs.set(resolved, watcher);
    } catch (err) {
      console.warn(`[CB8 watcher] failed to watch ${resolved}:`, err instanceof Error ? err.message : err);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.watchDirectoryRecursive(root, path.join(resolved, entry.name));
      }
    }
  }

  private enqueue(root: ActiveRoot, changedPath: string): void {
    root.pending.add(path.resolve(changedPath));
    if (root.eventTimer) clearTimeout(root.eventTimer);
    root.eventTimer = setTimeout(() => {
      root.eventTimer = null;
      const paths = [...root.pending];
      root.pending.clear();
      root.processing = root.processing
        .then(() => this.processBatch(root, paths))
        .catch((err) => {
          console.warn('[CB8 watcher] batch failed:', err instanceof Error ? err.message : err);
        });
    }, EVENT_DEBOUNCE_MS);
    root.eventTimer.unref?.();
  }

  private async processBatch(root: ActiveRoot, changedPaths: string[]): Promise<void> {
    if (root.stopped) return;
    const ingest = new IngestService(this.db);
    const normalized = this.collapsePaths(root.info.rootPath, changedPaths);

    for (const changedPath of normalized) {
      if (root.stopped) return;
      await this.processPath(root, ingest, changedPath);
    }
  }

  private collapsePaths(rootPath: string, changedPaths: string[]): string[] {
    const unique = [...new Set(changedPaths.map((p) => path.resolve(p)))];
    unique.sort((a, b) => a.length - b.length);
    const out: string[] = [];
    for (const p of unique) {
      if (!this.isInside(rootPath, p)) continue;
      if (out.some((parent) => p === parent || p.startsWith(parent + path.sep))) continue;
      out.push(p);
    }
    return out;
  }

  private async processPath(root: ActiveRoot, ingest: IngestService, changedPath: string): Promise<void> {
    let stat: fs.Stats | null = null;
    try {
      stat = await fsp.stat(changedPath);
    } catch {
      stat = null;
    }

    if (stat?.isDirectory()) {
      await this.watchDirectoryRecursive(root, changedPath);
      await this.scanDirectory(root, changedPath);
      return;
    }

    if (stat?.isFile()) {
      if (!isSupportedFile(changedPath)) return;
      await this.restoreTrackedFile(changedPath);
      const result = await ingest.addFile(changedPath, {
        libraryId: root.info.libraryId,
        folderId: root.info.folderId ?? undefined,
        libraryRoot: root.info.rootPath,
      });
      if (result.added) {
        console.log(`[CB8 watcher] added ${changedPath}`);
      } else if (result.error) {
        console.warn(`[CB8 watcher] failed to add ${changedPath}: ${result.error}`);
      }
      return;
    }

    if (isSupportedFile(changedPath)) {
      this.softDeleteTrackedFile(changedPath);
    } else {
      this.softDeleteTrackedUnder(changedPath);
    }
  }

  private async scanDirectory(root: ActiveRoot, dirPath: string): Promise<void> {
    const scanner = new IngestService(this.db);
    const opts = {
      libraryId: root.info.libraryId,
      folderId: root.info.folderId ?? undefined,
      libraryRoot: root.info.rootPath,
    };
    let added = 0;
    added += await scanner.scanDirectory(dirPath, 'comic', () => {}, undefined, opts);
    added += await scanner.scanDirectory(dirPath, 'book', () => {}, undefined, opts);
    this.reconcileMissingUnder(dirPath);
    if (added > 0) console.log(`[CB8 watcher] added ${added} item${added === 1 ? '' : 's'} under ${dirPath}`);
  }

  private async restoreTrackedFile(filePath: string): Promise<void> {
    const row = this.db.raw.prepare(
      'SELECT series_id FROM comics WHERE file_path = ? AND deleted_at IS NOT NULL'
    ).get(filePath) as { series_id: number | null } | undefined;
    if (!row) return;
    const id = this.db.comics.restoreByPath(filePath);
    if (id != null && row.series_id != null) {
      this.db.comics.cascadeSeriesVolumeDeletion([row.series_id]);
    }
    console.log(`[CB8 watcher] restored ${filePath}`);
  }

  private softDeleteTrackedFile(filePath: string): void {
    const row = this.db.raw.prepare(
      'SELECT series_id FROM comics WHERE file_path = ? AND deleted_at IS NULL'
    ).get(filePath) as { series_id: number | null } | undefined;
    if (!row) return;
    const id = this.db.comics.softDeleteByPath(filePath);
    if (id != null && row.series_id != null) {
      this.db.comics.cascadeSeriesVolumeDeletion([row.series_id]);
    }
    console.log(`[CB8 watcher] marked missing ${filePath}`);
  }

  private softDeleteTrackedUnder(dirPath: string): void {
    const rows = this.trackedRowsUnder(dirPath, true);
    if (rows.length === 0) return;
    const seriesIds = new Set<number>();
    this.db.runInTransaction(() => {
      for (const row of rows) {
        this.db.comics.softDeleteByPath(row.file_path);
        if (row.series_id != null) seriesIds.add(row.series_id);
      }
      this.db.comics.cascadeSeriesVolumeDeletion([...seriesIds]);
    });
    console.log(`[CB8 watcher] marked ${rows.length} missing item${rows.length === 1 ? '' : 's'} under ${dirPath}`);
  }

  private reconcileMissingUnder(dirPath: string): void {
    const rows = this.trackedRowsUnder(dirPath, true);
    if (rows.length === 0) return;
    const missing = rows.filter((row) => !fs.existsSync(row.file_path));
    if (missing.length === 0) return;
    const seriesIds = new Set<number>();
    this.db.runInTransaction(() => {
      for (const row of missing) {
        this.db.comics.softDeleteByPath(row.file_path);
        if (row.series_id != null) seriesIds.add(row.series_id);
      }
      this.db.comics.cascadeSeriesVolumeDeletion([...seriesIds]);
    });
    console.log(`[CB8 watcher] reconciled ${missing.length} missing item${missing.length === 1 ? '' : 's'} under ${dirPath}`);
  }

  private trackedRowsUnder(dirPath: string, liveOnly: boolean): TrackedPathRow[] {
    const prefix = path.resolve(dirPath) + path.sep;
    const deletedClause = liveOnly ? 'AND deleted_at IS NULL' : '';
    return this.db.raw.prepare(
      `SELECT file_path, series_id
       FROM comics
       WHERE (file_path = ? OR file_path LIKE ?)
         ${deletedClause}`
    ).all(path.resolve(dirPath), prefix + '%') as TrackedPathRow[];
  }

  private isInside(rootPath: string, candidate: string): boolean {
    const root = path.resolve(rootPath);
    const resolved = path.resolve(candidate);
    return resolved === root || resolved.startsWith(root + path.sep);
  }
}
