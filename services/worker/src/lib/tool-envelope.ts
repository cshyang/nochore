import type { AgentToolDefinition } from "@nochore/harness";

export const DELEGATE_TASK_TOOL_NAME = "delegate_task";
export const RECORD_METRIC_TOOL_NAME = "record_metric";
export const SUBMIT_REPORT_TOOL_NAME = "submit_report";

export const RESERVED_INTERNAL_TOOL_NAMES = new Set([
  DELEGATE_TASK_TOOL_NAME,
  RECORD_METRIC_TOOL_NAME,
  SUBMIT_REPORT_TOOL_NAME,
]);

export function buildLeadToolEnvelope(params: {
  providerTools: AgentToolDefinition[];
  delegateTaskTool: AgentToolDefinition;
}): AgentToolDefinition[] {
  assertToolName(params.delegateTaskTool, DELEGATE_TASK_TOOL_NAME);
  validateProviderTools(params.providerTools);
  return [...params.providerTools, params.delegateTaskTool];
}

export function buildAgentTaskToolEnvelope(providerTools: AgentToolDefinition[]): AgentToolDefinition[] {
  validateProviderTools(providerTools);
  return providerTools;
}

function validateProviderTools(providerTools: AgentToolDefinition[]) {
  const names = new Set<string>();
  for (const tool of providerTools) {
    if (RESERVED_INTERNAL_TOOL_NAMES.has(tool.name)) {
      throw new Error(`Provider tool "${tool.name}" collides with a reserved internal tool name`);
    }
    if (names.has(tool.name)) {
      throw new Error(`Duplicate tool name "${tool.name}" in tool envelope`);
    }
    names.add(tool.name);
  }
}

function assertToolName(tool: AgentToolDefinition, expectedName: string) {
  if (tool.name !== expectedName) {
    throw new Error(`Expected tool "${expectedName}", got "${tool.name}"`);
  }
}
