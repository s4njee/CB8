import { requireAdmin } from '../../../lib/auth';
import type { Session } from '../../../lib/api';

export const load = async ({ parent }: { parent: () => Promise<{ session: Session | null }> }) => {
  const { session } = await parent();
  requireAdmin(session);
  return {};
};
