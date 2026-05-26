/**
 * archiveCli — shell-out wrapper around `unar`/`lsar` (The Unarchiver).
 *
 * Used as a fallback when node-unrar-js's wasm extractor fails. The
 * common failure mode in bulk ingest is `ERAR_NO_MEMORY` after the wasm
 * heap fragments across hundreds of CBR opens; a fresh subprocess
 * invocation has no such state, so the CLI always works on archives
 * the wasm path has given up on.
 *
 * Why unar and not unrar/7zz: `unar` and its companion `lsar` ship in
 * Debian main, are free software, and handle every RAR variant
 * (RAR3, RAR5) plus ZIP and 7z natively. Debian's 7-Zip 22.01 needs a
 * non-free `7zip-rar` plugin for RAR support; upstream 7-Zip 24 has
 * RAR built in but means a tarball install in the Dockerfile. unar
 * keeps everything inside `apt-get install`.
 *
 * Runtime requirement: the `unar` Debian package is installed in the
 * production Docker image. If the binaries are missing, `detect()`
 * returns null and the wasm path stays authoritative.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CliBins {
  unar: string;
  lsar: string;
}

let cachedBins: CliBins | null | undefined;

/**
 * Probe for `unar` and `lsar` on PATH. Memoised — the result doesn't
 * change for the lifetime of the process. Returns null if either is
 * missing; callers should treat that as "no CLI fallback, stay on
 * wasm".
 */
export function detect(): CliBins | null {
  if (cachedBins !== undefined) return cachedBins;
  const unar = which('unar');
  const lsar = which('lsar');
  if (!unar || !lsar) {
    cachedBins = null;
    return null;
  }
  cachedBins = { unar, lsar };
  return cachedBins;
}

function which(bin: string): string | null {
  // `bin --help` exits 0 when present and prints to stdout. Treat any
  // non-spawn-error as "binary exists" — version banners differ.
  try {
    const r = spawnSync(bin, ['--help'], { stdio: 'ignore' });
    if (r.status !== null) return bin;
  } catch { /* not on PATH */ }
  return null;
}

export interface CliEntry {
  /** Path inside the archive, exactly as lsar prints it. */
  name: string;
  size: number;
  isDirectory: boolean;
}

/**
 * List archive contents via `lsar -j`. Output is a single JSON object
 * with `lsarContents: [{ XADFileName, XADFileSize, XADIsDirectory }]`.
 * Field names are stable across The Unarchiver releases.
 */
export async function listArchive(bins: CliBins, filePath: string): Promise<CliEntry[]> {
  const { stdout, status } = await runCapture(bins.lsar, ['-j', '--', filePath]);
  if (status !== 0) {
    throw new Error(`lsar exited ${status} for ${filePath}`);
  }
  let parsed: { lsarContents?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`lsar JSON parse failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const list = parsed.lsarContents ?? [];
  const out: CliEntry[] = [];
  for (const e of list) {
    const name = typeof e.XADFileName === 'string' ? e.XADFileName : null;
    if (!name) continue;
    out.push({
      name,
      size: typeof e.XADFileSize === 'number' ? e.XADFileSize : 0,
      // lsar reports XADIsDirectory as 1 or omitted. Normalise.
      isDirectory: Boolean(e.XADIsDirectory),
    });
  }
  return out;
}

/**
 * Extract a single archive entry to a Buffer. unar always extracts to
 * a directory, so we wrap it: mkdtemp → unar -o tempdir <archive>
 * <name> → read the file → wipe tempdir. Per-file fork+exec, but the
 * volume only matters for ingest, where the wasm path was failing
 * anyway and adding a few ms per file is fine.
 *
 * Returns null if unar succeeded but the named entry didn't appear on
 * disk (case-mismatch, missing entry). Throws on a non-zero exit.
 */
export async function extractToBuffer(
  bins: CliBins,
  filePath: string,
  entryName: string,
): Promise<Buffer | null> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-unar-'));
  try {
    const { status } = await runCapture(bins.unar, [
      '-o', tempDir,
      '-q',                 // quiet: no per-file progress lines
      '-D',                 // do not include archive name as a top-level dir
      '-f',                 // force overwrite without prompting
      '--',
      filePath,
      entryName,
    ]);
    if (status !== 0) {
      throw new Error(`unar exited ${status} extracting ${entryName} from ${filePath}`);
    }
    const onDisk = path.join(tempDir, entryName);
    try {
      return await fsp.readFile(onDisk);
    } catch {
      return null;
    }
  } finally {
    fsp.rm(tempDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
  }
}

/**
 * Extract a single entry into an existing directory. Returns the
 * absolute path of the extracted file. Used by archiveLoader's
 * CLI-mode page-extraction path, which mirrors the wasm file-mode
 * pattern: extract on demand, read, unlink.
 */
export async function extractToDir(
  bins: CliBins,
  filePath: string,
  entryName: string,
  outDir: string,
): Promise<string> {
  await fsp.mkdir(outDir, { recursive: true });
  const { status } = await runCapture(bins.unar, [
    '-o', outDir,
    '-q', '-D', '-f',
    '--',
    filePath,
    entryName,
  ]);
  if (status !== 0) {
    throw new Error(`unar exited ${status} extracting ${entryName} from ${filePath}`);
  }
  return path.join(outDir, entryName);
}

function runCapture(bin: string, args: string[]): Promise<{ stdout: string; status: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout: Buffer.concat(chunks).toString('utf8'), status: code ?? -1 });
    });
  });
}
