export interface AgentToolContent {
  type: "text";
  text: string;
}

export interface AgentToolResult {
  content: AgentToolContent[];
  details: Record<string, unknown>;
}

export interface AgentToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<AgentToolResult>;
}
