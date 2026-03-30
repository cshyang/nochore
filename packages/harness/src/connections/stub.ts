import type { ExecutionResult } from "../types/action";
import type { ConnectionHealth, ConnectionManager } from "./types";

export interface StubConnectionManagerConfig {
  data?: Record<string, unknown>;
  executionResults?: Record<string, ExecutionResult>;
  defaultExecutionResult?: ExecutionResult;
}

export interface ExecutionLogEntry {
  action: string;
  toolCategory: string;
  args: Record<string, unknown>;
}

export class StubConnectionManager implements ConnectionManager {
  private readonly dataStore: Map<string, unknown>;
  private readonly executionResults: Map<string, ExecutionResult>;
  private readonly defaultExecutionResult: ExecutionResult | undefined;
  private readonly executionLog: ExecutionLogEntry[] = [];

  constructor(config: StubConnectionManagerConfig) {
    this.dataStore = new Map(Object.entries(config.data ?? {}));
    this.executionResults = new Map(Object.entries(config.executionResults ?? {}));
    this.defaultExecutionResult = config.defaultExecutionResult;
  }

  async fetch(dataTypeId: string): Promise<unknown> {
    if (!this.dataStore.has(dataTypeId)) {
      throw new Error(
        `No data configured for data type "${dataTypeId}". ` + `Available: [${[...this.dataStore.keys()].join(", ")}]`,
      );
    }
    return this.dataStore.get(dataTypeId);
  }

  async execute(action: string, toolCategory: string, args: Record<string, unknown>): Promise<ExecutionResult> {
    this.executionLog.push({ action, toolCategory, args });

    const specific = this.executionResults.get(action);
    if (specific) return specific;

    if (this.defaultExecutionResult) return this.defaultExecutionResult;

    throw new Error(`No execution result configured for action "${action}" and no default provided`);
  }

  availableDataTypes(): string[] {
    return [...this.dataStore.keys()];
  }

  async getHealth(): Promise<ConnectionHealth[]> {
    return [
      {
        connectionId: "stub_conn_001",
        provider: "stub",
        status: "active",
        lastChecked: new Date(),
      },
    ];
  }

  getExecutionLog(): ExecutionLogEntry[] {
    return [...this.executionLog];
  }
}
