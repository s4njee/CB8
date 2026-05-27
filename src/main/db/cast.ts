/**
 * cast.ts — tiny helpers that bridge node:sqlite's generic query-result types
 * (Record<string, SQLOutputValue>) to our domain-specific row interfaces.
 *
 * node:sqlite returns rows as Record<string, SQLOutputValue> rather than the
 * concrete shape the caller expects. A direct `as T` cast is rejected by
 * TypeScript (TS2352) because the types don't overlap; routing through
 * `unknown` is the sanctioned workaround.
 */

/** Cast a single row (or undefined) returned by StatementSync.get(). */
export function asRow<T>(val: unknown): T {
  return val as unknown as T;
}

/** Cast an array of rows returned by StatementSync.all(). */
export function asRows<T>(val: unknown): T[] {
  return val as unknown as T[];
}
