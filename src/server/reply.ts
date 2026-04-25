/**
 * Helpers for writing JSON / error responses through a FastifyReply, plus a
 * couple of shared parsing utilities for query strings.
 */
import type { FastifyReply } from 'fastify';
import type { QueryOptions } from '../shared/types';

export function sendJson(reply: FastifyReply, status: number, body: unknown): FastifyReply {
  return reply.code(status).type('application/json').send(body);
}

export function sendError(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.code(status).type('application/json').send({ error: message });
}

export function parseQueryOptions(query: Record<string, unknown>): QueryOptions {
  const q = query as Record<string, string>;
  const options: QueryOptions = {};
  if (q.search) options.search = q.search;
  if (q.tag) options.tag = q.tag;
  if (q.sortBy) options.sortBy = q.sortBy as QueryOptions['sortBy'];
  if (q.sortOrder) options.sortOrder = q.sortOrder as 'asc' | 'desc';
  if (q.offset) options.offset = parseInt(q.offset, 10);
  if (q.limit) options.limit = Math.min(parseInt(q.limit, 10), 200);
  if (q.mediaType) options.mediaType = q.mediaType as 'comic' | 'book';
  if (q.excludeFoldered) options.excludeFoldered = q.excludeFoldered === 'true';
  if (q.fileExt) options.fileExt = String(q.fileExt).toLowerCase().replace(/^\./, '');
  return options;
}
