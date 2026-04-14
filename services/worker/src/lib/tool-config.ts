import { type AgentRecord, buildToolConfigEntry, type PiToolDefinition, type ToolConfigEntry } from "@nochore/harness";
import { INTERNAL_TOOL_MODES, inferToolProvider } from "./policy-helpers";

export { INTERNAL_TOOL_MODES };

export function createToolConfigLookup(agent: AgentRecord, tools: PiToolDefinition[]): Map<string, ToolConfigEntry> {
  const lookup = new Map<string, ToolConfigEntry>();

  for (const tool of tools) {
    lookup.set(
      tool.name,
      buildToolConfigEntry(
        {
          toolName: tool.name,
          slug: tool.name,
          provider: inferToolProvider(tool.name),
          title: tool.label,
          description: tool.description,
          mode: INTERNAL_TOOL_MODES[tool.name],
        },
        agent.toolConfig.tools[tool.name],
      ),
    );
  }

  return lookup;
}

export function getToolConfigForCall(
  agent: AgentRecord,
  lookup: Map<string, ToolConfigEntry>,
  toolName: string,
): ToolConfigEntry {
  const existing = lookup.get(toolName) ?? agent.toolConfig.tools[toolName];
  if (existing) {
    return existing.provider === "internal" && !agent.toolConfig.tools[toolName]
      ? { ...existing, approvalMode: "auto" }
      : existing;
  }

  const inferred = buildToolConfigEntry({
    toolName,
    slug: toolName,
    provider: inferToolProvider(toolName),
    title: toolName,
    description: "",
    mode: INTERNAL_TOOL_MODES[toolName],
  });

  return inferred.provider === "internal" ? { ...inferred, approvalMode: "auto" } : inferred;
}
