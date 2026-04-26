import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type * as http from 'node:http';

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

/**
 * Static file fallback — must run only if no API route matched and the path
 * is not `/api/...`. Falls back to index.html for SPA deep links.
 */
export async function serveStatic(
  res: http.ServerResponse,
  pathname: string,
  staticRoot: string,
): Promise<void> {
  const relPath = pathname === '/' ? '/index.html' : pathname;
  const safe = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absPath = path.join(staticRoot, safe);

  if (!absPath.startsWith(staticRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = STATIC_MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-cache',
    });
    const staticStream = fs.createReadStream(absPath);
    staticStream.on('error', (err) => {
      console.error(`[webServer] Static stream error ${absPath}:`, err);
      staticStream.destroy();
      res.destroy();
    });
    staticStream.pipe(res);
  } catch {
    try {
      const indexPath = path.join(staticRoot, 'index.html');
      const indexStat = await fsp.stat(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(indexStat.size),
        'Cache-Control': 'no-cache',
      });
      const indexStream = fs.createReadStream(indexPath);
      indexStream.on('error', (err) => {
        console.error(`[webServer] Index stream error ${indexPath}:`, err);
        indexStream.destroy();
        res.destroy();
      });
      indexStream.pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  }
}

