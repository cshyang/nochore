import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export const EPISODIC_NO_FINDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EPISODIC_ATTEMPTED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface RunLessonWrite {
  scope: string;
  confidence: "high" | "medium" | "low";
  content: string;
  expiresInMs?: number;
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

export function classifyEpisodicLesson(params: {
  headline?: string;
  finalText?: string;
  details?: string[];
  toolCallCount: number;
}): RunLessonWrite[] {
  const headline = params.headline?.trim() ?? "";
  const finalText = params.finalText?.trim() ?? "";
  const details = params.details ?? [];
  const combined = [headline, finalText, ...details].filter(Boolean).join(" ").trim();

  if (params.toolCallCount === 0) {
    return [];
  }

  if (combined) {
    return [
      {
        scope: "episode:no-finding",
        confidence: "low",
        content: combined.slice(0, 600),
        expiresInMs: EPISODIC_NO_FINDING_TTL_MS,
      },
    ];
  }

  return [
    {
      scope: "episode:attempted",
      confidence: "low",
      content: headline || "The agent investigated this task but did not produce a durable finding.",
      expiresInMs: EPISODIC_ATTEMPTED_TTL_MS,
    },
  ];
}

const RUN_INSIGHT_EXTRACTION_SCHEMA = z.object({
  insights: z
    .array(
      z.object({
        content: z.string().min(1).max(240),
        confidence: z.enum(["high", "medium"]).default("medium"),
      }),
    )
    .max(3),
});

const RUN_INSIGHT_EXTRACTION_PROMPT = `Extract 1-3 atomic learnings from this agent run that would help future runs of the same agent.

A good insight is a specific, evidence-backed pattern the agent can act on next time.
Examples:
- "'pte ltd' as a phrase-negative eliminates ~40% of competitor-brand waste"
- "Quality Score <3 keywords cost 25-50% more per click; pause before tuning bids"

Not an insight:
- An action report: "Paused campaign X, added negative keywords"
- A data restatement: "Account CPA was $75.43"
- A recommendation aimed at the operator: "User should review landing page QS"

Rules:
- Return zero items when there is no durable learning worth storing
- Prefer fewer, higher-confidence insights over more low-confidence ones
- Do not repeat insights from the existing list (see below)
- Keep each insight self-contained and ≤240 characters`;

export async function extractRunInsights(params: {
  model: LanguageModel;
  headline?: string;
  finalText?: string;
  details?: string[];
  existingInsights?: string[];
}): Promise<RunLessonWrite[]> {
  const headline = params.headline?.trim() ?? "";
  const finalText = params.finalText?.trim() ?? "";
  const details = params.details ?? [];
  const combined = [headline, finalText, ...details].filter(Boolean).join(" ").trim();

  if (!combined) {
    return [];
  }

  const existing = (params.existingInsights ?? []).filter((entry) => entry.trim().length > 0);
  const existingBlock =
    existing.length > 0
      ? `\n\n<existing-insights>\n${existing.map((entry) => `- ${entry}`).join("\n")}\n</existing-insights>`
      : "";

  const extracted = await generateObject({
    model: params.model,
    schema: RUN_INSIGHT_EXTRACTION_SCHEMA,
    prompt: `${RUN_INSIGHT_EXTRACTION_PROMPT}${existingBlock}\n\n<run-headline>\n${headline}\n</run-headline>\n\n<run-output>\n${finalText.slice(0, 6000)}\n</run-output>`,
    maxOutputTokens: 500,
    temperature: 0,
  }).catch(() => null);

  if (!extracted) {
    return [];
  }

  return extracted.object.insights.map((insight) => ({
    scope: "memory:insight",
    confidence: insight.confidence,
    content: insight.content,
  }));
}
