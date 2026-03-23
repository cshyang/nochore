/**
 * Streaming blueprint generation endpoint.
 *
 * Uses AI SDK tool calling — the model reasons about the intent,
 * then calls create_blueprint with schema-conforming arguments.
 * Tool call arguments are enforced by the model's function-calling
 * machinery, so field names are exact. No client normalization needed.
 *
 * POST /api/blueprint
 * Body: { intent, clarification?, availableSkills, existingConnections? }
 * Returns: NDJSON stream of reasoning + blueprint partials
 */

import { createFileRoute } from "@tanstack/react-router";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// createModel — ESM-compatible, respects LLM_PROVIDER env var
// ---------------------------------------------------------------------------

async function createModel() {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  switch (provider) {
    case "zai": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      const zai = createOpenAICompatible({
        name: "zai",
        baseURL:
          process.env.LLM_BASE_URL ??
          "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
      });
      return zai(process.env.LLM_MODEL ?? "glm-4.7");
    }
    case "openai": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      const openai = createOpenAICompatible({
        name: "openai",
        baseURL:
          process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
      });
      return openai(process.env.LLM_MODEL ?? "gpt-4o");
    }
    case "anthropic":
    default: {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic();
      return anthropic(
        process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Blueprint schema — used as tool parameters (contract, not suggestion)
// ---------------------------------------------------------------------------

// Tool input schema — flat, simple, what the model fills in
// Keep this minimal: only decisions the model MUST make.
// Everything else (instructions, guardrails, notifications, trigger) is platform-generated.
const ToolInputSchema = z.object({
  agentName: z.string().describe("A short, memorable name for the agent"),
  summary: z.string().describe("One-sentence description of what the agent does"),
  skills: z.array(z.string()).describe("Skill IDs to enable, from the available list"),
  connections: z.array(z.string()).describe("Provider slugs the agent needs, from the available connections list. Only include connections the agent genuinely requires."),
  schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
});

type ToolInput = z.infer<typeof ToolInputSchema>;

// Blueprint — what the client works with (tool output + platform-generated config)
export interface Blueprint {
  agentName: string;
  summary: string;
  skills: string[];
  connections: Array<{ provider: string; reason: string }>;
  guardrails: Array<{ action: string; question: string; defaultLevel: "auto" | "ask" | "block" }>;
  notifications: { inApp: boolean; email: boolean; slack: boolean };
  trigger: {
    type: "scheduled" | "webhook" | "manual";
    schedule?: "hourly" | "6hours" | "daily" | "weekly";
  };
}

// Provider descriptions — used to generate connection reasons
const PROVIDER_INFO: Record<string, { name: string; reason: string }> = {
  googleads: { name: "Google Ads", reason: "Pull campaign data, search terms, and budget metrics" },
  slack: { name: "Slack", reason: "Send alerts and reports to your team" },
  meta: { name: "Meta Ads", reason: "Monitor Facebook/Instagram ad performance" },
  ga4: { name: "Google Analytics", reason: "Track website traffic and conversions" },
  shopify: { name: "Shopify", reason: "Monitor orders, inventory, and revenue" },
  stripe: { name: "Stripe", reason: "Track payments and subscription metrics" },
  github: { name: "GitHub", reason: "Monitor repository activity and deployments" },
};

// Default guardrails generated from skills + connections
function generateDefaultGuardrails(
  skills: string[] = [],
  connections: string[] = [],
): Blueprint["guardrails"] {
  const guardrails: Blueprint["guardrails"] = [];

  if (skills.includes("search_terms")) {
    guardrails.push({
      action: "add-negatives",
      question: "Add negative keywords when wasteful search terms are found",
      defaultLevel: "ask",
    });
  }

  if (connections.includes("googleads")) {
    guardrails.push({
      action: "budget-changes",
      question: "Adjust spend when budget inefficiencies are detected",
      defaultLevel: "ask",
    });
  }

  if (connections.includes("slack")) {
    guardrails.push({
      action: "send-alerts",
      question: "Send notifications when noteworthy findings occur",
      defaultLevel: "auto",
    });
  }

  // Always add a general monitoring guardrail if none generated
  if (guardrails.length === 0) {
    guardrails.push({
      action: "report-findings",
      question: "Report issues when found",
      defaultLevel: "auto",
    });
  }

  return guardrails;
}

// Expand flat tool input → full blueprint with platform-generated config
function expandBlueprint(raw: ToolInput): Blueprint {
  const skills = raw.skills ?? [];
  const connections = raw.connections ?? [];
  const isManual = raw.schedule === "manual";

  return {
    agentName: raw.agentName ?? "",
    summary: raw.summary ?? "",
    skills,
    connections: connections.map((slug) => ({
      provider: slug,
      reason: PROVIDER_INFO[slug]?.reason ?? "Required for this agent",
    })),
    guardrails: generateDefaultGuardrails(skills, connections),
    notifications: { inApp: true, email: false, slack: connections.includes("slack") },
    trigger: isManual
      ? { type: "manual" }
      : { type: "scheduled", schedule: raw.schedule as Blueprint["trigger"]["schedule"] },
  };
}

// ---------------------------------------------------------------------------
// Fuzzy skill matching — model may return variations of skill IDs
// ---------------------------------------------------------------------------

function resolveSkillIds(
  modelSkills: string[],
  available: Array<{ id: string; name: string }>,
): string[] {
  if (!modelSkills?.length || !available?.length) return [];

  const resolved: string[] = [];
  for (const raw of modelSkills) {
    const lower = raw.toLowerCase().replace(/[-_\s]/g, "");
    // Exact match first
    const exact = available.find((s) => s.id === raw);
    if (exact) { resolved.push(exact.id); continue; }
    // Fuzzy: normalize both sides and compare
    const fuzzy = available.find((s) => {
      const normId = s.id.toLowerCase().replace(/[-_\s]/g, "");
      const normName = s.name.toLowerCase().replace(/[-_\s]/g, "");
      return normId === lower || normName === lower || normId.includes(lower) || lower.includes(normId);
    });
    if (fuzzy) resolved.push(fuzzy.id);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// API route handler
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/blueprint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const {
          intent,
          clarification,
          availableSkills = [],
          existingConnections = [],
        } = body as {
          intent: string;
          clarification?: string;
          availableSkills: Array<{
            id: string;
            name: string;
            description: string;
          }>;
          existingConnections?: string[];
        };

        const model = await createModel();

        const skillsList = availableSkills
          .map(
            (s: { id: string; name: string; description: string }) =>
              `- ${s.id}: ${s.name} — ${s.description}`,
          )
          .join("\n");

        const connectionsList = Object.entries(PROVIDER_INFO)
          .map(([slug, info]) => `- ${slug}: ${info.name} — ${info.reason}`)
          .join("\n");

        const prompt = `You are the agent designer for Nochore, an AI agent platform. Agents have an LLM brain (powered by their summary/instructions), optional skills for structured tasks, and optional connections for API integrations. Agents can do anything describable in instructions — skills and connections just make them better at specific things.

User said: "${intent}"
${clarification ? `\nAdditional context: "${clarification}"` : ""}

${skillsList ? `Available skills:\n${skillsList}\n` : ""}${connectionsList ? `Available connections:\n${connectionsList}\n` : ""}${existingConnections.length ? `Already connected: ${existingConnections.join(", ")}\n` : ""}
The summary field becomes the agent's system prompt — it must be specific and detailed enough that the agent knows exactly what to do. If the user's request is too vague to write a good summary (e.g. missing topic, audience, or workflow details), ask what you need to know first. Only one question at a time. Prefer multiple choice when possible.`;

        const providerName = process.env.LLM_PROVIDER ?? "anthropic";

        const result = streamText({
          model,
          prompt,
          stopWhen: stepCountIs(5),
          tools: {
            create_blueprint: tool({
              description: "Create an agent blueprint with a detailed summary that becomes the agent's system prompt. Call when you understand the intent well enough to write actionable instructions.",
              inputSchema: ToolInputSchema,
              execute: async (input) => {
                if (!input.agentName?.trim()) {
                  return { success: false, error: "Agent name is required." };
                }
                if (!input.summary?.trim()) {
                  return { success: false, error: "Summary is required." };
                }

                // Resolve skills (fuzzy match) — empty is fine
                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);
                // Filter to known connections — silently drop unknown ones
                const validConnections = (input.connections ?? []).filter(
                  (c) => c in PROVIDER_INFO,
                );

                const expanded = expandBlueprint(
                  { ...input, skills: resolvedSkills, connections: validConnections },
                );
                return { success: true, blueprint: expanded };
              },
            }),
          },
          providerOptions: {
            [providerName]: {
              reasoningEffort: "high",
            },
          },
        });

        // Stream NDJSON: reasoning, tool-status, blueprint, text events
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
            };

            let toolArgs = "";

            try {
              for await (const event of result.fullStream) {
                if (event.type === "reasoning-delta") {
                  send({ _type: "reasoning", text: event.text });
                } else if (event.type === "text-delta") {
                  send({ _type: "text", text: event.text });
                } else if (event.type === "tool-input-start") {
                  toolArgs = "";
                  send({ _type: "tool-status", text: "Creating blueprint..." });
                } else if (event.type === "tool-input-delta") {
                  toolArgs += event.delta;
                  try {
                    const partial = JSON.parse(toolArgs);
                    send({ _type: "blueprint", ...partial });
                  } catch {
                    // Not valid JSON yet
                  }
                } else if (event.type === "tool-result") {
                  const res = (event as { output: unknown }).output as { success: boolean; blueprint?: Blueprint; error?: string };
                  if (res?.success && res.blueprint) {
                    send({ _type: "tool-status", text: "Blueprint validated" });
                    send({ _type: "blueprint", ...res.blueprint });
                  } else if (res?.error) {
                    send({ _type: "tool-status", text: `Fixing: ${res.error}` });
                  }
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Stream error";
              send({ _error: msg });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
