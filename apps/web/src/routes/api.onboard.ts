/**
 * Conversational agent onboarding endpoint.
 *
 * Multi-turn chat using Vercel AI SDK v6 streamText + useChat protocol.
 * The LLM analyzes intent, suggests tools, then calls create_agent to finalize.
 */

import { createFileRoute } from "@tanstack/react-router";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import crypto from "node:crypto";
import type { ComposioToolMeta } from "~/server/connections";

const PROVIDER_REASONS: Record<string, string> = {
  googleads: "Read campaign performance and adjust paid media execution",
  meta: "Monitor and adjust Meta campaign execution",
  slack: "Send approval requests and findings to the team",
  gmail: "Send approval requests and finding summaries by email",
  ga4: "Use website conversion and traffic context in decisions",
  shopify: "Use storefront order and revenue context in analysis",
  stripe: "Use payments and subscription data as operating context",
  github: "Inspect repository and deployment activity when required",
  googlesearchconsole: "Read organic search performance, queries, and indexing data",
  tiktok: "Monitor and adjust TikTok ad campaigns",
};

async function createModel() {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  switch (provider) {
    case "zai": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const zai = createOpenAICompatible({
        name: "zai",
        baseURL: process.env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
      });
      return zai(process.env.LLM_MODEL ?? "glm-4.7");
    }
    case "openai": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const openai = createOpenAICompatible({
        name: "openai",
        baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
      });
      return openai(process.env.LLM_MODEL ?? "gpt-4o");
    }
    case "anthropic":
    default: {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic();
      return anthropic(process.env.LLM_MODEL ?? "claude-sonnet-4-20250514");
    }
  }
}

function formatToolCatalog(toolCatalog: ComposioToolMeta[]): string {
  if (!toolCatalog.length) return "No tools available.";

  const byProvider = new Map<string, ComposioToolMeta[]>();
  for (const tool of toolCatalog) {
    const list = byProvider.get(tool.provider) ?? [];
    list.push(tool);
    byProvider.set(tool.provider, list);
  }

  const sections: string[] = [];
  for (const [provider, tools] of byProvider) {
    const providerName = tools[0]?.providerName ?? provider;
    const lines = tools.map(
      (t) => `- ${t.slug}: "${t.name}" — ${t.description}`,
    );
    sections.push(`### ${providerName} (provider: ${provider})\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

function buildSystemPrompt(params: {
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolCatalog: ComposioToolMeta[];
}) {
  const skillsList = params.availableSkills
    .map((s) => `- ${s.id}: ${s.name} — ${s.description}`)
    .join("\n");

  const NOTIFICATION_PROVIDERS = new Set(["slack", "gmail", "outlook", "telegram", "whatsapp"]);
  const dataTools = params.toolCatalog.filter((t) => !NOTIFICATION_PROVIDERS.has(t.provider));
  const notificationTools = params.toolCatalog.filter((t) => NOTIFICATION_PROVIDERS.has(t.provider));

  const catalogText = formatToolCatalog(dataTools);
  const notificationText = notificationTools.length
    ? notificationTools.map((t) => `- ${t.slug}: "${t.name}" (${t.providerName})`).join("\n")
    : "none available";

  return `You are Nochore's agent setup assistant. Understand what the user wants their agent to do, gather what you need, then call create_agent.

Use request_input to present choices. One question per message — wait for the response before the next. Be concise. When you have enough, call create_agent — don't summarize or ask for confirmation.

You need to determine: which tools the agent needs, how the user wants updates (ask — don't assume), autonomy level (conservative/balanced/autonomous), and schedule. Skip what's obvious from context.

## Data sources
${catalogText}

## Notification channels
${notificationText}

## Available skills
${skillsList || "none available"}

## Already connected providers
${params.existingConnections.length ? params.existingConnections.join(", ") : "none yet"}`;
}

function resolveSkillIds(
  modelSkills: string[],
  available: Array<{ id: string; name: string }>,
): string[] {
  if (!modelSkills.length || !available.length) return [];
  const resolved: string[] = [];
  for (const raw of modelSkills) {
    const lower = raw.toLowerCase().replace(/[-_\s]/g, "");
    const exact = available.find((s) => s.id === raw);
    if (exact) { resolved.push(exact.id); continue; }
    const fuzzy = available.find((s) => {
      const normId = s.id.toLowerCase().replace(/[-_\s]/g, "");
      const normName = s.name.toLowerCase().replace(/[-_\s]/g, "");
      return normId === lower || normName === lower || normId.includes(lower) || lower.includes(normId);
    });
    if (fuzzy) resolved.push(fuzzy.id);
  }
  return Array.from(new Set(resolved));
}

function inferToolMode(tool: ComposioToolMeta): "read" | "write" {
  const slug = tool.slug.toUpperCase();
  const tags = tool.tags.map((t) => t.toLowerCase());
  if (tags.includes("read") || tags.includes("important")) return "read";
  if (tags.includes("write")) return "write";
  if (/^(GET_|LIST_|SEARCH_|FETCH_|READ_|FIND_)/.test(slug)) return "read";
  if (/_GET_|_LIST_|_SEARCH_|_FETCH_|_READ_|_FIND_/.test(slug)) return "read";
  if (/REPORT|PERFORMANCE|METRICS|ANALYTICS|STATUS|SCORE/.test(slug)) return "read";
  return "write";
}

export const Route = createFileRoute("/api/onboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const {
          messages: rawMessages,
          projectId,
          availableSkills = [],
          existingConnections = [],
          toolCatalog = [],
        } = body as {
          messages: Array<{ id?: string; role: string; parts: unknown[] }>;
          projectId: string;
          availableSkills: Array<{ id: string; name: string; description: string }>;
          existingConnections: string[];
          toolCatalog: ComposioToolMeta[];
        };

        const model = await createModel();
        const system = buildSystemPrompt({ availableSkills, existingConnections, toolCatalog });

        // Strip request_input tool parts from history — rendered client-side;
        // the user's text response carries their selection.
        const cleanedMessages = (rawMessages as Array<{ id?: string; role: string; parts: Array<Record<string, unknown>> }>).map((msg) => ({
          ...msg,
          parts: msg.parts.filter((p) => {
            const type = p.type as string;
            if (type === "tool-request_input") return false;
            if (type === "dynamic-tool" && p.toolName === "request_input") return false;
            return true;
          }),
        })).filter((msg) => msg.parts.length > 0);

        const modelMessages = await convertToModelMessages(
          cleanedMessages as UIMessage[],
        );

        const inputSchema = z.object({
          name: z.string().min(1).describe("A short, memorable agent name"),
          description: z.string().min(1).describe("A concise one-sentence summary"),
          instructions: z.string().min(1).describe("Detailed operational instructions (markdown)"),
          skills: z.array(z.string()).default([]).describe("Skill IDs from available skills"),
          toolSlugs: z.array(z.string()).default([]).describe("Tool slugs selected by the user from suggest_tools"),
          schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("Run schedule"),
          autonomyLevel: z.enum(["conservative", "balanced", "autonomous"]).describe("How much autonomy"),
        });

        type ToolInput = z.infer<typeof inputSchema>;

        const result = streamText({
          model,
          system,
          messages: modelMessages,
          stopWhen: stepCountIs(3),
          providerOptions: {
            anthropic: { effort: "medium" },
          },
          tools: {
            request_input: {
              description:
                "Present options to the user and wait for their selection. " +
                "For tool recommendations, use multiSelect with description and selected fields. " +
                "For simple choices (autonomy, schedule), omit description.",
              inputSchema: z.object({
                question: z.string().describe("The question or context to show the user"),
                options: z
                  .array(
                    z.object({
                      key: z.string().describe("Unique key for this option (slug, letter, or short id)"),
                      label: z.string().describe("Human-readable option label"),
                      description: z.string().optional().describe("Optional subtitle explaining this option"),
                      selected: z.boolean().optional().describe("Pre-select this option (for recommendations)"),
                    }),
                  )
                  .describe("Available options"),
                multiSelect: z
                  .boolean()
                  .default(false)
                  .describe("True = checkboxes (pick many), false = radio (pick one)"),
              }),
              outputSchema: z.object({
                selectedKeys: z
                  .array(z.string())
                  .describe("The key(s) the user selected"),
              }),
              // No execute — UI-only tool.
            },
            create_agent: {
              description: "Create the agent with the gathered configuration. Call this once you have enough context from the conversation.",
              inputSchema,
              execute: async (input: ToolInput) => {
                const { createAgent } = await import("~/server/agents");
                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);

                // Derive providers from selected tool slugs
                const selectedSlugs = input.toolSlugs.length > 0 ? input.toolSlugs : [];
                const catalogMap = new Map(toolCatalog.map((t) => [t.slug, t]));
                const providers = [...new Set(
                  selectedSlugs
                    .map((slug) => catalogMap.get(slug)?.provider)
                    .filter((p): p is string => !!p),
                )];
                const logoByProvider = new Map(toolCatalog.map((t) => [t.provider, t.providerLogo]));
                const requiredProviders = providers.map((p) => ({
                  provider: p,
                  reason: PROVIDER_REASONS[p] ?? `Required for ${p} tools`,
                  logo: logoByProvider.get(p) ?? undefined,
                }));

                // Composio is the source of truth for tools — we only store provider-level config
                const toolConfig = { requiredProviders, tools: {} };

                const result = await createAgent({
                  data: {
                    projectId,
                    name: input.name.trim(),
                    description: input.description.trim(),
                    instructions: input.instructions.trim(),
                    skills: resolvedSkills,
                    toolConfig,
                    requiredProviders,
                    notificationConfig: {
                      inApp: true,
                      email: providers.includes("gmail"),
                      slack: providers.includes("slack"),
                    },
                    schedule: input.schedule,
                    status: "draft",
                  },
                });
                const agentId = (result as { id?: string })?.id;

                return { success: true as const, agentId };
              },
            },
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
