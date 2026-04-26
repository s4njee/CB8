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
 * Open a comic archive (CBZ or CBR) by file path.
 */
export async function open(filePath: string): Promise<ArchiveHandle> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'cbz') {
    return openCbz(filePath);
  }
  if (ext === 'cbr') {
    return openCbr(filePath);
  }
  throw new Error(`Unsupported file format: .${ext}`);
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
    // File-mode also created a temp dir for on-disk extraction; clean it
    // up. Best-effort: a stray dir under /tmp is harmless if removal fails.
    if (handle._mode === 'file') {
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

/**
 * Per-archive in-memory cap for cached decompressed pages. RAR pages
 * decompress on every extract() call — solid archives in particular have
 * to re-walk the dictionary — so a small LRU pays off heavily for back-
 * navigation and adjacent prefetch. Keep the cap modest so a few open
 * archives don't dominate memory.
 */
const CBR_PAGE_CACHE_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB

/**
 * Above this size we open the archive in file-mode (extractor reads from
 * disk on demand) instead of slurping the whole file into a Buffer.
 *
 * Two reasons:
 *   - Node's `fsp.readFile` errors with `ERR_FS_FILE_TOO_LARGE` at ≥ 2 GiB.
 *   - V8 caps `ArrayBuffer` length at ~4 GiB, so even chunked reads
 *     wouldn't fit a 5 GiB archive into one buffer.
 *
 * File-mode trades RAM for a temp directory + per-page disk round-trip
 * (the extractor writes each requested file into the temp dir, we read
 * it back as bytes, then unlink). The 64 MiB LRU page cache absorbs
 * sequential and back-navigation reads.
 */
const HUGE_ARCHIVE_THRESHOLD = 2_000_000_000;

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

type CbrHandle = CbrDataHandle | CbrFileHandle;

function isCbrHandle(handle: ArchiveHandle): handle is CbrHandle {
  return handle.format === 'cbr';
}

/**
 * Open a CBR (RAR) archive. Picks data-mode (whole archive in RAM, fast
 * lazy extract) for normal-sized archives and file-mode (extractor reads
 * from disk) for >2 GiB archives that wouldn't fit in a single buffer.
 */
export async function openCbr(filePath: string): Promise<ArchiveHandle> {
  let size = Infinity;
  try {
    size = (await fsp.stat(filePath)).size;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open archive: ${msg}`);
  }

  let handle: CbrHandle;
  try {
    handle = size > HUGE_ARCHIVE_THRESHOLD
      ? await openCbrFileMode(filePath)
      : await openCbrDataMode(filePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open archive: ${msg}`);
  }

  const fileList = handle._extractor.getFileList();
  const imageNames: string[] = [];
  for (const header of fileList.fileHeaders) {
    if (!header.flags.directory && isImageFile(header.name)) {
      imageNames.push(header.name);
    }
  }
  imageNames.sort((a, b) => naturalCompare(a, b));
  const entries: ArchiveEntry[] = imageNames.map((filename, index) => ({ filename, index }));

  // Mutate the in-progress handle with metadata. (Type-stable: entries +
  // pageCount are the only fields we set late.)
  (handle as { entries: ArchiveEntry[] }).entries = entries;
  (handle as { pageCount: number }).pageCount = entries.length;
  return handle;
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

    // File-mode: extract() writes the requested entry under tempDir, then
    // we read the bytes back off disk and unlink so tempDir stays small.
    const extracted = handle._extractor.extract({ files: [targetName] });
    // Consume the iterator — that's what actually triggers the extraction.
    for (const _file of extracted.files) { void _file; }
    const onDisk = path.join(handle._tempDir, targetName);
    const buf = await fsp.readFile(onDisk);
    fsp.unlink(onDisk).catch(() => { /* best effort */ });
    return cachePage(handle, pageIndex, buf);
  } catch (err) {
    throw new Error(`Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
