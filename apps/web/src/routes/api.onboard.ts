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

  const catalogText = formatToolCatalog(params.toolCatalog);

  return `You are Nochore's agent setup assistant. Help the user create a new agent through a brief, focused conversation.

## Rules
- Ask ONE question at a time
- ALWAYS use the suggest_tools or request_input tools — never write options as plain text
- Never ask more than 4 questions total
- If the user's first message is detailed enough, skip redundant questions and call create_agent
- Be concise: 1-2 sentences of context before calling a tool
- When you have enough info, call create_agent immediately — don't ask for confirmation
- After calling create_agent, say one short sentence like "Done — your agent is ready." Do NOT list a summary or ask follow-up questions.

## Conversation flow
1. The user already described what the agent should do (their first message). Analyze their intent.
2. Call suggest_tools with recommended tools based on the user's intent. Pre-select (recommended: true) tools you think are needed. Include a few non-recommended (recommended: false) tools the user might also want. Always consider whether a notification channel (Slack or Gmail) is needed.
3. Call request_input to ask about autonomy level: Conservative (approve all writes), Balanced (auto-read, approve writes), Autonomous (auto-approve everything)
4. Call request_input to ask about schedule: Manual, Hourly, Daily, Weekly
5. Call create_agent with all gathered info.

## Tool recommendation guidelines
- "monitor", "track", "report", "alert" → read tools + notification channel
- "optimize", "manage", "adjust" → read + write tools
- "spend", "budget" → budget and performance tools
- "keywords", "search terms" → search term and quality score tools
- Always suggest at least one notification channel (Slack preferred) when the agent has reporting/alerting duties
- Fewer tools is better — the user can add more later in the workspace
- Only recommend tools from the catalog below

## Available tools (recommend only what the agent needs)
${catalogText}

## When calling create_agent
- Write detailed, operational instructions. Tell the agent what to monitor, what patterns to look for, how to communicate findings, and what outcome to optimize for.
- Only include tool slugs the user confirmed in the suggest_tools step
- Pick skills that match the agent's job from the available list
- Match schedule to the user's preference

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

        // Strip UI-only tool parts from history — request_input and suggest_tools
        // are rendered client-side; the user's text response carries their selection.
        const cleanedMessages = (rawMessages as Array<{ id?: string; role: string; parts: Array<Record<string, unknown>> }>).map((msg) => ({
          ...msg,
          parts: msg.parts.filter((p) => {
            const type = p.type as string;
            if (type === "tool-request_input" || type === "tool-suggest_tools") return false;
            if (type === "dynamic-tool" && (p.toolName === "request_input" || p.toolName === "suggest_tools")) return false;
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
          tools: {
            request_input: {
              description:
                "Present a set of options to the user and wait for their selection. " +
                "Use this for autonomy level and schedule questions.",
              inputSchema: z.object({
                question: z.string().describe("The question to ask the user"),
                options: z
                  .array(
                    z.object({
                      key: z.string().describe("Single uppercase letter: A, B, C, D, etc. NEVER use slugs or words."),
                      label: z.string().describe("Human-readable option label"),
                    }),
                  )
                  .describe("Available options"),
                multiSelect: z
                  .boolean()
                  .default(false)
                  .describe("Whether the user can pick more than one option"),
              }),
              outputSchema: z.object({
                selectedKeys: z
                  .array(z.string())
                  .describe("The key(s) the user selected"),
              }),
              // No execute — UI-only tool.
            },
            suggest_tools: {
              description:
                "Present recommended tools to the user based on their intent. " +
                "Pre-select (recommended: true) tools you recommend. " +
                "Include a few non-recommended extras the user might want.",
              inputSchema: z.object({
                message: z.string().describe("Brief explanation of your recommendations (1-2 sentences)"),
                tools: z.array(z.object({
                  slug: z.string().describe("Exact tool slug from the catalog"),
                  name: z.string().describe("Human-readable tool name"),
                  reason: z.string().describe("One sentence: why this agent needs this tool"),
                  recommended: z.boolean().default(true).describe("Pre-select as recommended"),
                })),
              }),
              outputSchema: z.object({
                selectedSlugs: z.array(z.string()).describe("Tool slugs the user confirmed"),
              }),
              // No execute — UI-only tool.
            },
            create_agent: {
              description: "Create the agent with the gathered configuration. Call this once you have enough context from the conversation.",
              inputSchema,
              execute: async (input: ToolInput) => {
                const { buildDefaultToolConfig, DEFAULT_TOOL_CAPABILITY_MAP } = await import("../../../../packages/harness/src/connections/capabilities");
                const { createAgent } = await import("~/server/agents");
                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);

                // Build tool config from selected slugs
                const selectedSlugs = input.toolSlugs.length > 0 ? input.toolSlugs : [];
                const catalogMap = new Map(toolCatalog.map((t) => [t.slug, t]));

                const toolEntries: Record<string, {
                  toolName: string;
                  slug: string;
                  provider: string;
                  title: string;
                  description: string;
                  mode: "read" | "write";
                  enabled: boolean;
                  approvalMode: "auto" | "approval" | "blocked";
                }> = {};

                for (const slug of selectedSlugs) {
                  // Check hardcoded capabilities first (has schemas + approval modes)
                  const hardcoded = DEFAULT_TOOL_CAPABILITY_MAP.get(
                    slug.toLowerCase().replace(/_/g, "_"),
                  );
                  // Also try matching by slug field
                  let matchedHardcoded = hardcoded;
                  if (!matchedHardcoded) {
                    for (const [, cap] of DEFAULT_TOOL_CAPABILITY_MAP) {
                      if (cap.slug === slug) {
                        matchedHardcoded = cap;
                        break;
                      }
                    }
                  }

                  if (matchedHardcoded) {
                    toolEntries[matchedHardcoded.toolName] = {
                      toolName: matchedHardcoded.toolName,
                      slug: matchedHardcoded.slug,
                      provider: matchedHardcoded.provider,
                      title: matchedHardcoded.title,
                      description: matchedHardcoded.description,
                      mode: matchedHardcoded.mode,
                      enabled: true,
                      approvalMode: matchedHardcoded.defaultApprovalMode,
                    };
                  } else {
                    // Use catalog metadata for tools not in hardcoded list
                    const catalogTool = catalogMap.get(slug);
                    if (catalogTool) {
                      const mode = inferToolMode(catalogTool);
                      const toolName = slug.toLowerCase();
                      toolEntries[toolName] = {
                        toolName,
                        slug,
                        provider: catalogTool.provider,
                        title: catalogTool.name,
                        description: catalogTool.description,
                        mode,
                        enabled: true,
                        approvalMode: mode === "read" ? "auto" : "approval",
                      };
                    }
                  }
                }

                // Derive providers from selected tools, include logos from catalog
                const providers = [...new Set(Object.values(toolEntries).map((t) => t.provider))];
                const logoByProvider = new Map(toolCatalog.map((t) => [t.provider, t.providerLogo]));
                const requiredProviders = providers.map((p) => ({
                  provider: p,
                  reason: PROVIDER_REASONS[p] ?? `Required for ${p} tools`,
                  logo: logoByProvider.get(p) ?? undefined,
                }));

                const toolConfig = { requiredProviders, tools: toolEntries };

                // Apply autonomy overrides
                if (input.autonomyLevel === "autonomous") {
                  for (const entry of Object.values(toolConfig.tools)) {
                    entry.approvalMode = "auto";
                  }
                } else if (input.autonomyLevel === "conservative") {
                  for (const entry of Object.values(toolConfig.tools)) {
                    entry.approvalMode = "approval";
                  }
                }

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
