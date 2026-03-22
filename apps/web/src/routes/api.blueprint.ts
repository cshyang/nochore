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
import { streamText, tool } from "ai";
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

// Tool schema — flat, simple, easy for the model to fill
export const BlueprintSchema = z.object({
  agentName: z.string().describe("A short, memorable name for the agent"),
  summary: z.string().describe("One-sentence description of what the agent does"),
  skills: z.array(z.string()).describe("Skill IDs to enable, from the available list"),
  connections: z.array(z.string()).describe("Provider slugs the agent needs: googleads, slack, meta, ga4, shopify, stripe, github"),
  schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;

// Full blueprint with platform-generated policies + connection details
// This is what the client works with after we expand the tool output
export interface ExpandedBlueprint {
  agentName: string;
  summary: string;
  skills: string[];
  connections: Array<{ provider: string; reason: string }>;
  policies: Array<{ action: string; question: string; defaultLevel: "auto" | "ask" | "notify" }>;
  schedule: "hourly" | "6hours" | "daily" | "weekly" | "manual";
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

// Default policies generated from skills + connections
function generateDefaultPolicies(
  skills: string[],
  connections: string[],
): ExpandedBlueprint["policies"] {
  const policies: ExpandedBlueprint["policies"] = [];

  if (skills.includes("search_terms")) {
    policies.push({
      action: "add-negatives",
      question: "When I find wasteful search terms, should I add negative keywords?",
      defaultLevel: "ask",
    });
  }

  if (connections.includes("googleads")) {
    policies.push({
      action: "budget-changes",
      question: "When I spot budget inefficiencies, should I adjust spend?",
      defaultLevel: "ask",
    });
  }

  if (connections.includes("slack")) {
    policies.push({
      action: "send-alerts",
      question: "When I find something noteworthy, should I notify your team?",
      defaultLevel: "auto",
    });
  }

  // Always add a general monitoring policy if none generated
  if (policies.length === 0) {
    policies.push({
      action: "report-findings",
      question: "When I find issues, should I report them automatically?",
      defaultLevel: "notify",
    });
  }

  return policies;
}

// Expand flat blueprint → full blueprint with policies + connection details
function expandBlueprint(raw: Blueprint): ExpandedBlueprint {
  return {
    agentName: raw.agentName,
    summary: raw.summary,
    skills: raw.skills,
    connections: raw.connections.map((slug) => ({
      provider: slug,
      reason: PROVIDER_INFO[slug]?.reason ?? "Required for this agent",
    })),
    policies: generateDefaultPolicies(raw.skills, raw.connections),
    schedule: raw.schedule,
  };
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

        const prompt = `Configure an AI agent for a business user. Analyze their intent, pick the right skills and connections, then call create_blueprint.

User's intent: "${intent}"
${clarification ? `\nClarification: "${clarification}"` : ""}

Available skills:
${skillsList || "None available yet."}

Available connections:
googleads, slack, meta, ga4, shopify, stripe, github

${existingConnections.length ? `Already connected: ${existingConnections.join(", ")}` : ""}

Give the agent a clear name and summary. Select ONLY skills and connections it actually needs.`;

        const providerName = process.env.LLM_PROVIDER ?? "anthropic";

        const result = streamText({
          model,
          prompt,
          tools: {
            create_blueprint: tool({
              description: "Create an agent blueprint based on the user's intent",
              inputSchema: BlueprintSchema,
            }),
          },
          toolChoice: { type: "tool", toolName: "create_blueprint" },
          providerOptions: {
            [providerName]: {
              reasoningEffort: "high",
            },
          },
        });

        // Stream NDJSON: reasoning events + tool argument partials
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
                } else if (event.type === "tool-input-start") {
                  toolArgs = "";
                } else if (event.type === "tool-input-delta") {
                  toolArgs += event.delta;

                  // Try parsing partial tool arguments as blueprint
                  try {
                    const partial = JSON.parse(toolArgs);
                    send({ _type: "blueprint", ...partial });
                  } catch {
                    // Not valid JSON yet
                  }
                } else if (event.type === "tool-call") {
                  // Complete tool call — expand and send final blueprint
                  const expanded = expandBlueprint(event.input as Blueprint);
                  send({ _type: "blueprint", ...expanded });
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
