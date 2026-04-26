/**
 * auth.ts — better-auth configuration for the CB8 web server.
 *
 * - Uses the existing better-sqlite3 connection as the auth database.
 * - Maps better-auth's default `user` model onto our plural `users` table.
 * - IDs are SQLite INTEGER AUTOINCREMENT so all FK'd tables (user_progress,
 *   bookmarks, user_favorites, reading_history) keep pointing at the same ids.
 * - Password hashing stays on bcryptjs so existing `password_hash` rows keep
 *   working after they are migrated into the account table by schema.ts.
 * - Username plugin enables username-or-email login.
 */

import { betterAuth } from 'better-auth';
import { username as usernamePlugin } from 'better-auth/plugins';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { sendEmail } from './emailSender';

// The full inferred type of `betterAuth(...)` depends on the exact options
// passed; caching it as the generic return type causes variance errors between
// the plugin-augmented user shape and the base `User`. Narrow publicly to the
// subset of the API we actually consume.
export type AuthUser = {
  id: number | string;
  email: string;
  name: string;
  isAdmin?: boolean | null;
  username?: string | null;
};

export interface AuthInstance {
  handler: (req: Request) => Promise<Response>;
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user: AuthUser | null;
      session: unknown;
    } | null>;
    signInUsername: (args: {
      body: { username: string; password: string };
      returnHeaders?: boolean;
    }) => Promise<{ user: AuthUser; token: string; headers?: Headers }>;
    signInEmail: (args: {
      body: { email: string; password: string };
      returnHeaders?: boolean;
    }) => Promise<{ user: AuthUser; token: string; headers?: Headers }>;
    signOut: (args: { headers: Headers; returnHeaders?: boolean }) => Promise<{ success: boolean; headers?: Headers }>;
  };
}

let _auth: AuthInstance | null = null;

function resolveSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  // Dev fallback — stable across a single process so sessions don't churn,
  // but not persisted across restarts. Production must set BETTER_AUTH_SECRET.
  if (!fromEnv) {
    console.warn('[CB8] BETTER_AUTH_SECRET not set — using ephemeral dev secret.');
  }
  return crypto.randomBytes(32).toString('hex');
}

function resolveBaseURL(): string {
  return process.env.BETTER_AUTH_URL || 'http://localhost:8008';
}

/**
 * Origins better-auth will accept. Includes the configured BASE_URL plus
 * common loopback aliases and, if the web server is listening on a port,
 * the current LAN IP. Without this, users hitting 127.0.0.1 or their LAN
 * address instead of `localhost` are rejected with a 500.
 */
function resolveTrustedOrigins(): string[] {
  const base = resolveBaseURL();
  const out = new Set<string>([base]);
  try {
    const u = new URL(base);
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']) {
      out.add(`${u.protocol}//${host}:${port}`);
    }
    // LAN IP — enumerated from the host network interfaces.
    const os = require('node:os') as typeof import('node:os');
    for (const list of Object.values(os.networkInterfaces())) {
      for (const iface of list ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          out.add(`${u.protocol}//${iface.address}:${port}`);
        }
      }
    }
  } catch { /* fall back to BASE_URL only */ }
  return Array.from(out);
}

export function createAuth(db: Database.Database): AuthInstance {
  if (_auth) return _auth;
  _auth = buildAuth(db) as unknown as AuthInstance;
  return _auth;
}

function buildAuth(db: Database.Database) {
  return betterAuth({
    database: db,
    secret: resolveSecret(),
    baseURL: resolveBaseURL(),
    telemetry: {
      enabled: false,
    },
    advanced: {
      database: { generateId: false },
      cookiePrefix: 'cb8',
    },
    // Our SQLite schema uses snake_case columns (user_id, expires_at, …)
    // but better-auth's default adapter issues queries with camelCase field
    // names verbatim. Without these mappings, every session / account
    // insert errors with "no such column: userId" and the sign-in path
    // returns a silent 500 from FAILED_TO_CREATE_SESSION.
    user: {
      modelName: 'users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        // `displayUsername` is added by the username plugin; cast widens
        // the record so TS doesn't complain about the plugin field.
        displayUsername: 'display_username',
      } as Record<string, string>,
      additionalFields: {
        isAdmin: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
          fieldName: 'is_admin',
        },
      },
    },
    session: {
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      password: {
        hash: (password) => bcrypt.hash(password, 10),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
      sendResetPassword: async ({ user, token }) => {
        // Bypass better-auth's server-side redirect in favor of an SPA route
        // that renders the new-password form and calls /reset-password itself.
        const link = `${resolveBaseURL()}/#/reset-password?token=${encodeURIComponent(token)}`;
        await sendEmail({
          to: user.email,
          subject: 'Reset your CB8 password',
          text: `Click to reset your password: ${link}\n\nIf you did not request this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      // After verifying, better-auth redirects to this URL (clients may
      // override via callbackURL on the sign-up request).
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Verify your CB8 email',
          text: `Welcome to CB8! Click to verify your email: ${url}`,
        });
      },
    },
    plugins: [
      usernamePlugin({
        minUsernameLength: 3,
        maxUsernameLength: 30,
      }),
    ],
    trustedOrigins: resolveTrustedOrigins(),
  });
}

export function getAuth(): AuthInstance {
  if (!_auth) throw new Error('auth not initialized — call createAuth(db) first');
  return _auth;
}
