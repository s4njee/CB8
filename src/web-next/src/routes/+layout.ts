import { getSession, type Session } from '../lib/api';

// SPA mode: no SSR, no prerender. Fastify serves the SPA fallback.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'never';

export async function load(): Promise<{ session: Session | null; sessionError: string | null }> {
  try {
    return {
      session: await getSession(),
      sessionError: null,
    };
  } catch (error) {
    return {
      session: null,
      sessionError: error instanceof Error ? error.message : String(error),
    };
  }
}
