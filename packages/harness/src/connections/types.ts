import type { ExecutionResult } from "../types/action";

// ---------------------------------------------------------------------------
// ConnectionHealth — status of a single external connection
// ---------------------------------------------------------------------------

export interface ConnectionHealth {
  connectionId: string;
  provider: string;
  status: "active" | "expired" | "error";
  lastChecked: Date;
}

// ---------------------------------------------------------------------------
// ConnectionManager — interface for fetching data and executing actions
// via external tool integrations (Google Ads, Meta, GA4, etc.)
//
// The real implementation wraps Composio (Phase 4). This interface lets
// pipeline steps depend on a stable contract while the backing changes.
// ---------------------------------------------------------------------------

export interface ConnectionManager {
  /** Fetch data for a given data type. Returns the raw data payload. */
  fetch(dataTypeId: string): Promise<unknown>;

  /** Execute an action via the appropriate tool. */
  execute(
    action: string,
    toolCategory: string,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult>;

  /** Check which data types are available (have active connections). */
  availableDataTypes(): string[];

  /** Check connection health. */
  getHealth(): Promise<ConnectionHealth[]>;
}
