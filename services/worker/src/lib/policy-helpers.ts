import { evaluatePolicy, type ToolMode } from "@nochore/harness";

export { evaluatePolicy };

export const INTERNAL_TOOL_MODES: Record<string, ToolMode> = {
  bash: "write",
  edit: "write",
  read: "read",
  spawn_sub_run: "write",
  submit_report: "read",
  record_metric: "read",
  write: "write",
};

export function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export function inferToolProvider(toolName: string): string {
  if (toolName in INTERNAL_TOOL_MODES) {
    return "internal";
  }

  const [prefix] = toolName.split("_");
  return prefix?.toLowerCase() ?? "";
}
