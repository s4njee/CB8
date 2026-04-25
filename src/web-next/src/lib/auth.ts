import { redirect } from '@sveltejs/kit';
import type { Session } from './api';

export function requireUser(session: Session | null | undefined): Session {
  if (!session?.authenticated || !session.user) {
    throw redirect(302, '/login');
  }
  return session;
}

export function requireAdmin(session: Session | null | undefined): Session {
  const resolved = requireUser(session);
  if (!resolved.user?.isAdmin) {
    throw redirect(302, '/');
  }
  return resolved;
}
