import { z } from "zod";

// ---------------------------------------------------------------------------
// DataType — declares a data type that skills can consume
// ---------------------------------------------------------------------------

export const DataTypeSchema = z.object({
  /** Unique data type identifier, e.g. "search_terms", "ad_metrics" */
  id: z.string().min(1),
  /** Human-readable description of what this data type represents */
  description: z.string().min(1),
  /** JSON Schema describing the expected shape of this data */
  schema: z.record(z.string(), z.unknown()),
});

export type DataType = z.infer<typeof DataTypeSchema>;

// ---------------------------------------------------------------------------
// DataTypeRegistry — in-memory registry for looking up data types
// ---------------------------------------------------------------------------

/**
 * Registry for managing data type declarations.
 * Skills declare which data types they consume; the harness uses this registry
 * to resolve which tools provide which data types.
 */
export class DataTypeRegistry {
  private types = new Map<string, DataType>();

  /** Register a new data type. Throws if id already exists. */
  register(dataType: DataType): void {
    const parsed = DataTypeSchema.parse(dataType);
    if (this.types.has(parsed.id)) {
      throw new Error(`DataType "${parsed.id}" is already registered`);
    }
    this.types.set(parsed.id, parsed);
  }

  /** Look up a data type by id. Returns undefined if not found. */
  get(id: string): DataType | undefined {
    return this.types.get(id);
  }

  /** Check whether a data type is registered. */
  has(id: string): boolean {
    return this.types.has(id);
  }

  /** List all registered data types. */
  list(): DataType[] {
    return Array.from(this.types.values());
  }
}
