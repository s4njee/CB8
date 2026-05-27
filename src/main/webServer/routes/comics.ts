import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ArchiveLoader from '../../archiveLoader';
import { generateThumbnail, isPlaceholderThumbnail } from '../../thumbnailGenerator';
import { getCachedOrResize, invalidateCacheForComic } from '../../imageResizer';
import { searchMetadata } from '../../metadataScraper';
import { sendJson, sendError, readBody, parseQueryOptions } from '../middleware';
import { toWebRecord, overlayUserState } from '../mapping';
import { withArchive, evictFromCache } from '../archiveCache';
import { safeFetchBuffer, SafeFetchError } from '../safeFetch';
import { requireAdmin, type RouteHandler } from '../context';
import { FileScannerImpl } from '../../fileScanner';
import { classifyIngestError, recordIngestError } from '../../ingestErrorLog';
import type { QueryOptions } from '../../../shared/types';

const PAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  avif: 'image/avif', jxl: 'image/png',
};

export const handle: RouteHandler = async (ctx) => {
  const { req, res, db, pathname, method, query, currentUser } = ctx;

  // Delete comic (admin)
  const deleteMatch = pathname.match(/^\/api\/comics\/(\d+)$/);
  if (method === 'DELETE' && deleteMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(deleteMatch[1], 10);
    if (!db.getComic(id)) { sendError(res, 404, 'Comic not found'); return true; }
    await evictFromCache(id);
    db.removeComics([id]);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // List comics
  if (method === 'GET' && pathname === '/api/comics') {
    const opts = parseQueryOptions(query) as QueryOptions & { readStatus?: 'unread' | 'in-progress' | 'completed'; favorites?: boolean };
    if (!opts.limit) opts.limit = 50;
    if (query.readStatus === 'unread' || query.readStatus === 'in-progress' || query.readStatus === 'completed') {
      opts.readStatus = query.readStatus;
    }
    if (query.favorites === 'true') opts.favorites = true;
    const result = db.queryComicsForUser(currentUser?.id ?? null, opts);
    sendJson(res, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
    return true;
  }

  // Get comic
  const comicMatch = pathname.match(/^\/api\/comics\/(\d+)$/);
  if (method === 'GET' && comicMatch) {
    const id = parseInt(comicMatch[1], 10);
    const record = db.getComic(id);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    sendJson(res, 200, overlayUserState(toWebRecord(record)!, db, currentUser?.id ?? null));
    return true;
  }

  // Thumbnail
  const thumbMatch = pathname.match(/^\/api\/comics\/(\d+)\/thumbnail$/);
  if (method === 'GET' && thumbMatch) {
    const id = parseInt(thumbMatch[1], 10);
    const record = db.getComic(id);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    let thumb = record.coverThumbnail;
    if (record.mediaType === 'comic' && (!thumb || thumb.length === 0 || isPlaceholderThumbnail(thumb))) {
      try {
        await withArchive(id, record.filePath, async (handle) => {
          const cover = await ArchiveLoader.getCoverImage(handle);
          thumb = await generateThumbnail(cover);
          db.updateCoverThumbnailByPath(record.filePath, thumb);
          invalidateCacheForComic(id);
        });
      } catch (err) {
        console.warn(`[webServer] Thumbnail recover failed comic=${id}:`, err);
        const message = (err instanceof Error ? err.message : String(err)).trim();
        recordIngestError({
          path: record.filePath,
          ext: path.extname(record.filePath).toLowerCase(),
          errorClass: classifyIngestError(err, record.filePath),
          message,
        });
      }
    }
    if (!thumb || thumb.length === 0) {
      const placeholder = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' });
      res.end(placeholder);
      return true;
    }
    const resolvedThumb = thumb;
    const widthParam = query.width ? parseInt(query.width, 10) : NaN;
    if (Number.isFinite(widthParam) && widthParam > 0) {
      try {
        const out = await getCachedOrResize(id, -1, widthParam, async () => ({ buffer: resolvedThumb, ext: 'jpg' }));
        res.writeHead(200, {
          'Content-Type': `image/${out.ext}`,
          'Cache-Control': 'public, max-age=3600',
          'Content-Length': String(out.buffer.length),
        });
        res.end(out.buffer);
        return true;
      } catch (err) {
        console.warn('[webServer] Thumbnail resize failed, falling back:', err);
      }
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': String(resolvedThumb.length),
    });
    res.end(resolvedThumb);
    return true;
  }

  // Pages
  const pageMatch = pathname.match(/^\/api\/comics\/(\d+)\/pages\/(\d+)$/);
  if (method === 'GET' && pageMatch) {
    const comicId = parseInt(pageMatch[1], 10);
    const pageIndex = parseInt(pageMatch[2], 10);
    const record = db.getComic(comicId);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    if (record.mediaType !== 'comic') { sendError(res, 400, 'Not a comic archive'); return true; }
    try {
      await withArchive(comicId, record.filePath, async (handle) => {
        if (pageIndex < 0 || pageIndex >= handle.pageCount) {
          sendError(res, 400, `Page ${pageIndex} out of range`);
          return;
        }
        const ext = handle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
        const mime = PAGE_MIME[ext] ?? 'image/png';

        const widthParam = query.width ? parseInt(query.width, 10) : NaN;
        if (Number.isFinite(widthParam) && widthParam > 0) {
          try {
            const out = await getCachedOrResize(comicId, pageIndex, widthParam, async () => {
              const buf = await ArchiveLoader.getPage(handle, pageIndex);
              return { buffer: buf, ext };
            });
            res.writeHead(200, {
              'Content-Type': `image/${out.ext}`,
              'Cache-Control': 'public, max-age=86400',
              'Content-Length': String(out.buffer.length),
            });
            res.end(out.buffer);
            return;
          } catch (err) {
            console.warn('[webServer] Page resize failed, falling back:', err);
          }
        }

        const buf = await ArchiveLoader.getPage(handle, pageIndex);
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400',
          'Content-Length': String(buf.length),
        });
        res.end(buf);
      });
    } catch (err) {
      console.error(`[webServer] Page read error comic=${comicId} page=${pageIndex}:`, err);
      const message = (err instanceof Error ? err.message : String(err)).trim();
      recordIngestError({
        path: record.filePath,
        ext: path.extname(record.filePath).toLowerCase(),
        errorClass: classifyIngestError(err, record.filePath),
        message,
      });
      if (!res.headersSent) sendError(res, 500, 'Failed to read page');
    }
    return true;
  }

  // Book file stream
  const fileMatch = pathname.match(/^\/api\/comics\/(\d+)\/file$/);
  if (method === 'GET' && fileMatch) {
    const id = parseInt(fileMatch[1], 10);
    const record = db.getComic(id);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    if (record.mediaType !== 'book') { sendError(res, 400, 'Not a book'); return true; }
    const ext = path.extname(record.filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.epub': 'application/epub+zip',
      '.pdf': 'application/pdf',
      '.mobi': 'application/x-mobipocket-ebook',
    };
    const mime = mimeMap[ext] ?? 'application/octet-stream';
    try {
      const stat = fs.statSync(record.filePath);
      const stream = fs.createReadStream(record.filePath);
      stream.on('error', (streamErr) => {
        console.error(`[webServer] File stream error id=${id}:`, streamErr);
        stream.destroy();
        res.destroy();
      });
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=3600',
      });
      stream.pipe(res);
    } catch (err) {
      console.error(`[webServer] File read error id=${id}:`, err);
      sendError(res, 500, 'Failed to read file');
    }
    return true;
  }

  // Metadata search
  const metadataSearchMatch = pathname.match(/^\/api\/comics\/(\d+)\/metadata-search$/);
  if (method === 'GET' && metadataSearchMatch) {
    if (!requireAdmin(ctx)) return true;
    const q = typeof query.q === 'string' ? query.q : '';
    const srcsRaw = typeof query.sources === 'string' ? query.sources : '';
    const allowed = new Set(['comicvine', 'anilist', 'mangadex']);
    const srcs = srcsRaw
      .split(',').map((s) => s.trim()).filter((s) => allowed.has(s)) as Array<'comicvine' | 'anilist' | 'mangadex'>;
    const result = await searchMetadata(q, srcs.length ? srcs : undefined);
    sendJson(res, 200, result);
    return true;
  }

  // Metadata apply
  const metadataPutMatch = pathname.match(/^\/api\/comics\/(\d+)\/metadata$/);
  if (method === 'PUT' && metadataPutMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(metadataPutMatch[1], 10);
    if (!db.getComic(id)) { sendError(res, 404, 'Comic not found'); return true; }
    const body = await readBody(req);
    let parsed: {
      title?: string; author?: string | null; artist?: string | null;
      genre?: string | string[] | null; year?: number | null; summary?: string | null;
      externalId?: string | null; externalSource?: string | null;
      seriesName?: string | null; volumeNumber?: number | null; chapterNumber?: number | null;
      coverUrl?: string | null;
    };
    try { parsed = JSON.parse(body); } catch { sendError(res, 400, 'Invalid JSON'); return true; }
    let genreStr: string | null | undefined;
    if (parsed.genre !== undefined) {
      if (parsed.genre === null) genreStr = null;
      else if (Array.isArray(parsed.genre)) {
        if (!parsed.genre.every((g) => typeof g === 'string')) {
          sendError(res, 400, '"genre" array must contain strings only'); return true;
        }
        genreStr = JSON.stringify(parsed.genre);
      } else if (typeof parsed.genre === 'string') {
        genreStr = parsed.genre;
      } else {
        sendError(res, 400, '"genre" must be string, array, or null'); return true;
      }
    }
    db.updateComicMetadata(id, {
      title: parsed.title,
      author: parsed.author,
      artist: parsed.artist,
      genre: genreStr,
      year: parsed.year,
      summary: parsed.summary,
      externalId: parsed.externalId,
      externalSource: parsed.externalSource,
      seriesName: parsed.seriesName,
      volumeNumber: parsed.volumeNumber,
      chapterNumber: parsed.chapterNumber,
    });
    if (typeof parsed.coverUrl === 'string' && parsed.coverUrl) {
      try {
        const buf = await safeFetchBuffer(parsed.coverUrl);
        const thumb = await generateThumbnail(buf);
        const record = db.getComic(id);
        if (record && thumb) db.updateCoverThumbnailByPath(record.filePath, thumb);
        invalidateCacheForComic(id);
      } catch (err) {
        if (err instanceof SafeFetchError) {
          console.warn(`[webServer] Cover fetch refused for comic=${id}: ${err.message}`);
        } else {
          console.warn(`[webServer] Cover fetch failed for comic=${id}:`, err);
        }
      }
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Refresh book metadata (re-derive page count + cover from the file on
  // disk for an already-indexed book). PDFs whose pageCount is still 0
  // are the typical case — the original ingest may have timed out.
  const refreshMatch = pathname.match(/^\/api\/comics\/(\d+)\/refresh-metadata$/);
  if (method === 'POST' && refreshMatch) {
    if (!requireAdmin(ctx)) return true;
    const id = parseInt(refreshMatch[1], 10);
    const record = db.getComic(id);
    if (!record) { sendError(res, 404, 'Comic not found'); return true; }
    if (record.mediaType !== 'book') {
      sendJson(res, 200, overlayUserState(toWebRecord(record)!, db, currentUser?.id ?? null));
      return true;
    }
    if (record.filePath.toLowerCase().endsWith('.pdf') && record.pageCount <= 0) {
      const scanner = new FileScannerImpl(db);
      try {
        await scanner.refreshBookMetadata(record.filePath);
      } catch (err) {
        console.warn(`[webServer] refreshBookMetadata failed for comic=${id}:`, err);
      }
    }
    const fresh = db.getComic(id);
    if (!fresh) { sendError(res, 404, 'Comic not found'); return true; }
    sendJson(res, 200, overlayUserState(toWebRecord(fresh)!, db, currentUser?.id ?? null));
    return true;
  }

  return false;
};
