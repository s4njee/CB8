import { requireAdmin } from '../../lib/auth';
import { adminHostInfo, type HostInfo, type Session } from '../../lib/api';

export async function load({ parent }: { parent: () => Promise<{ session: Session | null }> }) {
  const { session } = await parent();
  requireAdmin(session);

  let hostInfo: HostInfo | null = null;
  let hostInfoError: string | null = null;

  try {
    hostInfo = await adminHostInfo();
  } catch (error) {
    hostInfoError = error instanceof Error ? error.message : String(error);
  }

  return {
    hostInfo,
    hostInfoError,
  };
}
