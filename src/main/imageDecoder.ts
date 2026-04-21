/**
 * ImageDecoder — stub with JXL support disabled.
 * All formats pass through unchanged; JXL files will display as broken images.
 */

export function needsDecoding(_extension: string): boolean {
  return false;
}

export async function decode(buffer: Buffer, _extension: string): Promise<Buffer> {
  return buffer;
}
