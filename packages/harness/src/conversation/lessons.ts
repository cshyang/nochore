export const EPISODIC_NO_FINDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EPISODIC_ATTEMPTED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface RunLessonWrite {
  scope: string;
  confidence: "high" | "medium" | "low";
  content: string;
  expiresInMs?: number;
}

function looksLikeNoFinding(text: string): boolean {
  return /(no (actionable )?(issue|issues|finding|findings|change|changes|anomal(y|ies)|problem|problems)|nothing (important|actionable)|did not find|no significant)/i.test(
    text,
  );
}

export function shouldAttemptChatMemoryDistillation(params: { latestUserText: string; toolNames?: string[] }): boolean {
  if (params.toolNames?.some((toolName) => toolName === "update_config" || toolName === "add_provider")) {
    return true;
  }

  const text = params.latestUserText.toLowerCase();
  if (text.length === 0) {
    return false;
  }

  return /(prefer|always|never|actually|i meant|don't|do not|remember|my name is|call me|from now on|use\b)/i.test(
    text,
  );
}

export function classifyRunLessonWrites(params: {
  headline?: string;
  finalText?: string;
  details?: string[];
  findingCount: number;
  toolCallCount: number;
}): RunLessonWrite[] {
  const finalText = params.finalText?.trim() ?? "";
  const headline = params.headline?.trim() ?? "";
  const details = params.details ?? [];
  const combined = [headline, finalText, ...details].filter(Boolean).join(" ").trim();

  if (params.findingCount > 0 || (combined && !looksLikeNoFinding(combined))) {
    return [
      {
        scope: "memory:run-summary",
        confidence: params.findingCount > 0 ? "high" : "medium",
        content: (finalText || combined).slice(0, 2_000),
      },
    ];
  }

  if (params.toolCallCount > 0 && combined) {
    return [
      {
        scope: "episode:no-finding",
        confidence: "low",
        content: combined.slice(0, 600),
        expiresInMs: EPISODIC_NO_FINDING_TTL_MS,
      },
    ];
  }

  if (params.toolCallCount > 0) {
    return [
      {
        scope: "episode:attempted",
        confidence: "low",
        content: headline || "The agent investigated this task but did not produce a durable finding.",
        expiresInMs: EPISODIC_ATTEMPTED_TTL_MS,
      },
    ];
  }

  return [];
}
