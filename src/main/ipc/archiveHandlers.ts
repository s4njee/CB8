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
      // Return the raw bytes; the renderer wraps them in a Blob URL. This
      // avoids the 33% base64 bloat on every page flip (pages can be several
      // MB) and the JSON-encoding cost on top of it.
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return { bytes, mime };
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
