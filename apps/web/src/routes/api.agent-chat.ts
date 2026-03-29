/**
 * Agent chat endpoint.
 *
 * Streaming chat using Vercel AI SDK v6 streamText + useChat protocol.
 * The agent can answer questions and trigger background runs.
 */

import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { createAiSdkModel } from "../../../../packages/harness/src/llm/model";
import { buildAgentChatSystemPrompt } from "~/server/agent-chat-prompt";
import { getAgentRow, getProjectDeps } from "~/server/deps";
import { startAgentRun } from "~/server/orchestration";

type IncomingMessage = {
  id?: string;
  role: string;
  parts: unknown[];
};

type MessagePart = Record<string, unknown>;

type AgentChatRequestBody = {
  messages: IncomingMessage[];
  agentId: string;
  projectId: string;
};

/** Strip tool parts that haven't been answered yet (no output). */
function stripUnansweredToolParts(messages: IncomingMessage[]) {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => {
        const record = part as MessagePart;
        const type = record.type as string | undefined;
        const isToolPart = typeof type === "string" && (type.startsWith("tool-") || type === "dynamic-tool");
        if (!isToolPart) return true;
        return record.state === "output-available";
      }),
    }))
    .filter((message) => message.parts.length > 0);
}

export const Route = createFileRoute("/api/agent-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as AgentChatRequestBody;
        const { messages: rawMessages, agentId, projectId } = body;

        const agent = getAgentRow(projectId, agentId);
        if (!agent) {
          return new Response(JSON.stringify({ error: "Agent not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const model = createAiSdkModel();
        const deps = getProjectDeps(projectId);
        const system = buildAgentChatSystemPrompt({
          name: agent.name,
          description: agent.description,
          instructions: agent.config.instructions,
          schedule: agent.config.schedule,
          skills: agent.config.skills,
        });

        const cleanedMessages = stripUnansweredToolParts(rawMessages);
        const modelMessages = await convertToModelMessages(cleanedMessages as UIMessage[]);

        const result = streamText({
          model,
          system,
          messages: modelMessages,
          stopWhen: stepCountIs(10),
          providerOptions: {
            anthropic: { thinking: { type: "enabled", budgetTokens: 5000 } },
          },
          tools: {
            trigger_run: {
              description:
                "Start a background run of this agent. Use when the user asks to run, analyze, check, or investigate something.",
              inputSchema: z.object({
                reason: z.string().describe("Brief explanation of why this run was triggered"),
              }),
              execute: async (input: { reason: string }) => {
                const { runId, triggerRunId } = await startAgentRun({
                  agentId,
                  projectId,
                  trigger: {
                    type: "chat",
                    timestamp: new Date(),
                    metadata: { reason: input.reason },
                  },
                });
                return { runId, triggerRunId, status: "queued" as const };
              },
            },

            request_input: {
              description:
                "Present a question, options, or text input to the operator. Use for confirmations, choices, or gathering input.",
              inputSchema: z.object({
                question: z.string(),
                options: z
                  .array(
                    z.object({
                      key: z.string(),
                      label: z.string(),
                      description: z.string().optional(),
                      selected: z.boolean().optional(),
                    }),
                  )
                  .default([]),
                multiSelect: z.boolean().default(false),
                allowCustom: z.boolean().default(false),
                skippable: z.boolean().default(false),
                placeholder: z.string().optional(),
              }),
              outputSchema: z.object({
                selectedKeys: z.array(z.string()),
                customText: z.string().optional(),
                skipped: z.boolean().optional(),
              }),
              // No execute — UI-only tool. Client renders OptionCards and calls addToolOutput.
            },

            review_findings: {
              description:
                "Query this agent's past run history, findings, and lessons. " +
                "Use when the user asks about past runs, what you found, what you've learned, or your track record.",
              inputSchema: z.object({
                runLimit: z.number().default(5).describe("Max number of recent runs to return"),
                includeFindings: z.boolean().default(true).describe("Include finding_recorded events"),
                includeLessons: z.boolean().default(true).describe("Include distilled lessons"),
              }),
              execute: async (input: {
                runLimit: number;
                includeFindings: boolean;
                includeLessons: boolean;
              }) => {
                const recentRuns = await deps.runRepository.getByAgent(agentId, input.runLimit);

                let findings: Array<{ runId: string; text: string; timestamp: string }> = [];
                if (input.includeFindings) {
                  const events = await deps.runEventRepository.listByAgent(agentId, 50);
                  findings = events
                    .filter((e) => e.type === "finding_recorded")
                    .map((e) => ({
                      runId: e.runId,
                      text: ((e.payload as Record<string, unknown>).text as string) ?? "",
                      timestamp: e.timestamp.toISOString(),
                    }));
                }

                let lessons: Array<{ content: string; scope: string; confidence: string }> = [];
                if (input.includeLessons) {
                  const lessonRecords = await deps.lessonRepository.listByAgent(agentId);
                  lessons = lessonRecords.map((l) => ({
                    content: l.content,
                    scope: l.scope,
                    confidence: l.confidence,
                  }));
                }

                return {
                  runs: recentRuns.map((r) => ({
                    id: r.id,
                    status: r.status,
                    triggerType: r.triggerType,
                    startedAt: r.startedAt.toISOString(),
                    completedAt: r.completedAt?.toISOString(),
                    headline: r.summary?.headline,
                    finalText: r.summary?.finalText,
                  })),
                  findings,
                  lessons,
                  totalRuns: recentRuns.length,
                };
              },
            },

            search_tools: {
              description:
                "Search for available tools and integrations across all platforms. " +
                "Use when the user wants to add a new data source, connection, or capability.",
              inputSchema: z.object({
                query: z.string().optional().describe("Search query (e.g. 'search console', 'slack')"),
                toolkits: z
                  .array(z.string())
                  .optional()
                  .describe("Filter by toolkit slugs (e.g. ['google_search_console'])"),
              }),
              execute: async (input: { query?: string; toolkits?: string[] }) => {
                try {
                  const { createComposioClient } = await import(
                    "../../../../packages/harness/src/connections/composio"
                  );
                  const composio = await createComposioClient();
                  const tools = await composio.tools.getRawComposioTools({
                    ...(input.toolkits?.length ? { toolkits: input.toolkits } : {}),
                    ...(input.query ? { search: input.query } : {}),
                    limit: 20,
                  } as never);
                  return (tools as Array<{ slug: string; name: string; description: string }>).map(
                    (t) => ({ slug: t.slug, name: t.name, description: t.description }),
                  );
                } catch (err) {
                  return [{ slug: "error", name: "Search failed", description: String(err) }];
                }
              },
            },

            add_provider: {
              description:
                "Add a provider/integration to this agent's required connections. " +
                "The user will need to authenticate the connection separately via Settings. " +
                "IMPORTANT: Always use request_input first to confirm with the user before adding.",
              inputSchema: z.object({
                provider: z.string().describe("Provider slug (e.g. 'google_search_console')"),
                reason: z.string().describe("Why this provider is needed"),
              }),
              execute: async (input: { provider: string; reason: string }) => {
                const currentAgent = await deps.agentRepository.getById(agentId);
                if (!currentAgent) return { success: false, error: "Agent not found" };

                const currentProviders = currentAgent.toolConfig.requiredProviders ?? [];
                const alreadyExists = currentProviders.some((p) => p.provider === input.provider);
                if (alreadyExists) {
                  return { success: true, alreadyExists: true, provider: input.provider };
                }

                const updatedProviders = [
                  ...currentProviders,
                  { provider: input.provider, reason: input.reason },
                ];
                await deps.agentRepository.update(agentId, {
                  toolConfig: { ...currentAgent.toolConfig, requiredProviders: updatedProviders },
                });
                return {
                  success: true,
                  provider: input.provider,
                  message: `Added ${input.provider}. The operator needs to authenticate this connection in Settings.`,
                };
              },
            },

            update_config: {
              description:
                "Persist configuration changes for this agent. " +
                "IMPORTANT: Always use request_input first to show the user a before/after diff and get confirmation before calling this tool.",
              inputSchema: z.object({
                name: z.string().optional().describe("New agent name"),
                description: z.string().optional().describe("New agent description"),
                instructions: z.string().optional().describe("New agent instructions (markdown)"),
                schedule: z
                  .enum(["hourly", "6hours", "daily", "weekly", "manual"])
                  .optional()
                  .describe("New schedule frequency"),
              }),
              execute: async (input: {
                name?: string;
                description?: string;
                instructions?: string;
                schedule?: string;
              }) => {
                const patch: Record<string, unknown> = {};
                if (input.name !== undefined) patch.name = input.name.trim();
                if (input.description !== undefined) patch.description = input.description.trim();
                if (input.instructions !== undefined) patch.instructions = input.instructions.trim();
                if (input.schedule !== undefined) patch.schedule = input.schedule;

                if (Object.keys(patch).length === 0) {
                  return { success: false, error: "No fields provided to update" };
                }

                await deps.agentRepository.update(agentId, patch);

                const updatedAgent = await deps.agentRepository.getById(agentId);
                return {
                  success: true,
                  updated: Object.keys(patch),
                  currentConfig: updatedAgent
                    ? {
                        name: updatedAgent.name,
                        description: updatedAgent.description,
                        schedule: updatedAgent.schedule,
                        instructionsLength: updatedAgent.instructions.length,
                      }
                    : null,
                };
              },
            },
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
