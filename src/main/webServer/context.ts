import type * as http from 'node:http';
import type { LibraryDatabase } from '../libraryDatabase';
import { isAdmin, isAuthenticated, sendError, type ResolvedUser } from './middleware';

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  db: LibraryDatabase;
  pathname: string;
  method: string;
  query: Record<string, string>;
  currentUser: ResolvedUser | null;
  guestEnabled: boolean;
}

/** Return value for route handlers: true means "I handled this request". */
export type RouteHandler = (ctx: RequestContext) => Promise<boolean>;

/** Admin gate: if not admin, sends 401/403 and returns false. If admin, returns true. */
export function requireAdmin(ctx: RequestContext): boolean {
  const { req, res, db } = ctx;
  if (!isAdmin(req, db)) {
    sendError(res, isAuthenticated(req, db) ? 403 : 401, isAuthenticated(req, db) ? 'Admin required' : 'Unauthorized');
    return false;
  }
  return true;
}
