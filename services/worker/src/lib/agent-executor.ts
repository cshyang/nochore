import type { AgentToolDefinition } from "@nochore/harness";

export interface AgentExecutionEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface AgentToolGateResult {
  block: boolean;
  reason?: string;
}

export interface AgentExecutorConfig {
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;
  tools: AgentToolDefinition[];
  onEvent: (event: AgentExecutionEvent) => Promise<string>;
  beforeToolCall?: (toolName: string, args: unknown) => Promise<AgentToolGateResult | undefined>;
}

export interface AgentExecutionResult {
  output: string;
  toolCalls: Array<{ toolName: string; timestamp: Date }>;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

export type AgentExecutor = (config: AgentExecutorConfig) => Promise<AgentExecutionResult>;
