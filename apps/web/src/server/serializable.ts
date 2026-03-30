/**
 * Serialization helpers for TanStack Start server functions.
 *
 * TanStack Start's type system validates that return values are serializable.
 * This rejects `unknown` (from zod's z.unknown()) because `unknown` doesn't
 * extend the Serializable union. Since our data comes from JSON.parse() of
 * DB columns, it's already JSON-safe — we just need to convince TypeScript.
 *
 * We use a JSON-compatible type that TanStack accepts for server function returns.
 */

// ---------------------------------------------------------------------------
// JSON-safe type — a recursive JSON value type that TanStack accepts
// ---------------------------------------------------------------------------

/** Concrete type representing any JSON value. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Date
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Cast a value to JsonValue for server function returns.
 *
 * This is a no-op at runtime. It tells TypeScript the value is a valid
 * JSON structure, which satisfies TanStack Start's serialization checks.
 * Safe to use when the value comes from JSON.parse() or DB queries.
 */
export function jsonSafe(value: unknown): JsonValue {
  return value as JsonValue;
}
