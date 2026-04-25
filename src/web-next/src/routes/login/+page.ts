import { redirect } from '@sveltejs/kit';
import type { Session } from '../../lib/api';

export const load = async ({ parent }: { parent: () => Promise<{ session: Session | null }> }) => {
  const { session } = await parent();
  if (session?.authenticated && session.user) {
    throw redirect(302, '/');
  }
  return {};
};
