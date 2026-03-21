import type { ExecutionResult } from "../types/action";
import type { ConnectionHealth, ConnectionManager } from "./types";

// ---------------------------------------------------------------------------
// StubConnectionManager — test double for pipeline steps
//
// Allows tests to configure mock data and execution results without real
// API calls. Also records every execute() call for assertion.
// ---------------------------------------------------------------------------

export interface StubConnectionManagerConfig {
  /** Map of dataTypeId to mock data returned by fetch(). */
  data?: Record<string, unknown>;
  /** Map of action name to execution result returned by execute(). */
  executionResults?: Record<string, ExecutionResult>;
  /** Fallback result when no specific result is configured for an action. */
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
    this.executionResults = new Map(
      Object.entries(config.executionResults ?? {}),
    );
    this.defaultExecutionResult = config.defaultExecutionResult;
  }

  async fetch(dataTypeId: string): Promise<unknown> {
    if (!this.dataStore.has(dataTypeId)) {
      throw new Error(
        `No data configured for data type "${dataTypeId}". ` +
          `Available: [${[...this.dataStore.keys()].join(", ")}]`,
      );
    }
    return this.dataStore.get(dataTypeId);
  }

  async execute(
    action: string,
    toolCategory: string,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    this.executionLog.push({ action, toolCategory, args });

    const specific = this.executionResults.get(action);
    if (specific) return specific;

    if (this.defaultExecutionResult) return this.defaultExecutionResult;

    throw new Error(
      `No execution result configured for action "${action}" and no default provided`,
    );
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

  /** Test helper: get a defensive copy of the execution log. */
  getExecutionLog(): ExecutionLogEntry[] {
    return [...this.executionLog];
  }
}
