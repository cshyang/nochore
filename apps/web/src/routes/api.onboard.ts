/**
 * Conversational agent onboarding endpoint.
 *
 * Multi-turn chat using Vercel AI SDK v6 streamText + useChat protocol.
 * The LLM clarifies intent, searches for tools, then calls create_agent.
 */

import { createAiSdkModel } from "@nochore/harness";
import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { convertToModelMessages, hasToolCall, stepCountIs, streamText } from "ai";
import { z } from "zod";
import type { ToolkitSummary } from "~/server/onboard-prompt";
import { buildOnboardingSystemPrompt } from "~/server/onboard-prompt";

type AvailableSkill = {
  id: string;
  name: string;
  description: string;
};

type IncomingMessage = {
  id?: string;
  role: string;
  parts: unknown[];
};

type MessagePart = Record<string, unknown>;

type OnboardingRequestBody = {
  messages: IncomingMessage[];
  projectId: string;
  availableSkills?: AvailableSkill[];
  existingConnections?: string[];
  toolkitSummaries?: ToolkitSummary[];
};

function resolveSkillIds(modelSkills: string[], available: Array<{ id: string; name: string }>): string[] {
  if (!modelSkills.length || !available.length) return [];
  const resolved: string[] = [];
  for (const raw of modelSkills) {
    const lower = normalizeSkillToken(raw);
    const exact = available.find((s) => s.id === raw);
    if (exact) {
      resolved.push(exact.id);
      continue;
    }
    const fuzzy = available.find((s) => {
      const normId = normalizeSkillToken(s.id);
      const normName = normalizeSkillToken(s.name);
      return normId === lower || normName === lower || normId.includes(lower) || lower.includes(normId);
    });
    if (fuzzy) resolved.push(fuzzy.id);
  }
  return Array.from(new Set(resolved));
}

function normalizeSkillToken(value: string) {
  return value.toLowerCase().replace(/[-_\s]/g, "");
}

/** Strip request_input tool parts that haven't been answered yet (no output).
 *  Parts with output-available are kept — convertToModelMessages turns them
 *  into proper tool-call + tool-result pairs so the model sees the full Q&A. */
function stripUnansweredToolParts(messages: IncomingMessage[]) {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => {
        const record = part as MessagePart;
        const type = record.type as string | undefined;
        const isRequestInput =
          type === "tool-request_input" || (type === "dynamic-tool" && record.toolName === "request_input");
        if (!isRequestInput) return true;
        // Keep only tool parts that have been answered
        return record.state === "output-available";
      }),
    }))
    .filter((message) => message.parts.length > 0);
}

export const Route = createFileRoute("/api/onboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as OnboardingRequestBody;
        const {
          messages: rawMessages,
          projectId,
          availableSkills = [],
          existingConnections = [],
          toolkitSummaries = [],
        } = body;

        const model = createAiSdkModel();
        const system = buildOnboardingSystemPrompt({ availableSkills, existingConnections, toolkitSummaries });

        const cleanedMessages = stripUnansweredToolParts(rawMessages);
        const modelMessages = await convertToModelMessages(cleanedMessages as UIMessage[]);

        const createAgentSchema = z.object({
          name: z.string().min(1).describe("Short, outcome-oriented agent name (e.g., 'Grow Qualified Demand')"),
          description: z
            .string()
            .min(1)
            .describe("One-sentence outcome statement (e.g., 'Reduce qualified CPA while maintaining volume')"),
          instructions: z
            .string()
            .min(1)
            .describe(
              "Strategy note (markdown). This becomes the agent's program.md — how to pursue the outcome, " +
                "what to watch, what patterns matter, how to format findings.",
            ),
          primaryMetric: z
            .string()
            .optional()
            .describe(
              "The comparabilityKey for the agent's primary success metric " +
                "(format: metric_name|scope|window, e.g., 'qualified_cpa|account|7d')",
            ),
          skills: z.array(z.string()).default([]).describe("Skill IDs from available skills"),
          toolSlugs: z.array(z.string()).default([]).describe("Tool slugs confirmed by the user"),
          schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
        });

        type CreateAgentInput = z.infer<typeof createAgentSchema>;

        const result = streamText({
          model,
          system,
          messages: modelMessages,
          stopWhen: [hasToolCall("create_agent"), stepCountIs(20)],
          providerOptions: {
            anthropic: { thinking: { type: "enabled", budgetTokens: 5000 } },
          },
          tools: {
            request_input: {
              description:
                "Present options to the user and wait for their selection. " +
                "For tool recommendations, use multiSelect with description and selected fields. " +
                "For simple choices (notifications, schedule), use single-select without description. " +
                "For freeform text input (URLs, names, etc.), use allowCustom: true with an empty options array. " +
                "You can call this tool multiple times in one response to batch questions into a paginated card.",
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
                  .default([])
                  .describe("Available options. Use empty array [] with allowCustom for freeform text input."),
                multiSelect: z
                  .boolean()
                  .default(false)
                  .describe("True = checkboxes (pick many), false = radio (pick one)"),
                allowCustom: z
                  .boolean()
                  .default(false)
                  .describe(
                    "When true with empty options, renders a text input field. When true with options, adds a 'Something else' option.",
                  ),
                skippable: z
                  .boolean()
                  .default(false)
                  .describe("Show a Skip button — use when the question is optional"),
                placeholder: z
                  .string()
                  .optional()
                  .describe("Placeholder text for the text input field (only used when allowCustom is true)"),
              }),
              outputSchema: z.object({
                selectedKeys: z.array(z.string()).describe("The key(s) the user selected"),
                customText: z.string().optional().describe("The user's freeform text when they chose 'Something else'"),
                skipped: z.boolean().optional().describe("True when the user clicked Skip"),
              }),
              // No execute — UI-only tool, rendered client-side.
            },

            search_tools: {
              description:
                "Search for available tools across all platforms (Composio integrations + custom connectors). " +
                "Use after recommending systems to find specific tool slugs. " +
                "Custom Google Ads tools are always included when searching for 'googleads' or ad-related queries.",
              inputSchema: z.object({
                query: z.string().optional().describe("Search query (e.g. 'campaign performance', 'send message')"),
                toolkits: z
                  .array(z.string())
                  .optional()
                  .describe("Filter by toolkit slugs (e.g. ['googleads', 'slack'])"),
              }),
              execute: async (input: { query?: string; toolkits?: string[] }) => {
                const results: Array<{ slug: string; name: string; description: string }> = [];

                // Custom Google Ads tools (direct connector — always available)
                const isGoogleAdsQuery =
                  input.toolkits?.some((t) => t.toLowerCase().includes("google")) ||
                  input.query?.toLowerCase().match(/google|ads|campaign|keyword|cpa|roas|spend/);
                if (isGoogleAdsQuery) {
                  results.push(
                    {
                      slug: "googleads_list_campaigns",
                      name: "List Google Ads Campaigns",
                      description:
                        "List all active campaigns with impressions, clicks, cost, conversions over a date range.",
                    },
                    {
                      slug: "googleads_campaign_performance",
                      name: "Campaign Performance (Daily)",
                      description:
                        "Daily performance breakdown for a campaign: impressions, clicks, cost, conversions.",
                    },
                  );
                }

                // Composio tools
                try {
                  const { createComposioClient } = await import("@nochore/harness");
                  const composio = await createComposioClient();

                  const tools = await composio.tools.getRawComposioTools({
                    ...(input.toolkits?.length ? { toolkits: input.toolkits } : {}),
                    ...(input.query ? { search: input.query } : {}),
                    limit: 20,
                  } as never);

                  for (const t of tools as Array<{ slug: string; name: string; description: string }>) {
                    // Don't duplicate if a custom tool already covers it
                    if (!results.some((r) => r.slug === t.slug)) {
                      results.push({ slug: t.slug, name: t.name, description: t.description });
                    }
                  }
                } catch (err) {
                  console.error("Composio search_tools failed:", err);
                  // Custom tools still returned even if Composio fails
                }

                return results;
              },
            },

            create_agent: {
              description:
                "Create the agent with the gathered configuration. " +
                "Call this once you have confirmed tools, notifications, and schedule with the user.",
              inputSchema: createAgentSchema,
              execute: async (input: CreateAgentInput) => {
                const { createAgent } = await import("~/server/agent-instances");

                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);

                // Derive required providers from tool slugs.
                // Tool slug convention: provider_action (e.g., googleads_list_campaigns → googleads)
                const providerSet = new Map<string, string>();
                for (const slug of input.toolSlugs) {
                  const provider = slug.split("_")[0]?.toLowerCase();
                  if (provider && !providerSet.has(provider)) {
                    providerSet.set(provider, `Required for ${input.name}`);
                  }
                }
                const requiredProviders = Array.from(providerSet.entries()).map(([provider, reason]) => ({
                  provider,
                  reason,
                }));

                const agentResult = await createAgent({
                  data: {
                    projectId,
                    name: input.name.trim(),
                    description: input.description.trim(),
                    instructions: input.instructions.trim(),
                    primaryMetric: input.primaryMetric?.trim(),
                    skills: resolvedSkills,
                    toolConfig: { globalApprovalRequired: false, requiredProviders, tools: {} },
                    notificationConfig: { inApp: true, email: false, slack: false },
                    schedule: input.schedule,
                    status: "draft",
                  },
                });
                const agentId = (agentResult as { id?: string })?.id;

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
