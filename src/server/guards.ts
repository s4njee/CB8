/**
 * Guards reused across route plugins.
 *
 * `request.user` and `request.guestEnabled` are populated by the preHandler
 * hook in app.ts. These helpers are thin wrappers that return false (and
 * write a 401/403) when the gate fails, so handlers can early-return.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from './reply';
import type { ResolvedUser } from '../main/webServer/middleware';

declare module 'fastify' {
  interface FastifyRequest {
    user: ResolvedUser | null;
    guestEnabled: boolean;
  }
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const u = req.user;
  if (!u?.isAdmin) {
    sendError(reply, u ? 403 : 401, u ? 'Admin required' : 'Unauthorized');
    return false;
  }
  return true;
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.user) {
    sendError(reply, 401, 'Unauthorized');
    return false;
  }
  return true;
}

export function isHostConnection(req: FastifyRequest): boolean {
  const addr = req.raw.socket.remoteAddress ?? '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
