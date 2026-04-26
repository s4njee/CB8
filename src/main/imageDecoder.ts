/**
 * imageDecoder.ts — decode formats browsers can't render natively
 * (currently just JPEG XL) to a browser-safe encoding.
 *
 * JXL is decoded via @jsquash/jxl's WASM module to raw RGBA, then
 * re-encoded as PNG via Sharp. The wasm module is loaded lazily on the
 * first .jxl page; subsequent decodes reuse the same instance.
 *
 * Everything else passes through unchanged.
 */

let jxlModulePromise: Promise<unknown> | null = null;

/**
 * Lazy-load the @jsquash/jxl module. The package's `init()` (called
 * implicitly on first decode) caches the WebAssembly compilation, so we
 * just need to make sure the JS module itself is imported once.
 */
async function loadJxl(): Promise<(buffer: ArrayBuffer) => Promise<ImageData>> {
  if (!jxlModulePromise) {
    jxlModulePromise = import('@jsquash/jxl/decode')
      .then((m) => m.default ?? m)
      .catch((err) => {
        // Reset on failure so a later attempt can try again — useful if
        // the wasm load was transient (e.g., disk I/O hiccup on first run).
        jxlModulePromise = null;
        throw err;
      });
  }
  return jxlModulePromise as Promise<(buffer: ArrayBuffer) => Promise<ImageData>>;
}

let sharpModule: typeof import('sharp') | null = null;
function getSharp(): typeof import('sharp') {
  if (!sharpModule) sharpModule = require('sharp');
  return sharpModule!;
}

function normalizeExt(ext: string): string {
  return ext.toLowerCase().replace(/^\./, '');
}

export function needsDecoding(extension: string): boolean {
  return normalizeExt(extension) === 'jxl';
}

export async function decode(buffer: Buffer, extension: string): Promise<Buffer> {
  if (!needsDecoding(extension)) return buffer;

  const decodeJxl = await loadJxl();
  // jsquash's decoder takes an ArrayBuffer; slice gives us a fresh one
  // covering only this Buffer's bytes (Node Buffers often share a pooled
  // backing store).
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const image = await decodeJxl(ab as ArrayBuffer);

  // Re-encode RGBA → PNG so the renderer / browser can display it.
  return await getSharp()(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  }).png().toBuffer();
}
