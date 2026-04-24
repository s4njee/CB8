/**
 * adminReset.ts — restore the default admin account to a known-good state.
 *
 * Called from the "Reset admin password…" menu item when the operator can't
 * log in. Creates admin if missing; otherwise resets password_hash, backfills
 * required fields (email, display_username, name) so better-auth's native
 * sign-in endpoint accepts the row, and synchronises the `account` table.
 */

import * as bcrypt from 'bcryptjs';
import type { LibraryDatabase } from './libraryDatabase';

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'gentrification';

export interface AdminResetResult {
  username: string;
  password: string;
  created: boolean;
}

export async function resetDefaultAdmin(db: LibraryDatabase): Promise<AdminResetResult> {
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const existing = db.getUserByUsername(DEFAULT_ADMIN_USERNAME);
  if (!existing) {
    const created = db.createUser(DEFAULT_ADMIN_USERNAME, hash, true);
    db.upsertCredentialAccount(created.id, DEFAULT_ADMIN_USERNAME, hash);
    return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD, created: true };
  }

  // Update password + backfill any null fields better-auth expects.
  db.raw.prepare(
    `UPDATE users
       SET password_hash = ?,
           email = COALESCE(email, ?),
           email_verified = 1,
           display_username = COALESCE(display_username, ?),
           name = COALESCE(name, ?),
           is_admin = 1,
           updated_at = datetime('now')
     WHERE id = ?`
  ).run(hash, `${DEFAULT_ADMIN_USERNAME}@localhost`, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_USERNAME, existing.id);

  db.upsertCredentialAccount(existing.id, DEFAULT_ADMIN_USERNAME, hash);
  return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD, created: false };
}
