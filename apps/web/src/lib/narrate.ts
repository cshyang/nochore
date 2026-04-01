/**
 * Converts agent run event types + payloads into human-readable one-line
 * summaries for the Live Run view. All summaries stay under 200 characters.
 */

export type NarratedEvent = {
  type: string;
  summary: string;
};

export type RunEventType =
  | "run_started"
  | "prompt_built"
  | "tool_called"
  | "tool_executed"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "tool_approval_expired"
  | "policy_rule_suggested"
  | "policy_rule_accepted"
  | "notification_sent"
  | "agent_message"
  | "finding_recorded"
  | "lesson_distilled"
  | "sub_run_started"
  | "sub_run_completed"
  | "run_completed"
  | "run_cancelled"
  | "run_failed";

/**
 * Converts a tool name like `GOOGLEADS_GET_CAMPAIGNS` into
 * "Google Ads: Get Campaigns". Splits on the first underscore to separate
 * the provider prefix from the action, then title-cases each word.
 */
export function humanizeToolName(toolName: string): string {
  const parts = toolName.split("_");
  if (parts.length <= 1) return titleCase(toolName);

  // First segment is the provider (e.g. GOOGLEADS, SLACK, META).
  // Remaining segments form the action (e.g. GET_CAMPAIGNS).
  const provider = titleCase(parts[0]);
  const action = parts
    .slice(1)
    .map((w) => titleCase(w))
    .join(" ");

  return `${provider}: ${action}`;
}

/**
 * Returns a human-readable one-liner for any agent run event.
 * Unknown event types pass through as-is for forward compatibility.
 */
export function narrateEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "run_started": {
      const trigger = payload.trigger as { type: string } | undefined;
      const providers = payload.providers as string[] | undefined;
      const triggerLabel = trigger?.type ?? "unknown";
      const providerCount = providers?.length ?? 0;
      return `Run started (${triggerLabel} trigger, ${providerCount} provider${providerCount === 1 ? "" : "s"} connected)`;
    }

    case "prompt_built": {
      const skills = payload.selectedSkills as string[] | undefined;
      const systemLen = payload.systemLength as number | undefined;
      const skillCount = skills?.length ?? 0;
      const charCount = systemLen ?? 0;
      return `Prompt assembled with ${skillCount} skill${skillCount === 1 ? "" : "s"} (${charCount.toLocaleString()} chars)`;
    }

    case "tool_called": {
      const name = payload.toolName as string | undefined;
      return `Calling ${humanizeToolName(name ?? "unknown")}`;
    }

    case "tool_executed": {
      const name = payload.toolName as string | undefined;
      return `${humanizeToolName(name ?? "unknown")} returned a result`;
    }

    case "tool_approval_requested": {
      const name = payload.toolName as string | undefined;
      const policy = payload.policy as string | undefined;
      const reason = payload.reason as string | undefined;
      const reasonSnippet = reason ? ` -- ${truncate(reason, 100)}` : "";
      return `Approval needed for ${humanizeToolName(name ?? "unknown")} (policy: ${policy ?? "unknown"})${reasonSnippet}`;
    }

    case "tool_approval_resolved": {
      const name = payload.toolName as string | undefined;
      const status = payload.status as string | undefined;
      return `${humanizeToolName(name ?? "unknown")} ${status ?? "resolved"}`;
    }

    case "tool_approval_expired": {
      const name = payload.toolName as string | undefined;
      return `Approval expired for ${humanizeToolName(name ?? "unknown")}`;
    }

    case "policy_rule_suggested": {
      const toolName = payload.toolName as string | undefined;
      const learnedDecision = payload.learnedDecision as string | undefined;
      const evidenceCount = payload.evidenceCount as number | undefined;
      return `Suggested ${learnedDecision ?? "policy"} rule for ${humanizeToolName(toolName ?? "unknown")} (${evidenceCount ?? 0} decisions)`;
    }

    case "policy_rule_accepted": {
      const toolName = payload.toolName as string | undefined;
      const learnedDecision = payload.learnedDecision as string | undefined;
      return `Accepted ${learnedDecision ?? "policy"} rule for ${humanizeToolName(toolName ?? "unknown")}`;
    }

    case "notification_sent": {
      const name = payload.toolName as string | undefined;
      const channel = payload.channel as string | undefined;
      return `Approval notification sent via ${channel ?? "unknown"} for ${humanizeToolName(name ?? "unknown")}`;
    }

    case "agent_message": {
      const text = payload.text as string | undefined;
      return truncate(text ?? "Agent thinking...", 180);
    }

    case "finding_recorded": {
      const text = payload.text as string | undefined;
      return truncate(text ?? "Finding recorded", 180);
    }

    case "lesson_distilled": {
      const scope = payload.scope as string | undefined;
      return `Lesson distilled (scope: ${scope ?? "general"})`;
    }

    case "sub_run_started": {
      const role = payload.role as string | undefined;
      const taskDesc = payload.task as string | undefined;
      return `${titleCase(role ?? "Specialist")} started: ${truncate(taskDesc ?? "sub-task", 150)}`;
    }

    case "sub_run_completed": {
      const role = payload.role as string | undefined;
      const success = payload.success as boolean | undefined;
      return `${titleCase(role ?? "Specialist")} ${success !== false ? "completed" : "failed"}`;
    }

    case "run_completed": {
      const summary = payload.summary as { headline?: string; status?: string } | undefined;
      const headline = summary?.headline;
      return headline ? `Completed -- ${truncate(headline, 170)}` : "Run completed";
    }

    case "run_cancelled": {
      const reason = (payload.reason as string | undefined) ?? (payload.error as string | undefined);
      return reason ? `Run cancelled -- ${truncate(reason, 150)}` : "Run cancelled";
    }

    case "run_failed": {
      const reason = payload.reason as string | undefined;
      return reason ? `Run failed -- ${truncate(reason, 150)}` : "Run failed";
    }

    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

function titleCase(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
