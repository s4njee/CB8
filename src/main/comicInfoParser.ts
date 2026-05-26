/**
 * comicInfoParser.ts — read and parse `ComicInfo.xml` from a CBZ or CBR
 * archive root. Implements R-16 from `docs/hierarchy/requirements.md`.
 *
 * Public surface:
 *   - `readFromArchive(filePath)`: open the archive, locate ComicInfo.xml
 *     case-insensitively at the archive root, return a typed ComicInfo.
 *     Returns null on parse error, missing file, or unsupported format.
 *   - `parseComicInfoXml(xml)`: pure-function variant that takes the XML
 *     bytes/string directly. Used by tests and any caller that already
 *     has the bytes.
 *   - `mapAgeRating(raw)`: fold free-form ComicInfo `<AgeRating>` values
 *     into the schema enum.
 *
 * Lenient by design: we accept mixed-case element names, missing
 * namespace/root-attributes, and permissive number parsing. Anything
 * that fails to parse logs at warn level and returns null so ingest
 * can fall back to filename heuristics.
 */
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yauzl from 'yauzl';
import { createExtractorFromFile } from 'node-unrar-js';
import { XMLParser } from 'fast-xml-parser';
import * as ArchiveCli from './archiveCli';
import { sniffFormat } from './archiveLoader';

export type AgeRating = 'unknown' | 'g' | 'pg' | 'teen' | 'mature' | 'adults_only';

export interface ComicInfoPage {
  /** 0-based page index in archive order. */
  image: number;
  /** ComicRack page type, free-form (FrontCover, Story, Letters, ...). */
  type?: string;
  imageSize?: number;
  imageHeight?: number;
  imageWidth?: number;
}

export interface ComicInfo {
  series: string | null;
  /** Volume identifier, integer when parseable. */
  volume: number | null;
  /** Chapter / issue number. May be a decimal (1.5). */
  number: number | null;
  title: string | null;
  summary: string | null;
  publisher: string | null;
  /** ISO 639-1 language code, lower-case. */
  language: string | null;
  year: number | null;
  /** 1..12 */
  month: number | null;
  pageCount: number | null;
  ageRating: AgeRating;
  pages: ComicInfoPage[];
  /** Raw parsed object, for fields we don't promote yet. */
  raw: Record<string, unknown>;
}

const CBZ_EXTS = new Set(['.cbz', '.zip']);
const CBR_EXTS = new Set(['.cbr', '.rar']);
const CB7_EXTS = new Set(['.cb7', '.cbt']);
// node-unrar-js shares one wasm heap for the process. During large imports,
// repeatedly slurping CBRs into that heap just to look for ComicInfo.xml can
// fragment memory badly. Prefer the external CLI when available, and keep a
// circuit breaker for systems that have to use wasm.
const WASM_FAILURE_THRESHOLD = 3;
let cbrComicInfoWasmFailures = 0;
let cbrComicInfoWasmDisabled = false;

function noteCbrComicInfoWasmFailure(filePath: string): void {
  cbrComicInfoWasmFailures++;
  if (!cbrComicInfoWasmDisabled && cbrComicInfoWasmFailures >= WASM_FAILURE_THRESHOLD) {
    cbrComicInfoWasmDisabled = true;
    console.warn(
      `[CB8 ComicInfo] node-unrar-js wasm path failed ${cbrComicInfoWasmFailures}x ` +
      `(latest: ${filePath}); switching CBR ComicInfo reads to unar CLI for the rest of this process.`
    );
  }
}

function noteCbrComicInfoWasmSuccess(): void {
  if (cbrComicInfoWasmFailures > 0) cbrComicInfoWasmFailures = 0;
}

/**
 * fast-xml-parser configured for ComicInfo's quirks. We lowercase tag names
 * during parse so consumers can reference fields case-insensitively, and we
 * keep attribute names too (the <Pages><Page Image="0".../></Pages> block
 * uses attributes, not nested elements).
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,        // we cast manually so we control coercion
  parseTagValue: false,              // ditto
  trimValues: true,
  transformTagName: (t) => t.toLowerCase(),
  transformAttributeName: (a) => a.toLowerCase(),
});

/**
 * Map ComicInfo's free-form `<AgeRating>` values to our enum (R-1).
 * Standard ComicRack values: Unknown, Adults Only 18+, Early Childhood,
 * Everyone, Everyone 10+, G, Kids to Adults, M, MA15+, Mature 17+, PG,
 * R18+, Rating Pending, Teen, X18+. Anything we don't recognise becomes
 * 'unknown' so callers can fall back to other signals.
 */
export function mapAgeRating(raw: unknown): AgeRating {
  if (typeof raw !== 'string') return 'unknown';
  const k = raw.trim().toLowerCase();
  if (!k) return 'unknown';
  if (k === 'g' || k === 'everyone' || k === 'kids to adults' || k === 'early childhood') return 'g';
  if (k === 'pg' || k === 'everyone 10+') return 'pg';
  if (k === 'teen') return 'teen';
  if (k === 'mature 17+' || k === 'm' || k === 'ma15+' || k === 'mature') return 'mature';
  if (k === 'adults only 18+' || k === 'r18+' || k === 'x18+' || k === 'adults only') return 'adults_only';
  return 'unknown';
}

function pickNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    // ComicInfo sometimes uses "1.5" or even "1-5" (range). Take leading number.
    const m = t.match(/^-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickInt(v: unknown): number | null {
  const n = pickNumber(v);
  return n != null ? Math.trunc(n) : null;
}

function pickString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Pure-function entrypoint: given the XML bytes/string, return a typed
 * ComicInfo or null on parse failure.
 */
export function parseComicInfoXml(xml: string | Buffer): ComicInfo | null {
  const text = typeof xml === 'string' ? xml : xml.toString('utf8');
  if (!text.trim()) return null;
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(text);
  } catch (err) {
    console.warn('[CB8 ComicInfo] parse error:', err instanceof Error ? err.message : err);
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  // Find the root element. fast-xml-parser produces { comicinfo: {...} }
  // (lowercased by transformTagName). Accept any single-keyed object too in case
  // the document declares no namespace and a user mis-cased the root.
  const root = (parsed as Record<string, unknown>).comicinfo ??
               findFirstObjectChild(parsed as Record<string, unknown>);
  if (!root || typeof root !== 'object') return null;
  const r = root as Record<string, unknown>;

  const pages = asArray(r.pages as unknown).flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const inner = (p as Record<string, unknown>).page;
    return asArray(inner).map((pg) => {
      const pgr = pg as Record<string, unknown>;
      const page: ComicInfoPage = {
        image: pickInt(pgr['@_image']) ?? 0,
      };
      const type = pickString(pgr['@_type']);
      if (type) page.type = type;
      const sz   = pickInt(pgr['@_imagesize']);   if (sz   != null) page.imageSize   = sz;
      const h    = pickInt(pgr['@_imageheight']); if (h    != null) page.imageHeight = h;
      const w    = pickInt(pgr['@_imagewidth']);  if (w    != null) page.imageWidth  = w;
      return page;
    });
  });

  const langRaw = pickString(r.languageiso) ?? pickString(r.language);
  return {
    series:    pickString(r.series),
    volume:    pickInt(r.volume),
    number:    pickNumber(r.number),
    title:     pickString(r.title),
    summary:   pickString(r.summary),
    publisher: pickString(r.publisher),
    language:  langRaw ? langRaw.toLowerCase() : null,
    year:      pickInt(r.year),
    month:     pickInt(r.month),
    pageCount: pickInt(r.pagecount),
    ageRating: mapAgeRating(pickString(r.agerating)),
    pages,
    raw: r,
  };
}

function findFirstObjectChild(o: Record<string, unknown>): Record<string, unknown> | null {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return null;
}

/**
 * Open the archive at `filePath`, extract ComicInfo.xml from its root
 * (case-insensitive, ignoring entries inside subdirectories), and parse.
 * Returns null on:
 *   - unsupported extension
 *   - archive open failure
 *   - missing ComicInfo.xml at root
 *   - XML parse error
 *
 * Errors are logged at warn level rather than thrown; ingest must
 * fall back to filename heuristics on null return.
 */
export async function readFromArchive(filePath: string): Promise<ComicInfo | null> {
  const ext = path.extname(filePath).toLowerCase();
  // Trust the file signature over the extension — mislabeled .cbr/.cbz are
  // common. Fall back to the extension when the magic is unrecognised.
  const sniffed = await sniffFormat(filePath);
  const isCbz = sniffed === 'cbz' || (sniffed === null && CBZ_EXTS.has(ext));
  const isCbr = sniffed === 'cbr' || (sniffed === null && CBR_EXTS.has(ext));
  // CB7 / CBT: unar handles 7z and tar — route straight to the CLI path.
  const isCb7 = sniffed === 'cb7' || (sniffed === null && CB7_EXTS.has(ext));
  try {
    if (isCbz) {
      const bytes = await readComicInfoFromCbz(filePath);
      return bytes ? parseComicInfoXml(bytes) : null;
    }
    if (isCbr) {
      const bytes = await readComicInfoFromCbr(filePath);
      return bytes ? parseComicInfoXml(bytes) : null;
    }
    if (isCb7) {
      const cliBins = ArchiveCli.detect();
      if (!cliBins) return null; // no unar, skip ComicInfo for this archive
      const bytes = await readComicInfoFromCbrViaCli(filePath, cliBins);
      return bytes ? parseComicInfoXml(bytes) : null;
    }
    return null;
  } catch (err) {
    console.warn(`[CB8 ComicInfo] read error for ${filePath}:`,
      err instanceof Error ? err.message : err);
    return null;
  }
}

/** True if `name` is `ComicInfo.xml` at the archive root (case-insensitive). */
function isRootComicInfo(name: string): boolean {
  // Reject entries inside subdirectories — only the archive root counts.
  const cleaned = name.replace(/^[/\\]+/, '');
  if (cleaned.includes('/') || cleaned.includes('\\')) return false;
  return cleaned.toLowerCase() === 'comicinfo.xml';
}

async function readComicInfoFromCbz(filePath: string): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
      if (err || !zipFile) return reject(err ?? new Error('failed to open zip'));
      let resolved = false;
      zipFile.on('entry', (entry: yauzl.Entry) => {
        if (resolved) {
          zipFile.readEntry();
          return;
        }
        if (!isRootComicInfo(entry.fileName)) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (sErr, stream) => {
          if (sErr || !stream) {
            resolved = true;
            return reject(sErr ?? new Error('failed to read ComicInfo.xml'));
          }
          const chunks: Buffer[] = [];
          stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          stream.on('end', () => {
            resolved = true;
            resolve(Buffer.concat(chunks));
          });
          stream.on('error', (e) => {
            resolved = true;
            reject(e);
          });
        });
      });
      zipFile.on('end', () => { if (!resolved) resolve(null); });
      zipFile.on('error', reject);
      zipFile.readEntry();
    });
  });
}

async function readComicInfoFromCbr(filePath: string): Promise<Buffer | null> {
  // Prefer a fresh CLI subprocess over node-unrar-js's shared wasm heap.
  // This path runs for every CBR during ingest, often only to discover that
  // ComicInfo.xml is absent, so heap stability matters more than avoiding a
  // fork. If the CLI is unavailable, fall back to wasm with a circuit breaker.
  const cliBins = ArchiveCli.detect();
  if (cliBins) {
    if (cbrComicInfoWasmDisabled) return readComicInfoFromCbrViaCli(filePath, cliBins);
    try {
      return await readComicInfoFromCbrViaCli(filePath, cliBins);
    } catch (cliErr) {
      // Some installations have partial/broken The Unarchiver binaries. Try
      // wasm before treating the archive as unreadable.
      try {
        const bytes = await readComicInfoFromCbrViaWasm(filePath);
        noteCbrComicInfoWasmSuccess();
        return bytes;
      } catch {
        throw cliErr;
      }
    }
  }

  try {
    const bytes = await readComicInfoFromCbrViaWasm(filePath);
    noteCbrComicInfoWasmSuccess();
    return bytes;
  } catch (err) {
    noteCbrComicInfoWasmFailure(filePath);
    throw err;
  }
}

async function readComicInfoFromCbrViaWasm(filePath: string): Promise<Buffer | null> {
  if (cbrComicInfoWasmDisabled) {
    throw new Error('CBR ComicInfo wasm path disabled after repeated failures');
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cb8-cinfo-'));
  try {
    // File-mode avoids copying the whole archive into the shared wasm heap.
    const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: tempDir });
    const list = extractor.getFileList();
    const target = pickRootComicInfoHeader(list.fileHeaders);
    if (!target) return null;
    const extracted = extractor.extract({ files: [target.name] });
    // Drain the iterator so the archive actually unpacks the file to disk.
    for (const _ of extracted.files) { /* consume */ }
    const onDiskPath = path.join(tempDir, target.name);
    return await fsp.readFile(onDiskPath);
  } finally {
    // Best-effort cleanup; do not throw on rmdir failures.
    try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function readComicInfoFromCbrViaCli(filePath: string, bins: ArchiveCli.CliBins): Promise<Buffer | null> {
  const entries = await ArchiveCli.listArchive(bins, filePath);
  // Match the same R-16 root-only, case-insensitive lookup the wasm
  // path uses. `pickRootComicInfoHeader` walks fileHeaders; here we
  // walk CLI entries with the same `isRootComicInfo` predicate.
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!isRootComicInfo(entry.name)) continue;
    return ArchiveCli.extractToBuffer(bins, filePath, entry.name);
  }
  return null;
}

interface RarHeader { name: string; flags: { directory: boolean } }
function pickRootComicInfoHeader(headers: Iterable<RarHeader>): RarHeader | null {
  for (const h of headers) {
    if (h.flags.directory) continue;
    if (isRootComicInfo(h.name)) return h;
  }
  return null;
}

/**
 * Synchronous helper for tests: read a ComicInfo.xml off disk and parse it.
 * Not used in the ingest path.
 */
export function parseComicInfoFromPath(xmlPath: string): ComicInfo | null {
  const bytes = fs.readFileSync(xmlPath);
  return parseComicInfoXml(bytes);
}
