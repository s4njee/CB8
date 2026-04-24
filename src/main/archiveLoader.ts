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
  }
  // CBR handles don't hold persistent resources
}


// --- CBR (RAR) support ---

import * as fsp from 'node:fs/promises';
import { createExtractorFromData, type Extractor } from 'node-unrar-js';

interface CbrHandle extends ArchiveHandle {
  format: 'cbr';
  /**
   * Extractor kept for the life of the handle so pages can be extracted
   * lazily on demand without re-reading the archive from disk. We store
   * filenames in sorted order; page N maps to the entry at entries[N].
   */
  _extractor: Extractor<Uint8Array>;
}

function isCbrHandle(handle: ArchiveHandle): handle is CbrHandle {
  return handle.format === 'cbr';
}

/**
 * Open a CBR (RAR) archive. Reads the file asynchronously, enumerates image
 * entries, and keeps the extractor around so pages can be decoded on demand
 * rather than holding every decompressed page in memory up front.
 */
export async function openCbr(filePath: string): Promise<ArchiveHandle> {
  let fileData: Buffer;
  try {
    fileData = await fsp.readFile(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open archive: ${msg}`);
  }

  let extractor: Extractor<Uint8Array>;
  try {
    const archiveData = fileData.buffer.slice(
      fileData.byteOffset,
      fileData.byteOffset + fileData.byteLength
    ) as ArrayBuffer;
    extractor = await createExtractorFromData({ data: archiveData });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open archive: ${msg}`);
  }

  const fileList = extractor.getFileList();
  const imageNames: string[] = [];
  for (const header of fileList.fileHeaders) {
    if (!header.flags.directory && isImageFile(header.name)) {
      imageNames.push(header.name);
    }
  }
  imageNames.sort((a, b) => naturalCompare(a, b));

  const entries: ArchiveEntry[] = imageNames.map((filename, index) => ({ filename, index }));

  const handle: CbrHandle = {
    filePath,
    format: 'cbr',
    entries,
    pageCount: entries.length,
    _extractor: extractor,
  };

  return handle;
}

function getCbrPage(handle: CbrHandle, pageIndex: number): Promise<Buffer> {
  if (pageIndex < 0 || pageIndex >= handle.pageCount) {
    return Promise.reject(new Error(`Page index ${pageIndex} out of range (0-${handle.pageCount - 1})`));
  }
  const targetName = handle.entries[pageIndex].filename;
  try {
    const extracted = handle._extractor.extract({ files: [targetName] });
    for (const file of extracted.files) {
      if (file.fileHeader.name === targetName && file.extraction) {
        return Promise.resolve(Buffer.from(file.extraction));
      }
    }
    return Promise.reject(new Error(`Failed to read page ${pageIndex}: entry not found`));
  } catch (err) {
    return Promise.reject(new Error(`Failed to read page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`));
  }
}
