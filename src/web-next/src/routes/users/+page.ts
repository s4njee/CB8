import { requireAdmin } from '../../lib/auth';
import { getUsers, type Session, type UserSummary } from '../../lib/api';

export async function load({ parent }: { parent: () => Promise<{ session: Session | null }> }): Promise<{ users: UserSummary[] }> {
  const { session } = await parent();
  requireAdmin(session);
  const users = await getUsers().catch(() => [] as UserSummary[]);
  return { users };
}
