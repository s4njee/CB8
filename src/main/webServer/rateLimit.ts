/**
 * Simple in-memory rate limiter — no external dependencies.
 * Each bucket key (e.g., IP + endpoint) gets at most `maxRequests` within
 * a sliding `windowMs` window. Expired entries are pruned lazily on access
 * and periodically via a cleanup timer.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: RateLimitOptions) {
    // Prune stale buckets every minute to prevent unbounded memory growth.
    this.pruneTimer = setInterval(() => this.prune(), 60_000).unref?.() ?? setInterval(() => this.prune(), 60_000);
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  check(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 1, resetAt: now + this.opts.windowMs };
      this.buckets.set(key, bucket);
      return true;
    }
    if (bucket.count >= this.opts.maxRequests) return false;
    bucket.count++;
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  destroy(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }
}

// One limiter instance per sensitive endpoint group, shared across all requests.
export const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 });
export const forgotPasswordLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });
