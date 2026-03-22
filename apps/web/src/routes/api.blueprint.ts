/**
 * Streaming blueprint generation endpoint.
 *
 * Uses Vercel AI SDK's streamText + Output.object() to stream partial
 * blueprint objects as they're generated. The client consumes this via
 * the useObject hook from @ai-sdk/react.
 *
 * POST /api/blueprint
 * Body: { intent, clarification?, availableSkills, existingConnections? }
 * Returns: SSE stream of partial Blueprint objects
 */

import { createFileRoute } from "@tanstack/react-router";
import { streamText, Output } from "ai";
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
// Blueprint schema
// ---------------------------------------------------------------------------

export const BlueprintSchema = z.object({
  projectName: z.string().optional().describe("Project or client name extracted from the intent"),
  summary: z.string().describe("One-sentence description of what the agent does"),
  agentName: z.string().describe("A short, memorable name for the agent"),
  skills: z.array(z.string()).describe("Array of skill IDs to enable"),
  connections: z.array(
    z.object({
      provider: z.string().describe("Provider slug: googleads, slack, meta, ga4, shopify, stripe, github"),
      reason: z.string().describe("Why this connection is needed"),
    }),
  ).describe("External service connections the agent needs"),
  policies: z.array(
    z.object({
      action: z.string().describe("The action this policy governs"),
      question: z.string().describe("Natural language question framed as 'When I [action]...'"),
      defaultLevel: z.enum(["auto", "ask", "notify"]).describe("Default autonomy level"),
    }),
  ).describe("1-3 autonomy rules for the agent"),
  schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
  clarifyingQuestion: z.string().optional().describe("Only include if genuinely needed to understand the intent"),
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

        const prompt = `You are configuring an AI agent for a business user. Based on their intent, generate a complete agent configuration.

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

Instructions:
- Select relevant skills from the available list by their id. If no skills match, return an empty array.
- For connections, suggest ONLY providers the agent actually needs based on the intent. Don't add connections just because they exist.
- For policies, generate 1-3 rules about autonomy. Frame each question as "When I [action]..." from the agent's perspective. Set defaultLevel to "auto" for low-risk actions, "ask" for high-impact changes, "notify" for informational actions.
- Choose a schedule that matches the urgency of the use case.
- Do NOT include clarifyingQuestion unless you genuinely cannot determine the agent's purpose.`;

        const providerName = process.env.LLM_PROVIDER ?? "anthropic";

        const result = streamText({
          model,
          output: Output.object({ schema: BlueprintSchema }),
          prompt,
          providerOptions: {
            [providerName]: {
              reasoningEffort: "high",
            },
          },
        });

        // Stream NDJSON lines: partial blueprint objects + reasoning events
        // Line types:
        //   { _type: "reasoning", text: "..." }   — model thinking (if supported)
        //   { _type: "blueprint", ...partialObj }  — progressive blueprint snapshot
        //   { _error: "..." }                      — error
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
            };

            let accumulatedText = "";
            let lastPartialJson = "";
            let chunkCount = 0;

            try {
              for await (const event of result.fullStream) {
                if (event.type === "reasoning-delta") {
                  send({ _type: "reasoning", text: event.text });
                } else if (event.type === "text-delta") {
                  accumulatedText += event.text;

                  // Try parsing accumulated text as JSON for partial blueprint
                  try {
                    const partial = JSON.parse(accumulatedText);
                    const json = JSON.stringify(partial);
                    if (json !== lastPartialJson) {
                      lastPartialJson = json;
                      chunkCount++;
                      send({ _type: "blueprint", ...partial });
                    }
                  } catch {
                    // Not valid JSON yet — keep accumulating
                  }
                }
              }

              // Final parse for complete object
              try {
                const final = JSON.parse(accumulatedText);
                send({ _type: "blueprint", ...final });
                console.log(`[blueprint api] stream complete: ${chunkCount} partials, keys: ${Object.keys(final).join(", ")}`);
              } catch {
                console.warn(`[blueprint api] final parse failed, sent ${chunkCount} partials. Raw text (first 200): ${accumulatedText.slice(0, 200)}`);
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
