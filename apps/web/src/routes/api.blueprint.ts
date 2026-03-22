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

export const BlueprintSchema = z.object({
  agentName: z.string().describe("A short, memorable name for the agent"),
  summary: z.string().describe("One-sentence description of what the agent does"),
  skills: z.array(z.string()).describe("Array of skill IDs to enable from the available list"),
  connections: z.array(
    z.object({
      provider: z.string().describe("Provider slug: googleads, slack, meta, ga4, shopify, stripe, github"),
      reason: z.string().describe("Why this connection is needed"),
    }),
  ).describe("External service connections the agent needs"),
  policies: z.array(
    z.object({
      action: z.string().describe("The action this policy governs"),
      question: z.string().describe("Natural language question framed as 'When I [action]...' from the agent's perspective"),
      defaultLevel: z.enum(["auto", "ask", "notify"]).describe("auto for low-risk, ask for high-impact, notify for informational"),
    }),
  ).describe("1-3 autonomy rules for the agent"),
  schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;

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

        const prompt = `You are configuring an AI agent for a business user. Analyze their intent, then call the create_blueprint tool with a complete agent configuration.

User's intent: "${intent}"
${clarification ? `\nUser's clarification: "${clarification}"` : ""}

Available skills (select by id):
${skillsList || "No skills registered yet."}

Available connections (select by provider slug):
- googleads: Google Ads — campaign data, search terms, budgets, performance metrics
- slack: Slack — notifications, alerts, team messaging
- meta: Meta Ads — Facebook/Instagram ad campaigns and performance
- ga4: Google Analytics 4 — website traffic, conversions, user behavior
- shopify: Shopify — orders, products, inventory, revenue
- stripe: Stripe — payments, subscriptions, revenue data
- github: GitHub — repositories, issues, pull requests, deployments

${existingConnections.length ? `Already connected: ${existingConnections.join(", ")}` : "No existing connections."}

Call create_blueprint with your configuration. Select ONLY skills and connections the agent actually needs.`;

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
                  // Complete tool call — send final blueprint
                  const input = event.input as Record<string, unknown>;
                  send({ _type: "blueprint", ...input });
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
