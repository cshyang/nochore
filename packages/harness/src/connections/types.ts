import type { ExecutionResult } from "../types/action";

export interface ConnectionHealth {
  connectionId: string;
  provider: string;
  status: "active" | "expired" | "error";
  lastChecked: Date;
}

export interface ConnectionManager {
  fetch(dataTypeId: string): Promise<unknown>;
  execute(action: string, toolCategory: string, args: Record<string, unknown>): Promise<ExecutionResult>;
  availableDataTypes(): string[];
  getHealth(): Promise<ConnectionHealth[]>;
}
