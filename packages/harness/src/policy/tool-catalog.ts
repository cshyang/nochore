import type { ToolConfig, ToolConfigEntry, ToolMode } from "../types";

type ToolLike = {
  toolName: string;
  slug?: string;
  provider?: string;
  title?: string;
  description?: string;
  tags?: string[];
  mode?: ToolMode;
};

const READ_TOOL_NAMES = new Set([
  "googleads_list_campaigns",
  "googleads_campaign_performance",
  "googleads_search_terms",
  "googleads_keyword_quality",
]);

const READ_VERBS = [
  "analyze",
  "describe",
  "fetch",
  "find",
  "get",
  "inspect",
  "list",
  "lookup",
  "query",
  "read",
  "report",
  "search",
  "view",
  "watch",
];

const WRITE_VERBS = [
  "add",
  "adjust",
  "archive",
  "block",
  "cancel",
  "connect",
  "create",
  "delete",
  "disable",
  "disconnect",
  "edit",
  "insert",
  "launch",
  "pause",
  "publish",
  "remove",
  "resume",
  "run",
  "send",
  "set",
  "spawn",
  "start",
  "stop",
  "submit",
  "trigger",
  "update",
  "upload",
  "write",
];

function tokenize(parts: Array<string | undefined>): string[] {
  return parts
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
}

export function inferToolMode(tool: ToolLike): ToolMode {
  if (tool.mode) {
    return tool.mode;
  }

  if (READ_TOOL_NAMES.has(tool.toolName)) {
    return "read";
  }

  const tokens = tokenize([tool.toolName, tool.slug, tool.title, tool.description, ...(tool.tags ?? [])]);
  if (tokens.some((token) => WRITE_VERBS.includes(token))) {
    return "write";
  }
  if (tokens.some((token) => READ_VERBS.includes(token))) {
    return "read";
  }

  return "write";
}

export function buildToolConfigEntry(tool: ToolLike, existing?: ToolConfigEntry): ToolConfigEntry {
  const mode = inferToolMode(tool);

  return {
    toolName: tool.toolName,
    slug: tool.slug ?? tool.toolName,
    provider: tool.provider ?? existing?.provider ?? "",
    title: tool.title ?? existing?.title ?? tool.toolName,
    description: tool.description ?? existing?.description ?? "",
    mode,
    enabled: existing?.enabled ?? true,
    approvalMode: existing?.approvalMode ?? (mode === "read" ? "auto" : "approval"),
    cooldownMinutes: existing?.cooldownMinutes,
    budgetThreshold: existing?.budgetThreshold,
  };
}

export function mergeToolCatalog(
  toolConfig: ToolConfig,
  tools: ToolLike[],
  requiredProviders = toolConfig.requiredProviders,
): ToolConfig {
  const nextTools = { ...toolConfig.tools };

  for (const tool of tools) {
    nextTools[tool.toolName] = buildToolConfigEntry(tool, nextTools[tool.toolName]);
  }

  return {
    globalApprovalRequired: toolConfig.globalApprovalRequired ?? false,
    requiredProviders,
    tools: nextTools,
  };
}
