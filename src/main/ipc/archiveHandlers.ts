import { ipcMain } from 'electron';
import * as fsp from 'node:fs/promises';
import * as ArchiveLoader from '../archiveLoader';
import type { ArchiveHandle } from '../archiveLoader';

let currentHandle: ArchiveHandle | null = null;

export function registerArchiveHandlers(): void {
  ipcMain.handle('archive:open', async (_e, filePath: string) => {
    try {
      if (currentHandle) await ArchiveLoader.close(currentHandle);
      currentHandle = await ArchiveLoader.open(filePath);
      return { pageCount: currentHandle.pageCount, filename: currentHandle.filePath };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('archive:page', async (_e, pageIndex: number) => {
    if (!currentHandle) return { error: 'No archive open' };
    try {
      const buf = await ArchiveLoader.getPage(currentHandle, pageIndex);
      const ext = currentHandle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
        avif: 'image/avif', jxl: 'image/png', // JXL decoded to PNG
      };
      const mime = mimeMap[ext] ?? 'image/png';
      // Return a standalone ArrayBuffer (sliced out of the Node Buffer's
      // pooled backing store). The renderer wraps it in a Blob URL. This
      // avoids the 33% base64 bloat on every page flip. ArrayBuffer is used
      // rather than Uint8Array because contextBridge proxies TypedArrays
      // across worlds in a way that the Blob constructor doesn't accept.
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { buffer: ab, mime };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('archive:close', async () => {
    if (currentHandle) {
      await ArchiveLoader.close(currentHandle);
      currentHandle = null;
    }
  });

  ipcMain.handle('book:read-file', async (_e, filePath: string) => {
    const bytes = await fsp.readFile(filePath);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });
}
