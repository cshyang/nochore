import { z } from "zod";
import type { ToolConfigEntry } from "./agent-config";

export const PolicyDecisionSchema = z.object({
  result: z.enum(["auto", "approval", "blocked"]),
  reason: z.string().min(1),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export interface PolicyRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolConfig: ToolConfigEntry | undefined;
}

export interface PolicyContext {
  now: Date;
  globalApprovalRequired: boolean;
  recentToolCalls: Array<{
    toolName: string;
    timestamp: Date;
  }>;
}
