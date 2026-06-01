/**
 * ingestErrorLog.ts — persistent JSONL log of files the ingest pipeline
 * failed to process.
 *
 * Without this, the only trace of a failed import is a `console.error` line
 * on stderr — useless for users diagnosing why 26k of 40k comics didn't
 * land. Each failure is appended as one JSON object per line to
 * `<userData>/ingest-errors.jsonl`, plus exposed via the admin API at
 * `/api/admin/ingest-errors` so the SPA can show counts and examples.
 *
 * The log is append-only. Use `clear()` (called by DELETE on the admin
 * endpoint) to truncate.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type IngestErrorClass =
  | 'wasm_oom'        // legacy archive wasm memory failure
  | 'archive_open'    // 7z / archive backend refused to open
  | 'archive_extract' // archive opened, but a page/cover could not extract
  | 'fs_missing'      // ENOENT — file disappeared between scan and ingest
  | 'fs_permission'   // EACCES / EPERM
  | 'timeout'         // cover/page-count timed out
  | 'unknown';

export interface IngestErrorRecord {
  ts: string;           // ISO timestamp
  path: string;         // absolute file path
  ext: string;          // lowercased extension with leading dot, e.g. ".cbr"
  errorClass: IngestErrorClass;
  message: string;      // raw error message (trimmed)
}

let logPath: string | null = null;

/**
 * Set the directory where `ingest-errors.jsonl` lives. Called once at
 * startup from each entry point (Electron window, Electron headless,
 * standalone Docker). Defaults to a tmpdir-scoped path if never set so
 * tests don't crash.
 */
export function setIngestErrorLogPath(dir: string): void {
  logPath = path.join(dir, 'ingest-errors.jsonl');
}

function resolveLogPath(): string {
  return logPath ?? path.join(os.tmpdir(), 'cb8', 'ingest-errors.jsonl');
}

/**
 * Classify an unknown error from the ingest worker. The order matters —
 * wasm-OOM messages also match generic "out of bounds", so check it first.
 */
export function classifyIngestError(err: unknown, filePath: string): IngestErrorClass {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException)?.code;

  if (/out of bounds memory access|RangeError.*WebAssembly|Out of memory|Aborted\(OOM\)/i.test(msg)) {
    return 'wasm_oom';
  }
  if (code === 'ENOENT') return 'fs_missing';
  if (code === 'EACCES' || code === 'EPERM') return 'fs_permission';
  if (/timed out|timeout/i.test(msg)) return 'timeout';
  if (/Unsupported Method|Failed to read page|extract page|failed to extract|Can not open encrypted archive/i.test(msg)) {
    return 'archive_extract';
  }
  if (/Failed to open archive|invalid|corrupt|unexpected end|Bad CRC|RAR.*invalid/i.test(msg)) {
    return 'archive_open';
  }
  // Anything still unclassified is "unknown" — caller still gets the raw message.
  void filePath;
  return 'unknown';
}

/**
 * Append a single failure record. Fire-and-forget: errors writing the log
 * itself are swallowed so a flaky disk can't break the import loop.
 */
export function recordIngestError(record: Omit<IngestErrorRecord, 'ts'>): void {
  const full: IngestErrorRecord = { ts: new Date().toISOString(), ...record };
  const line = JSON.stringify(full) + '\n';
  const dest = resolveLogPath();
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.appendFileSync(dest, line);
  } catch {
    /* best-effort */
  }
}

/**
 * Read the last `limit` records (newest first). Returns [] if the log
 * doesn't exist yet. Reads the full file because the typical size cap is
 * modest; switch to a tail-seek strategy if real-world logs grow huge.
 */
export function getRecentIngestErrors(limit = 50): IngestErrorRecord[] {
  const dest = resolveLogPath();
  let text: string;
  try {
    text = fs.readFileSync(dest, 'utf8');
  } catch {
    return [];
  }
  const lines = text.split('\n').filter((l) => l.length > 0);
  const slice = lines.slice(-limit);
  const out: IngestErrorRecord[] = [];
  for (let i = slice.length - 1; i >= 0; i--) {
    try {
      out.push(JSON.parse(slice[i]) as IngestErrorRecord);
    } catch { /* skip malformed lines */ }
  }
  return out;
}

/** Total number of recorded errors (line count). */
export function countIngestErrors(): number {
  const dest = resolveLogPath();
  try {
    const text = fs.readFileSync(dest, 'utf8');
    return text.split('\n').filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}

/** Truncate the log. Called by the admin DELETE endpoint. */
export function clearIngestErrors(): void {
  const dest = resolveLogPath();
  try {
    fs.writeFileSync(dest, '');
  } catch { /* best-effort */ }
}
