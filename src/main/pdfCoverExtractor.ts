import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const COVER_WIDTH = 240;
const COVER_HEIGHT = 360;
const JPEG_QUALITY = 82;
const require = createRequire(import.meta.url);

interface CanvasSurface {
  width: number;
  height: number;
  getContext(type: '2d'): {
    fillStyle: string;
    fillRect(x: number, y: number, width: number, height: number): void;
  };
  toBuffer(mime: 'image/jpeg', quality?: number): Buffer;
}

interface CanvasModule {
  createCanvas(width: number, height: number): CanvasSurface;
}

declare global {
  interface Uint8Array {
    toHex?: () => string;
  }
}

function ensureUint8ArrayToHex(): void {
  if (typeof Uint8Array.prototype.toHex === 'function') return;
  Uint8Array.prototype.toHex = function toHex() {
    let hex = '';
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, '0');
    }
    return hex;
  };
}

function loadCanvasModule(): CanvasModule {
  return require('@napi-rs/canvas') as CanvasModule;
}

export async function renderPdfFirstPageCover(filePath: string): Promise<Buffer | null> {
  ensureUint8ArrayToHex();

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = loadCanvasModule();
  const bytes = await fs.readFile(filePath);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    if (pdf.numPages <= 0) return null;

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(COVER_WIDTH / baseViewport.width, COVER_HEIGHT / baseViewport.height, 1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
    const context = canvas.getContext('2d');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    return canvas.toBuffer('image/jpeg', JPEG_QUALITY);
  } finally {
    await pdf.destroy();
  }
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  ensureUint8ArrayToHex();

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = await fs.readFile(filePath);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
}
