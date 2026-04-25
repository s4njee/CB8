/**
 * RuntimeConfig — per-request capabilities the Fastify app needs.
 *
 * - `dataDir`         — where the sqlite DB, web-uploads, and image-cache live.
 *                       Reads `CB8_DATA_DIR` (default `/data`).
 * - `staticRoot`      — directory containing the SPA's index.html.
 * - `hostFilePicker`  — optional native open-file/open-directory dialog. Not
 *                       wired in this build; the /api/admin/pick-path endpoint
 *                       returns 501 unless a future host injects one.
 */
export interface RuntimeConfig {
  dataDir: string;
  staticRoot: string;
  hostFilePicker?: HostFilePicker;
}

export type Thumbnailer = (source: Buffer | null | undefined) => Buffer | Promise<Buffer>;

export type HostFilePicker = (kind: 'file' | 'directory') => Promise<string | null>;

export interface ServerOptions {
  port: number;
  host: string;
}

export function loadServerOptionsFromEnv(): ServerOptions {
  const rawPort = process.env.CB8_PORT;
  const port = rawPort ? parseInt(rawPort, 10) : 8008;
  const host = process.env.CB8_HOST ?? '0.0.0.0';
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid CB8_PORT: ${rawPort}`);
  }
  return { port, host };
}

export function loadDataDirFromEnv(): string {
  return process.env.CB8_DATA_DIR ?? '/data';
}
