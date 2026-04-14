// Internal marshaling helpers for the repository layer.
// Not exported from the package public surface — repository-internal only.

/**
 * Parse a JSON column value with a fallback for null/undefined/malformed input.
 * Returns `fallback` when the value is null/undefined or when JSON.parse throws.
 */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
