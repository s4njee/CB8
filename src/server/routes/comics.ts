import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sendJson, sendError, parseQueryOptions } from '../reply';
import { requireAdmin } from '../guards';
import * as ArchiveLoader from '../../main/archiveLoader';
import { generateThumbnail } from '../../main/thumbnailGenerator';
import { getCachedOrResize, invalidateCacheForComic } from '../../main/imageResizer';
import { searchMetadata } from '../../main/metadataScraper';
import { toWebRecord, overlayUserState } from '../../main/webServer/mapping';
import { withArchive, evictFromCache } from '../../main/webServer/archiveCache';
import { safeFetchBuffer, SafeFetchError } from '../../main/webServer/safeFetch';
import type { LibraryDatabase } from '../../main/libraryDatabase';
import type { RuntimeConfig } from '../config';
import type { QueryOptions } from '../../shared/types';

interface Options { db: LibraryDatabase; config: RuntimeConfig }

const PAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  avif: 'image/avif', jxl: 'image/png',
};

const BOOK_MIME: Record<string, string> = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
};

function sendBuffer(reply: FastifyReply, status: number, mime: string, body: Buffer, cache: string): void {
  reply
    .code(status)
    .header('Content-Type', mime)
    .header('Cache-Control', cache)
    .header('Content-Length', String(body.length))
    .send(body);
}

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  const { db } = opts;

  app.get<{
    Querystring: Record<string, string>;
  }>('/api/comics', async (req, reply) => {
    const opts = parseQueryOptions(req.query) as QueryOptions & {
      readStatus?: 'unread' | 'in-progress' | 'completed';
      favorites?: boolean;
    };
    if (!opts.limit) opts.limit = 50;
    const rs = req.query.readStatus;
    if (rs === 'unread' || rs === 'in-progress' || rs === 'completed') opts.readStatus = rs;
    if (req.query.favorites === 'true') opts.favorites = true;
    const result = db.queryComicsForUser(req.user?.id ?? null, opts);
    sendJson(reply, 200, {
      records: result.records.map((r) => ({ ...toWebRecord(r)!, favorited: r.favorited ?? false })),
      totalCount: result.totalCount,
    });
  });

  app.get<{ Params: { id: string } }>('/api/comics/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const record = db.getComic(id);
    if (!record) { sendError(reply, 404, 'Comic not found'); return; }
    sendJson(reply, 200, overlayUserState(toWebRecord(record)!, db, req.user?.id ?? null));
  });

  app.delete<{ Params: { id: string } }>('/api/comics/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = parseInt(req.params.id, 10);
    if (!db.getComic(id)) { sendError(reply, 404, 'Comic not found'); return; }
    await evictFromCache(id);
    db.removeComics([id]);
    sendJson(reply, 200, { ok: true });
  });

  app.get<{ Params: { id: string }; Querystring: { width?: string } }>(
    '/api/comics/:id/thumbnail',
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      const record = db.getComic(id);
      if (!record) { sendError(reply, 404, 'Comic not found'); return; }
      const thumb = record.coverThumbnail;
      if (!thumb || thumb.length === 0) {
        const placeholder = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        );
        sendBuffer(reply, 200, 'image/png', placeholder, 'public, max-age=60');
        return;
      }
      const widthParam = req.query.width ? parseInt(req.query.width, 10) : NaN;
      if (Number.isFinite(widthParam) && widthParam > 0) {
        try {
          const out = await getCachedOrResize(id, -1, widthParam, async () => ({ buffer: thumb, ext: 'jpg' }));
          sendBuffer(reply, 200, `image/${out.ext}`, out.buffer, 'public, max-age=3600');
          return;
        } catch (err) {
          app.log.warn({ err, id }, 'Thumbnail resize failed, falling back');
        }
      }
      sendBuffer(reply, 200, 'image/jpeg', thumb, 'public, max-age=3600');
    },
  );

  app.get<{ Params: { id: string; page: string }; Querystring: { width?: string } }>(
    '/api/comics/:id/pages/:page',
    async (req, reply) => {
      const comicId = parseInt(req.params.id, 10);
      const pageIndex = parseInt(req.params.page, 10);
      const record = db.getComic(comicId);
      if (!record) { sendError(reply, 404, 'Comic not found'); return; }
      if (record.mediaType !== 'comic') { sendError(reply, 400, 'Not a comic archive'); return; }

      try {
        await withArchive(comicId, record.filePath, async (handle) => {
          if (pageIndex < 0 || pageIndex >= handle.pageCount) {
            sendError(reply, 400, `Page ${pageIndex} out of range`);
            return;
          }
          const ext = handle.entries[pageIndex]?.filename.split('.').pop()?.toLowerCase() ?? '';
          const mime = PAGE_MIME[ext] ?? 'image/png';

          const widthParam = req.query.width ? parseInt(req.query.width, 10) : NaN;
          if (Number.isFinite(widthParam) && widthParam > 0) {
            try {
              const out = await getCachedOrResize(comicId, pageIndex, widthParam, async () => {
                const buf = await ArchiveLoader.getPage(handle, pageIndex);
                return { buffer: buf, ext };
              });
              sendBuffer(reply, 200, `image/${out.ext}`, out.buffer, 'public, max-age=86400');
              return;
            } catch (err) {
              app.log.warn({ err, comicId, pageIndex }, 'Page resize failed, falling back');
            }
          }

          const buf = await ArchiveLoader.getPage(handle, pageIndex);
          sendBuffer(reply, 200, mime, buf, 'public, max-age=86400');
        });
      } catch (err) {
        app.log.error({ err, comicId, pageIndex }, 'Page read error');
        if (!reply.sent) sendError(reply, 500, 'Failed to read page');
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/comics/:id/file', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const record = db.getComic(id);
    if (!record) { sendError(reply, 404, 'Comic not found'); return; }
    if (record.mediaType !== 'book') { sendError(reply, 400, 'Not a book'); return; }
    const ext = path.extname(record.filePath).toLowerCase();
    const mime = BOOK_MIME[ext] ?? 'application/octet-stream';
    try {
      const stat = fs.statSync(record.filePath);
      const stream = fs.createReadStream(record.filePath);
      stream.on('error', (streamErr) => {
        app.log.error({ err: streamErr, id }, 'File stream error');
      });
      reply
        .code(200)
        .header('Content-Type', mime)
        .header('Content-Length', String(stat.size))
        .header('Cache-Control', 'public, max-age=3600')
        .send(stream);
    } catch (err) {
      app.log.error({ err, id }, 'File read error');
      sendError(reply, 500, 'Failed to read file');
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { q?: string; sources?: string };
  }>('/api/comics/:id/metadata-search', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = req.query.q ?? '';
    const srcsRaw = req.query.sources ?? '';
    const allowed = new Set(['comicvine', 'anilist', 'mangadex']);
    const srcs = srcsRaw
      .split(',').map((s) => s.trim()).filter((s) => allowed.has(s)) as Array<'comicvine' | 'anilist' | 'mangadex'>;
    const result = await searchMetadata(q, srcs.length ? srcs : undefined);
    sendJson(reply, 200, result);
  });

  app.put<{
    Params: { id: string };
    Body: {
      title?: string; author?: string | null; artist?: string | null;
      genre?: string | string[] | null; year?: number | null; summary?: string | null;
      externalId?: string | null; externalSource?: string | null;
      seriesName?: string | null; volumeNumber?: number | null; chapterNumber?: number | null;
      coverUrl?: string | null;
    };
  }>('/api/comics/:id/metadata', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = parseInt(req.params.id, 10);
    if (!db.getComic(id)) { sendError(reply, 404, 'Comic not found'); return; }
    const parsed = req.body ?? {};

    let genreStr: string | null | undefined;
    if (parsed.genre !== undefined) {
      if (parsed.genre === null) genreStr = null;
      else if (Array.isArray(parsed.genre)) {
        if (!parsed.genre.every((g) => typeof g === 'string')) {
          sendError(reply, 400, '"genre" array must contain strings only'); return;
        }
        genreStr = JSON.stringify(parsed.genre);
      } else if (typeof parsed.genre === 'string') {
        genreStr = parsed.genre;
      } else {
        sendError(reply, 400, '"genre" must be string, array, or null'); return;
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
          app.log.warn({ id, msg: err.message }, 'Cover fetch refused');
        } else {
          app.log.warn({ err, id }, 'Cover fetch failed');
        }
      }
    }
    sendJson(reply, 200, { ok: true });
  });
};

export default plugin;
