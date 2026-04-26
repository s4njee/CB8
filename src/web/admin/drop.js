/**
 * admin/drop.js — File-type allow-list + DataTransfer traversal.
 *
 * Walks a dropped DataTransfer, returning a flat list of accepted files
 * with relative paths (preserving folder structure for webkitGetAsEntry).
 */

export const ACCEPTED_EXTS = ['cbz', 'cbr', 'epub', 'pdf', 'mobi'];
export const ACCEPT_ATTR = ACCEPTED_EXTS.map((e) => `.${e}`).join(',');

export function isAccepted(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((e) => name.endsWith(`.${e}`));
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function gatherFromDataTransferItem(item, pathPrefix, out) {
  if (item.isFile) {
    await new Promise((resolve) => {
      item.file((file) => {
        if (isAccepted(file)) {
          out.push({ file, relPath: pathPrefix + file.name });
        }
        resolve();
      }, () => resolve());
    });
  } else if (item.isDirectory) {
    const reader = item.createReader();
    const readAll = () => new Promise((resolve) => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) return resolve();
        for (const entry of entries) {
          await gatherFromDataTransferItem(entry, pathPrefix + item.name + '/', out);
        }
        resolve(readAll());
      }, () => resolve());
    });
    await readAll();
  }
}

export async function gatherFromDrop(dt) {
  const out = [];
  if (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function') {
    const entries = [];
    for (const item of dt.items) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      await gatherFromDataTransferItem(entry, '', out);
    }
  } else {
    for (const file of dt.files) {
      if (isAccepted(file)) out.push({ file, relPath: file.name });
    }
  }
  return out;
}
