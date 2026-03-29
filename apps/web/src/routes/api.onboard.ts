/**
 * Conversational agent onboarding endpoint.
 *
 * Multi-turn chat using Vercel AI SDK v6 streamText + useChat protocol.
 * The LLM clarifies intent, searches for tools, then calls create_agent.
 */

import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { convertToModelMessages, hasToolCall, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { createAiSdkModel } from "../../../../packages/harness/src/llm/model";
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
          name: z.string().min(1).describe("A short, memorable agent name"),
          description: z.string().min(1).describe("A concise one-sentence summary of what the agent does"),
          instructions: z
            .string()
            .min(1)
            .describe(
              "Detailed operational instructions (markdown). This becomes the agent's system prompt. " +
                "Be specific: what data to pull, what patterns to look for, how to format findings, " +
                "what thresholds trigger action.",
            ),
          skills: z.array(z.string()).default([]).describe("Skill IDs from available skills"),
          toolSlugs: z.array(z.string()).default([]).describe("Tool slugs confirmed by the user"),
          schedule: z.enum(["hourly", "6hours", "daily", "weekly", "manual"]).describe("How often the agent runs"),
        });

        type CreateAgentInput = z.infer<typeof createAgentSchema>;

        // Build a toolkit description lookup from summaries for provider reasons
        const toolkitDescriptions = new Map(toolkitSummaries.map((tk) => [tk.slug, tk.description]));
        const toolkitLogos = new Map(toolkitSummaries.map((tk) => [tk.slug, tk.logo]));

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
                  .describe("When true with empty options, renders a text input field. When true with options, adds a 'Something else' option."),
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
                "Search for available tools across all connected platforms. " +
                "Use after clarifying the user's intent to find relevant integrations. " +
                "You can filter by toolkit (platform) or search by keyword.",
              inputSchema: z.object({
                query: z.string().optional().describe("Search query (e.g. 'campaign performance', 'send message')"),
                toolkits: z
                  .array(z.string())
                  .optional()
                  .describe("Filter by toolkit slugs (e.g. ['googleads', 'slack'])"),
              }),
              execute: async (input: { query?: string; toolkits?: string[] }) => {
                try {
                  const { createComposioClient } = await import(
                    "../../../../packages/harness/src/connections/composio"
                  );
                  const composio = await createComposioClient();

                  // The SDK typing is narrower than the runtime search parameters supported here.
                  const tools = await composio.tools.getRawComposioTools({
                    ...(input.toolkits?.length ? { toolkits: input.toolkits } : {}),
                    ...(input.query ? { search: input.query } : {}),
                    limit: 20,
                  } as never);

                  return (tools as Array<{ slug: string; name: string; description: string }>).map((t) => ({
                    slug: t.slug,
                    name: t.name,
                    description: t.description,
                  }));
                } catch (err) {
                  console.error("search_tools failed:", err);
                  return [{ slug: "error", name: "Search failed", description: String(err) }];
                }
              },
            },

            create_agent: {
              description:
                "Create the agent with the gathered configuration. " +
                "Call this once you have confirmed tools, notifications, and schedule with the user.",
              inputSchema: createAgentSchema,
              execute: async (input: CreateAgentInput) => {
                const { createAgent } = await import("~/server/agents");
                const { createComposioClient } = await import("../../../../packages/harness/src/connections/composio");

                const resolvedSkills = resolveSkillIds(input.skills, availableSkills);

                // Connections are project-level, managed in Settings.
                // The agent doesn't store requiredProviders — it works with
                // whatever providers are connected at runtime.
                const agentResult = await createAgent({
                  data: {
                    projectId,
                    name: input.name.trim(),
                    description: input.description.trim(),
                    instructions: input.instructions.trim(),
                    skills: resolvedSkills,
                    toolConfig: { requiredProviders: [], tools: {} },
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
