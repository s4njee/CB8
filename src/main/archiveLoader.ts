/**
 * ArchiveLoader - opens comic archives, lists image entries in natural sort
 * order, and extracts page data.
 *
 * Backend selection:
 *   CBZ  → yauzl  (native Node.js; no external binary, random-access via
 *                  kept-open ZipFile handle)
 *   CBR  → unrar  (faster and more reliable than 7-Zip for RAR/RAR5;
 *                  falls back to 7-Zip when unrar is not installed)
 *
 * unrar binary resolution order:
 *   1. $CB8_UNRAR_PATH env var
 *   2. /usr/bin/unrar
 *   3. /usr/local/bin/unrar
 *   4. `unrar` on $PATH
 *   5. (unavailable — falls back to 7-Zip for CBR)
 */

import { createRequire } from 'node:module';
import { execFile, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yauzl from 'yauzl';
import { isImageFile } from '../shared/imageFilter';
import { naturalCompare } from '../shared/naturalSort';
import { selectCoverImage, ImageEntry } from '../shared/coverSelection';
import { decode as decodeImage } from './imageDecoder';
import { LruByBytes } from '../shared/lru';
import { assertSevenZipAvailable } from './sevenZipPath';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ArchiveEntry {
  filename: string;
  index: number;
}

export interface ArchiveHandle {
  filePath: string;
  format: 'cbz' | 'cbr';
  entries: ArchiveEntry[];
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB per open archive
const LIST_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 30_000;

// ===========================================================================
// yauzl backend (CBZ)
// ===========================================================================

interface YauzlArchiveHandle extends ArchiveHandle {
  readonly _tag: 'yauzl';
  _zipFile: yauzl.ZipFile;
  _entryMap: Map<number, yauzl.Entry>; // page-index → zip entry
  _pageCache: LruByBytes<number, Buffer>;
}

function isYauzlHandle(h: ArchiveHandle): h is YauzlArchiveHandle {
  return (h as YauzlArchiveHandle)._tag === 'yauzl';
}

function openYauzlZip(
  filePath: string,
): Promise<{ zipFile: yauzl.ZipFile; entries: ArchiveEntry[]; entryMap: Map<number, yauzl.Entry> }> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipFile) => {
      if (err || !zipFile) {
        reject(err ?? new Error(`Failed to open ${filePath}`));
        return;
      }

      const imageItems: { name: string; entry: yauzl.Entry }[] = [];

      zipFile.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith('/') && isImageFile(entry.fileName)) {
          imageItems.push({ name: entry.fileName, entry });
        }
        zipFile.readEntry();
      });

      zipFile.on('end', () => {
        imageItems.sort((a, b) => naturalCompare(a.name, b.name));
        const entries: ArchiveEntry[] = imageItems.map(({ name }, index) => ({ filename: name, index }));
        const entryMap = new Map<number, yauzl.Entry>(imageItems.map(({ entry }, index) => [index, entry]));
        resolve({ zipFile, entries, entryMap });
      });

      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

function readYauzlEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error(`Failed to stream entry: ${entry.fileName}`));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

async function getYauzlPage(handle: YauzlArchiveHandle, pageIndex: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= handle.pageCount) {
    throw new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`);
  }
  const cached = handle._pageCache.get(pageIndex);
  if (cached) return cached;

  const entry = handle._entryMap.get(pageIndex)!;
  try {
    const buf = await readYauzlEntry(handle._zipFile, entry);
    handle._pageCache.set(pageIndex, buf);
    return buf;
  } catch (err) {
    throw new Error(
      `Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ===========================================================================
// unrar backend (CBR primary)
// ===========================================================================

interface UnrarArchiveHandle extends ArchiveHandle {
  readonly _tag: 'unrar';
  _unrar: string;
  _pageCache: LruByBytes<number, Buffer>;
}

function isUnrarHandle(h: ArchiveHandle): h is UnrarArchiveHandle {
  return (h as UnrarArchiveHandle)._tag === 'unrar';
}

const UNRAR_SEARCH_PATHS = ['/usr/bin/unrar', '/usr/local/bin/unrar'];
let _unrarBin: string | null | undefined = undefined;

/**
 * Locate the unrar binary. Checks $CB8_UNRAR_PATH, well-known paths, then
 * $PATH. Returns null if unavailable. Result is cached after the first call.
 */
function findUnrarBin(): string | null {
  if (_unrarBin !== undefined) return _unrarBin;

  const fromEnv = process.env.CB8_UNRAR_PATH?.trim();
  if (fromEnv) return (_unrarBin = fromEnv);

  for (const p of UNRAR_SEARCH_PATHS) {
    const r = spawnSync(p, ['--version'], { timeout: 3_000, windowsHide: true });
    if (!r.error) return (_unrarBin = p);
  }

  const r = spawnSync('unrar', ['--version'], { timeout: 3_000, windowsHide: true });
  if (!r.error) return (_unrarBin = 'unrar');

  return (_unrarBin = null);
}

/**
 * Run a command and return its stdout as a Buffer.
 * Rejects with stderr content on non-zero exit or spawn failure.
 */
function spawnToBuffer(
  file: string,
  args: string[],
  opts: { timeout?: number; maxBuffer?: number } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { timeout = EXTRACT_TIMEOUT_MS, maxBuffer = 50 * 1024 * 1024 } = opts;
    // Cast to any: execFile has many overloads and the encoding:'buffer' variant
    // is awkward to express without explicit cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (execFile as any)(
      file,
      args,
      { timeout, maxBuffer, encoding: 'buffer' },
      (err: Error | null, stdout: Buffer, stderr: Buffer) => {
        if (err) {
          reject(new Error(stderr?.length ? stderr.toString().trim() : err.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function listUnrarEntries(filePath: string, unrar: string): Promise<ArchiveEntry[]> {
  const buf = await spawnToBuffer(unrar, ['lb', filePath], { timeout: LIST_TIMEOUT_MS });
  const names = buf
    .toString('utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && isImageFile(s));
  const sorted = [...names].sort((a, b) => naturalCompare(a, b));
  return sorted.map((filename, index) => ({ filename, index }));
}

async function getUnrarPage(handle: UnrarArchiveHandle, pageIndex: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= handle.pageCount) {
    throw new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`);
  }
  const cached = handle._pageCache.get(pageIndex);
  if (cached) return cached;

  const targetName = handle.entries[pageIndex].filename;
  try {
    // `unrar p -inul` prints the file to stdout; -inul suppresses progress noise.
    const buf = await spawnToBuffer(
      handle._unrar,
      ['p', '-inul', handle.filePath, targetName],
      { timeout: EXTRACT_TIMEOUT_MS },
    );
    handle._pageCache.set(pageIndex, buf);
    return buf;
  } catch (err) {
    throw new Error(
      `Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ===========================================================================
// 7-Zip backend (CBR fallback + legacy)
// ===========================================================================

type SevenZipRecord = {
  file?: string;
  techInfo?: Map<string, string>;
};

type SevenZipStream<T> = Readable & {
  _childProcess?: ChildProcess;
  on(event: 'data', listener: (data: T) => void): SevenZipStream<T>;
  on(event: 'error', listener: (err: Error) => void): SevenZipStream<T>;
  on(event: 'end', listener: () => void): SevenZipStream<T>;
};

type SevenZipOptions = {
  $bin?: string;
  $cherryPick?: string | string[];
  noWildcards?: boolean;
  overwrite?: string;
  techInfo?: boolean;
  yes?: boolean;
};

type SevenZipModule = {
  list: (archive: string, options?: SevenZipOptions) => SevenZipStream<SevenZipRecord>;
  extract: (archive: string, output: string, options?: SevenZipOptions) => SevenZipStream<SevenZipRecord>;
};

const Seven = require('node-7z') as SevenZipModule;

interface SevenZipArchiveHandle extends ArchiveHandle {
  readonly _tag: '7z';
  _pageCache: LruByBytes<number, Buffer>;
}

function isSevenZipHandle(h: ArchiveHandle): h is SevenZipArchiveHandle {
  return (h as SevenZipArchiveHandle)._tag === '7z';
}

function runSevenZip<T>(stream: SevenZipStream<T>, action: string, timeoutMs: number): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const records: T[] = [];
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    timeout = setTimeout(() => {
      stream._childProcess?.kill();
      finish(() => reject(new Error(`${action} timed out after ${timeoutMs} ms`)));
    }, timeoutMs);
    stream.on('data', (data) => records.push(data));
    stream.on('error', (err) => {
      const stderr = (err as Error & { stderr?: string }).stderr?.trim();
      finish(() => reject(new Error(`${action} failed: ${stderr || err.message}`)));
    });
    stream.on('end', () => finish(() => resolve(records)));
  });
}

function archiveBasename(filename: string): string {
  return filename.split(/[\\/]+/).filter(Boolean).at(-1) ?? filename;
}

function isDirectory(record: SevenZipRecord): boolean {
  const t = record.techInfo;
  if (!t) return false;
  return t.get('Folder') === '+' || (t.get('Attributes') ?? '').includes('D');
}

async function listSevenZipEntries(filePath: string): Promise<ArchiveEntry[]> {
  const bin = assertSevenZipAvailable();
  const records = await runSevenZip(
    Seven.list(filePath, { $bin: bin, techInfo: true }),
    `List archive ${filePath}`,
    LIST_TIMEOUT_MS,
  );
  const names = records
    .filter((r) => r.file && !isDirectory(r) && isImageFile(r.file))
    .map((r) => r.file!)
    .sort((a, b) => naturalCompare(a, b));
  return names.map((filename, index) => ({ filename, index }));
}

async function openSevenZipArchive(filePath: string, format: ArchiveHandle['format']): Promise<SevenZipArchiveHandle> {
  try {
    const entries = await listSevenZipEntries(filePath);
    return {
      filePath, format, _tag: '7z', entries, pageCount: entries.length,
      _pageCache: new LruByBytes<number, Buffer>({ maxBytes: PAGE_CACHE_MAX_BYTES, sizeOf: (b) => b.length }),
    };
  } catch (err) {
    throw new Error(`Failed to open archive: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function findExtractedFile(tempDir: string, expectedName: string): Promise<string> {
  const expectedPath = path.join(tempDir, expectedName);
  try { await fsp.access(expectedPath); return expectedPath; } catch { /* fall through */ }
  const dirents = await fsp.readdir(tempDir, { withFileTypes: true });
  const files = dirents.filter((d) => d.isFile()).map((d) => d.name);
  if (files.length === 1) return path.join(tempDir, files[0]);
  throw new Error(`extracted file ${expectedName} not found`);
}

async function getSevenZipPage(handle: SevenZipArchiveHandle, pageIndex: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= handle.pageCount) {
    throw new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`);
  }
  const cached = handle._pageCache.get(pageIndex);
  if (cached) return cached;

  const targetName = handle.entries[pageIndex].filename;
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-7z-page-'));
  try {
    const bin = assertSevenZipAvailable();
    await runSevenZip(
      Seven.extract(handle.filePath, tempDir, {
        $bin: bin, $cherryPick: targetName, noWildcards: true, overwrite: 'a', yes: true,
      }),
      `Extract page ${pageIndex} from ${handle.filePath}`,
      EXTRACT_TIMEOUT_MS,
    );
    const extractedPath = await findExtractedFile(tempDir, archiveBasename(targetName));
    const buf = await fsp.readFile(extractedPath);
    handle._pageCache.set(pageIndex, buf);
    return buf;
  } catch (err) {
    throw new Error(`Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => { /* ignore */ });
  }
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Open a CBZ (ZIP) archive using the native yauzl backend.
 */
export async function openCbz(filePath: string): Promise<ArchiveHandle> {
  try {
    const { zipFile, entries, entryMap } = await openYauzlZip(filePath);
    const handle: YauzlArchiveHandle = {
      filePath, format: 'cbz', _tag: 'yauzl',
      _zipFile: zipFile, _entryMap: entryMap,
      entries, pageCount: entries.length,
      _pageCache: new LruByBytes<number, Buffer>({ maxBytes: PAGE_CACHE_MAX_BYTES, sizeOf: (b) => b.length }),
    };
    return handle;
  } catch (err) {
    throw new Error(`Failed to open archive: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Open a CBR (RAR) archive.
 * Prefers unrar (faster, RAR5-reliable); falls back to 7-Zip if unavailable.
 */
export async function openCbr(filePath: string): Promise<ArchiveHandle> {
  const unrar = findUnrarBin();
  if (unrar) {
    try {
      const entries = await listUnrarEntries(filePath, unrar);
      const handle: UnrarArchiveHandle = {
        filePath, format: 'cbr', _tag: 'unrar', _unrar: unrar,
        entries, pageCount: entries.length,
        _pageCache: new LruByBytes<number, Buffer>({ maxBytes: PAGE_CACHE_MAX_BYTES, sizeOf: (b) => b.length }),
      };
      return handle;
    } catch (err) {
      console.warn(
        `[CB8] unrar failed for "${path.basename(filePath)}", falling back to 7-Zip: `
        + (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  return openSevenZipArchive(filePath, 'cbr');
}

/**
 * Open a comic archive (CBZ or CBR) by file path.
 */
export async function open(filePath: string): Promise<ArchiveHandle> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'cbz') return openCbz(filePath);
  if (ext === 'cbr') return openCbr(filePath);
  throw new Error(`Unsupported file format: .${ext}`);
}

/**
 * Get raw image bytes for a page by index. JXL images are decoded to PNG.
 */
export async function getPage(handle: ArchiveHandle, pageIndex: number): Promise<Buffer> {
  let raw: Buffer;
  if (isYauzlHandle(handle)) {
    raw = await getYauzlPage(handle, pageIndex);
  } else if (isUnrarHandle(handle)) {
    raw = await getUnrarPage(handle, pageIndex);
  } else if (isSevenZipHandle(handle)) {
    raw = await getSevenZipPage(handle, pageIndex);
  } else {
    throw new Error(`Unknown archive backend for format: ${handle.format}`);
  }
  const ext = handle.entries[pageIndex].filename.split('.').pop() || '';
  return decodeImage(raw, ext);
}

/**
 * Get the cover image from an archive.
 */
export async function getCoverImage(handle: ArchiveHandle): Promise<Buffer> {
  const cover = selectCoverImage(
    handle.entries.map((e): ImageEntry => ({ filename: e.filename, index: e.index })),
  );
  if (!cover) throw new Error('No images found in archive');
  return getPage(handle, cover.index);
}

/**
 * Close an archive handle and release resources.
 */
export async function close(handle: ArchiveHandle): Promise<void> {
  if (isYauzlHandle(handle)) {
    handle._zipFile.close();
    handle._pageCache.clear();
  } else if (isUnrarHandle(handle) || isSevenZipHandle(handle)) {
    handle._pageCache.clear();
  }
}
