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
    advanced: {
      database: { generateId: false },
      cookiePrefix: 'cb8',
    },
    user: {
      modelName: 'users',
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
    trustedOrigins: [resolveBaseURL()],
  });
}

export function getAuth(): AuthInstance {
  if (!_auth) throw new Error('auth not initialized — call createAuth(db) first');
  return _auth;
}
