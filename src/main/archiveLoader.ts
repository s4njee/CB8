/**
 * ArchiveLoader — opens CBZ (ZIP) and CBR (RAR) comic archives,
 * lists image entries in natural sort order, and extracts page data.
 */

import * as yauzl from 'yauzl';
import { isImageFile } from '../shared/imageFilter';
import { naturalCompare } from '../shared/naturalSort';
import { selectCoverImage, ImageEntry } from '../shared/coverSelection';
import { decode as decodeImage, needsDecoding } from './imageDecoder';

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

// Internal handle that also holds the yauzl ZipFile reference
interface CbzHandle extends ArchiveHandle {
  format: 'cbz';
  _zipFile: yauzl.ZipFile;
  _yauzlEntries: yauzl.Entry[];
}

function isCbzHandle(handle: ArchiveHandle): handle is CbzHandle {
  return handle.format === 'cbz';
}

/**
 * Open a CBZ (ZIP) archive. Returns a handle with sorted image entries.
 */
export async function openCbz(filePath: string): Promise<ArchiveHandle> {
  return new Promise<ArchiveHandle>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipFile) => {
      if (err) {
        return reject(new Error(`Failed to open archive: ${err.message}`));
      }
      if (!zipFile) {
        return reject(new Error(`Failed to open archive: ${filePath}`));
      }

      const imageEntries: { filename: string; yauzlEntry: yauzl.Entry }[] = [];

      zipFile.on('entry', (entry: yauzl.Entry) => {
        if (isImageFile(entry.fileName)) {
          imageEntries.push({ filename: entry.fileName, yauzlEntry: entry });
        }
        zipFile.readEntry();
      });

      zipFile.on('end', () => {
        // Sort by filename using natural sort
        imageEntries.sort((a, b) => naturalCompare(a.filename, b.filename));

        const entries: ArchiveEntry[] = imageEntries.map((e, i) => ({
          filename: e.filename,
          index: i,
        }));

        const handle: CbzHandle = {
          filePath,
          format: 'cbz',
          entries,
          pageCount: entries.length,
          _zipFile: zipFile,
          _yauzlEntries: imageEntries.map((e) => e.yauzlEntry),
        };

        resolve(handle);
      });

      zipFile.on('error', (e: Error) => {
        reject(new Error(`Failed to open archive: ${e.message}`));
      });

      zipFile.readEntry();
    });
  });
}


/**
 * Extract raw image bytes for a page by index from a CBZ handle.
 */
function getCbzPage(handle: CbzHandle, pageIndex: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    if (pageIndex < 0 || pageIndex >= handle.pageCount) {
      return reject(new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`));
    }

    const yauzlEntry = handle._yauzlEntries[pageIndex];
    handle._zipFile.openReadStream(yauzlEntry, (err, stream) => {
      if (err) {
        return reject(new Error(`Failed to read page ${pageIndex}: ${err.message}`));
      }
      if (!stream) {
        return reject(new Error(`Failed to read page ${pageIndex}: no stream`));
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (e: Error) =>
        reject(new Error(`Failed to read page ${pageIndex}: ${e.message}`))
      );
    });
  });
}

/**
 * Sniff a comic archive's real format from its leading bytes. Comic files
 * are routinely mis-extensioned — a `.cbr` that is actually a ZIP, a `.cbz`
 * that is actually a RAR — so `open()` trusts the signature over the name.
 * Returns null when the file is too short or carries an unrecognised magic;
 * callers then fall back to the extension.
 */
export async function sniffFormat(filePath: string): Promise<'cbz' | 'cbr' | 'cb7' | null> {
  let fh: fsp.FileHandle | undefined;
  try {
    fh = await fsp.open(filePath, 'r');
    const buf = Buffer.alloc(8);
    const { bytesRead } = await fh.read(buf, 0, 8, 0);
    // ZIP: "PK" + \x03\x04 (also \x05\x06 empty, \x07\x08 spanned).
    if (bytesRead >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return 'cbz';
    // RAR: "Rar!" + \x1A\x07, then \x00 (RAR4) or \x01\x00 (RAR5).
    if (
      bytesRead >= 7 &&
      buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21 &&
      buf[4] === 0x1a && buf[5] === 0x07
    ) {
      return 'cbr';
    }
    // 7-Zip: "7z" + BC AF 27 1C signature.
    if (
      bytesRead >= 6 &&
      buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf &&
      buf[4] === 0x27 && buf[5] === 0x1c
    ) {
      return 'cb7';
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => { /* ignore */ });
  }
}

/**
 * Open a comic archive (CBZ, CBR, CB7, or CBT) by file path. Dispatches on
 * the file's actual signature; the extension is only a fallback for files too
 * short or too unusual to sniff. CB7 and CBT (7-zip / tar) are opened
 * exclusively via the unar CLI — node-unrar-js has no 7z/tar support.
 */
export async function open(filePath: string): Promise<ArchiveHandle> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext !== 'cbz' && ext !== 'cbr' && ext !== 'cb7' && ext !== 'cbt') {
    throw new Error(`Unsupported file format: .${ext}`);
  }
  const sniffed = await sniffFormat(filePath);
  // CB7 / CBT: 7-zip or tar — unar handles both; node-unrar-js cannot.
  if (sniffed === 'cb7' || (sniffed === null && (ext === 'cb7' || ext === 'cbt'))) {
    const cliBins = ArchiveCli.detect();
    if (!cliBins) {
      throw new Error(
        `Cannot open .${ext} archive: unar/lsar not found on PATH. ` +
        `Install the 'unar' package (Debian: apt-get install unar).`
      );
    }
    return openCbrCliMode(filePath, cliBins);
  }
  const format = sniffed ?? (ext === 'cbz' ? 'cbz' : 'cbr');
  return format === 'cbz' ? openCbz(filePath) : openCbr(filePath);
}

/**
 * Get raw image bytes for a page by index.
 * JXL images are transparently decoded to PNG.
 */
export async function getPage(handle: ArchiveHandle, pageIndex: number): Promise<Buffer> {
  let raw: Buffer;
  if (isCbzHandle(handle)) {
    raw = await getCbzPage(handle, pageIndex);
  } else if (isCbrHandle(handle)) {
    raw = await getCbrPage(handle, pageIndex);
  } else {
    throw new Error(`Unknown archive format: ${handle.format}`);
  }

  const ext = handle.entries[pageIndex].filename.split('.').pop() || '';
  return decodeImage(raw, ext);
}

/**
 * Get the cover image from an archive using cover selection logic.
 */
export async function getCoverImage(handle: ArchiveHandle): Promise<Buffer> {
  const imageEntries: ImageEntry[] = handle.entries.map((e) => ({
    filename: e.filename,
    index: e.index,
  }));
  const cover = selectCoverImage(imageEntries);
  if (!cover) {
    throw new Error('No images found in archive');
  }
  return getPage(handle, cover.index);
}

/**
 * Close an archive handle and release resources.
 */
export async function close(handle: ArchiveHandle): Promise<void> {
  if (isCbzHandle(handle)) {
    handle._zipFile.close();
  } else if (isCbrHandle(handle)) {
    // Drop cached pages so they can't outlive the handle.
    handle._pageCache.clear();
    // File-mode and CLI-mode both have a tempdir to wipe. Best-effort:
    // a stray dir under /tmp is harmless if removal fails.
    if (handle._mode === 'file' || handle._mode === 'cli') {
      await fsp.rm(handle._tempDir, { recursive: true, force: true }).catch(() => { /* ignore */ });
    }
  }
}


// --- CBR (RAR) support ---

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createExtractorFromData, createExtractorFromFile, type Extractor } from 'node-unrar-js';
import { LruByBytes } from '../shared/lru';
import * as ArchiveCli from './archiveCli';

/**
 * Per-archive in-memory cap for cached decompressed pages. RAR pages
 * decompress on every extract() call — solid archives in particular have
 * to re-walk the dictionary — so a small LRU pays off heavily for back-
 * navigation and adjacent prefetch. Keep the cap modest so a few open
 * archives don't dominate memory.
 */
const CBR_PAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB

/**
 * Below this size we may open the archive in data-mode (whole archive in
 * RAM, fast lazy extract) instead of file-mode (extractor reads from disk
 * on demand).
 *
 * Why 0 by default: node-unrar-js reuses one wasm Module across
 * every `createExtractorFromData` call, and its linear-memory heap
 * grows but never shrinks. A bulk ingest of a few hundred CBR files
 * fragments the heap until it rejects allocations even for small
 * archives (`ERAR_NO_MEMORY`). File-mode goes through emscripten's
 * filesystem layer instead of copying the whole archive into the shared
 * heap, which sidesteps the worst leak. Set CB8_CBR_DATA_MODE_MAX_BYTES
 * to opt back into data-mode for small archives on systems where reader
 * speed matters more than bulk-ingest stability.
 *
 * The original hard limits still apply at the upper end:
 *   - Node's `fsp.readFile` errors with `ERR_FS_FILE_TOO_LARGE` at ≥ 2 GiB.
 *   - V8 caps `ArrayBuffer` length at ~4 GiB.
 */
const CBR_DATA_MODE_MAX_BYTES = (() => {
  const fromEnv = parseInt(process.env.CB8_CBR_DATA_MODE_MAX_BYTES ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;
})();

/**
 * Wasm circuit breaker. `openCbr` counts every archive the wasm path
 * rejected but the unar CLI then read successfully; after this many in a
 * row we retire wasm and route all CBR opens straight to the CLI for the
 * rest of the process. The wasm heap can't be reset short of a process
 * restart, so once it has started misjudging archives we don't expect
 * recovery.
 *
 * One clean wasm success resets the counter — archives sometimes still
 * squeeze through after a transient failure.
 */
const WASM_FAILURE_THRESHOLD = 3;
let wasmConsecutiveFailures = 0;
let wasmDisabled = false;

function noteWasmFailure(filePath: string): void {
  wasmConsecutiveFailures++;
  if (!wasmDisabled && wasmConsecutiveFailures >= WASM_FAILURE_THRESHOLD) {
    wasmDisabled = true;
    console.warn(
      `[CB8 archiveLoader] node-unrar-js wasm path failed ${wasmConsecutiveFailures}x ` +
      `(latest: ${filePath}); switching CBR opens to unar CLI for the rest of this process.`
    );
  }
}

function noteWasmSuccess(): void {
  if (wasmConsecutiveFailures > 0) wasmConsecutiveFailures = 0;
}

interface CbrHandleBase extends ArchiveHandle {
  format: 'cbr';
  /** LRU page cache, byte-budgeted. */
  _pageCache: LruByBytes<number, Buffer>;
}

interface CbrDataHandle extends CbrHandleBase {
  _mode: 'data';
  _extractor: Extractor<Uint8Array>;
}

interface CbrFileHandle extends CbrHandleBase {
  _mode: 'file';
  _extractor: Extractor;
  _tempDir: string;
}

interface CbrCliHandle extends CbrHandleBase {
  _mode: 'cli';
  _bins: ArchiveCli.CliBins;
  _tempDir: string;
}

type CbrHandle = CbrDataHandle | CbrFileHandle | CbrCliHandle;

function isCbrHandle(handle: ArchiveHandle): handle is CbrHandle {
  return handle.format === 'cbr';
}

/**
 * Open a CBR (RAR) archive. Picks data-mode (whole archive in RAM, fast
 * lazy extract) for normal-sized archives and file-mode (extractor reads
 * from disk) for >2 GiB archives that wouldn't fit in a single buffer.
 *
 * The wasm extractor is fast but unreliable in bulk: node-unrar-js shares
 * one linear-memory heap across every open, and once a long ingest run
 * fragments it the extractor starts rejecting perfectly valid archives.
 * That surfaces not only as `ERAR_NO_MEMORY` but also as `ERAR_BAD_ARCHIVE`
 * ("File is not RAR archive") on files `lsar` reads without complaint. So
 * on ANY wasm failure we retry once through the unar CLI — a fresh
 * subprocess with no shared heap. The archive is only reported unreadable
 * when the CLI fails too.
 */
export async function openCbr(filePath: string): Promise<ArchiveHandle> {
  let size = Infinity;
  try {
    size = (await fsp.stat(filePath)).size;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open archive: ${msg}`);
  }

  const cliBins = ArchiveCli.detect();

  // Wasm has already proven unreliable this process — skip straight to CLI.
  if (wasmDisabled && cliBins) {
    return openCbrCliMode(filePath, cliBins);
  }

  try {
    const handle = await openCbrWasm(filePath, size);
    noteWasmSuccess();
    return handle;
  } catch (wasmErr) {
    if (cliBins) {
      try {
        const handle = await openCbrCliMode(filePath, cliBins);
        // The CLI read an archive the wasm path rejected: wasm misjudged a
        // readable file. Count it so the circuit breaker can retire wasm
        // for the rest of this process once the pattern repeats.
        noteWasmFailure(filePath);
        return handle;
      } catch {
        // Both paths failed — the archive really is unreadable. Fall
        // through and surface the wasm error; it is usually more specific.
      }
    }
    const msg = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);
    throw new Error(`Failed to open archive: ${msg}`);
  }
}

/**
 * The node-unrar-js (wasm) half of `openCbr`: open the extractor, list
 * entries, and build the sorted image index. `getFileList()` is where the
 * archive is actually parsed — and therefore where a degraded heap throws —
 * so it stays inside this function, under `openCbr`'s single try/catch.
 */
async function openCbrWasm(filePath: string, size: number): Promise<CbrDataHandle | CbrFileHandle> {
  const handle = size > 0 && size <= CBR_DATA_MODE_MAX_BYTES
    ? await openCbrDataMode(filePath)
    : await openCbrFileMode(filePath);

  try {
    const fileList = handle._extractor.getFileList();
    const imageNames: string[] = [];
    for (const header of fileList.fileHeaders) {
      if (!header.flags.directory && isImageFile(header.name)) {
        imageNames.push(header.name);
      }
    }
    imageNames.sort((a, b) => naturalCompare(a, b));
    const entries: ArchiveEntry[] = imageNames.map((filename, index) => ({ filename, index }));

    // Type-stable late init: entries + pageCount are the only fields the
    // mode-specific openers leave empty.
    (handle as { entries: ArchiveEntry[] }).entries = entries;
    (handle as { pageCount: number }).pageCount = entries.length;
    return handle;
  } catch (err) {
    // getFileList() is where wasm typically throws on a fragmented heap.
    // The handle was just created but never returned, so close() will not
    // run — clean up file-mode's tempDir here before rethrowing.
    if (handle._mode === 'file') {
      await fsp.rm(handle._tempDir, { recursive: true, force: true }).catch(() => { /* ignore */ });
    }
    throw err;
  }
}

async function openCbrDataMode(filePath: string): Promise<CbrDataHandle> {
  const fileData = await fsp.readFile(filePath);
  const archiveData = fileData.buffer.slice(
    fileData.byteOffset,
    fileData.byteOffset + fileData.byteLength,
  ) as ArrayBuffer;
  const extractor = await createExtractorFromData({ data: archiveData });
  return {
    filePath,
    format: 'cbr',
    entries: [],
    pageCount: 0,
    _mode: 'data',
    _extractor: extractor,
    _pageCache: new LruByBytes<number, Buffer>({
      maxBytes: CBR_PAGE_CACHE_MAX_BYTES,
      sizeOf: (b) => b.length,
    }),
  };
}

async function openCbrFileMode(filePath: string): Promise<CbrFileHandle> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-cbr-'));
  const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: tempDir });
  return {
    filePath,
    format: 'cbr',
    entries: [],
    pageCount: 0,
    _mode: 'file',
    _extractor: extractor,
    _tempDir: tempDir,
    _pageCache: new LruByBytes<number, Buffer>({
      maxBytes: CBR_PAGE_CACHE_MAX_BYTES,
      sizeOf: (b) => b.length,
    }),
  };
}

/**
 * CBR open via the unar CLI. We list entries with `lsar -j`, build
 * the same `ArchiveEntry[]` shape the wasm path produces, and stash a
 * tempDir for on-demand page extraction. No wasm involvement at all,
 * so heap fragmentation and `ERAR_NO_MEMORY` can't bite us.
 */
async function openCbrCliMode(filePath: string, bins: ArchiveCli.CliBins): Promise<CbrCliHandle> {
  const all = await ArchiveCli.listArchive(bins, filePath);
  const imageNames = all
    .filter((e) => !e.isDirectory && isImageFile(e.name))
    .map((e) => e.name);
  imageNames.sort((a, b) => naturalCompare(a, b));
  const entries: ArchiveEntry[] = imageNames.map((filename, index) => ({ filename, index }));
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-cbr-cli-'));
  return {
    filePath,
    format: 'cbr',
    entries,
    pageCount: entries.length,
    _mode: 'cli',
    _bins: bins,
    _tempDir: tempDir,
    _pageCache: new LruByBytes<number, Buffer>({
      maxBytes: CBR_PAGE_CACHE_MAX_BYTES,
      sizeOf: (b) => b.length,
    }),
  };
}

function cachePage(handle: CbrHandle, pageIndex: number, buf: Buffer): Buffer {
  // LruByBytes handles MRU bumping + byte-budgeted eviction internally.
  handle._pageCache.set(pageIndex, buf);
  return buf;
}

async function getCbrPage(handle: CbrHandle, pageIndex: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= handle.pageCount) {
    throw new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`);
  }

  // Cache hit — `get` already bumps to MRU.
  const cached = handle._pageCache.get(pageIndex);
  if (cached) return cached;

  const targetName = handle.entries[pageIndex].filename;

  try {
    if (handle._mode === 'data') {
      const extracted = handle._extractor.extract({ files: [targetName] });
      for (const file of extracted.files) {
        if (file.fileHeader.name === targetName && file.extraction) {
          return cachePage(handle, pageIndex, Buffer.from(file.extraction));
        }
      }
      throw new Error('entry not found');
    }

    if (handle._mode === 'file') {
      // File-mode: extract() writes the requested entry under tempDir, then
      // we read the bytes back off disk and unlink so tempDir stays small.
      const extracted = handle._extractor.extract({ files: [targetName] });
      // Consume the iterator — that's what actually triggers the extraction.
      for (const _file of extracted.files) { void _file; }
      const onDisk = path.join(handle._tempDir, targetName);
      const buf = await fsp.readFile(onDisk);
      fsp.unlink(onDisk).catch(() => { /* best effort */ });
      return cachePage(handle, pageIndex, buf);
    }

    // CLI mode: shell out to unar to extract the single entry.
    const buf = await ArchiveCli.extractToBuffer(handle._bins, handle.filePath, targetName);
    if (!buf) throw new Error('entry not found');
    return cachePage(handle, pageIndex, buf);
  } catch (err) {
    throw new Error(`Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
