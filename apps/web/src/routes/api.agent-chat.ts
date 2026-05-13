/**
 * Agent chat endpoint.
 *
 * Streaming chat using Vercel AI SDK v6 streamText + useChat protocol.
 * The agent can answer questions and trigger background runs.
 */

import { createAiSdkModel } from "@nochore/harness";
import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModelUsage, UIMessage } from "ai";
import { stepCountIs, streamText } from "ai";
import { z } from "zod";
import { buildAgentChatSystemPrompt } from "~/server/agent-chat-prompt";
import {
  assembleConversation,
  isSyntheticMessageId,
  persistConversationAfterResponse,
  persistConversationMessages,
  resolveConversationThread,
} from "~/server/chat-memory";
import { buildChatProviderTools } from "~/server/chat-provider-tools";
import { getAgentRow, getProjectDeps, listProjectConnections } from "~/server/deps";
import { startAgentRun } from "~/server/orchestration";
import { buildPersistentUIMessageStreamOptions } from "~/server/ui-message-stream";

type IncomingMessage = {
  id?: string;
  role: string;
  parts: unknown[];
};

type AgentChatRequestBody = {
  messages: IncomingMessage[];
  agentId: string;
  projectId: string;
  threadId?: string;
  createThreadOnFirstMessage?: boolean;
};

export const Route = createFileRoute("/api/agent-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as AgentChatRequestBody;
        const { messages: rawMessages, agentId, projectId, threadId, createThreadOnFirstMessage } = body;

        const agent = getAgentRow(projectId, agentId);
        if (!agent) {
          return new Response(JSON.stringify({ error: "Agent not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const model = createAiSdkModel();
        const deps = getProjectDeps(projectId);
        const latestUserText = extractLatestUserText(rawMessages);
        const shouldCreateThread = createThreadOnFirstMessage && !threadId && latestUserText.length > 0;
        const thread = shouldCreateThread
          ? await deps.conversationThreadRepository.createManualWebThread(agentId)
          : await resolveConversationThread({
              deps,
              agentId,
              requestedThreadId: threadId,
            });
        const createdThreadId = shouldCreateThread ? thread.id : undefined;

        await persistConversationMessages({
          deps,
          threadId: thread.id,
          agentId,
          messages: rawMessages as UIMessage[],
        });

        const assembled = await assembleConversation({
          deps,
          agent,
          thread,
          model,
        });

        const projectConnections = listProjectConnections(projectId);
        const connectionBindings = await deps.agentConnectionBindingRepository.listByAgent(agentId);
        const connectedProviders =
          connectionBindings.length > 0
            ? connectionBindings.map((binding) =>
                describeConnectionBinding(binding.provider, binding.alias, binding.resourceLabel, binding.resourceId),
              )
            : projectConnections
                .filter((connection) => connection.status === "active" && typeof connection.provider === "string")
                .map((connection) => describeConnectedProvider(connection.provider, connection.config));
        const providerTools = await buildChatProviderTools({
          userId: `nochore-${projectId}`,
          connections: projectConnections,
          bindings: connectionBindings,
        });

        const system = [
          buildAgentChatSystemPrompt({
            name: agent.name,
            description: agent.description,
            instructions: agent.config.instructions,
            schedule: agent.config.schedule,
            skills: agent.config.skills,
            connectedProviders,
          }),
          assembled.memoryContext,
        ]
          .filter((section) => section.trim().length > 0)
          .join("\n\n");

        let totalUsage: LanguageModelUsage | undefined;
        const result = streamText({
          model,
          system,
          messages: assembled.modelMessages,
          stopWhen: stepCountIs(10),
          providerOptions: {
            anthropic: { thinking: { type: "enabled", budgetTokens: 5000 } },
          },
          onFinish: async ({ totalUsage: usage }) => {
            totalUsage = usage;
          },
          tools: {
            ...providerTools,
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
              execute: async (input: { runLimit: number; includeFindings: boolean; includeLessons: boolean }) => {
                const recentRuns = await deps.runRepository.getByAgent(agentId, input.runLimit);

                let findings: Array<{ runId: string; text: string; timestamp: string }> = [];
                if (input.includeFindings) {
                  const events = await deps.runEventRepository.listByAgent(agentId, 50);
                  findings = events
                    .filter((event) => event.type === "finding_recorded")
                    .map((event) => ({
                      runId: event.runId,
                      text: ((event.payload as Record<string, unknown>).text as string) ?? "",
                      timestamp: event.timestamp.toISOString(),
                    }));
                }

                let lessons: Array<{ content: string; scope: string; confidence: string }> = [];
                if (input.includeLessons) {
                  const lessonRecords = await deps.lessonRepository.listDurableByAgent(agentId);
                  lessons = lessonRecords.map((lesson) => ({
                    content: lesson.content,
                    scope: lesson.scope,
                    confidence: lesson.confidence,
                  }));
                }

                return {
                  runs: recentRuns.map((run) => ({
                    id: run.id,
                    status: run.status,
                    triggerType: run.triggerType,
                    startedAt: run.startedAt.toISOString(),
                    completedAt: run.completedAt?.toISOString(),
                    headline: run.summary?.headline,
                    finalText: run.summary?.finalText,
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
                  const { createComposioClient } = await import("@nochore/harness");
                  const composio = await createComposioClient();
                  const tools = await composio.tools.getRawComposioTools({
                    ...(input.toolkits?.length ? { toolkits: input.toolkits } : {}),
                    ...(input.query ? { search: input.query } : {}),
                    limit: 20,
                  } as never);
                  return (tools as Array<{ slug: string; name: string; description: string }>).map((tool) => ({
                    slug: tool.slug,
                    name: tool.name,
                    description: tool.description,
                  }));
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
                const alreadyExists = currentProviders.some((provider) => provider.provider === input.provider);
                if (alreadyExists) {
                  return { success: true, alreadyExists: true, provider: input.provider };
                }

                const updatedProviders = [...currentProviders, { provider: input.provider, reason: input.reason }];
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

        return result.toUIMessageStreamResponse({
          ...buildPersistentUIMessageStreamOptions({
            originalMessages: rawMessages as UIMessage[],
            onFinish: async ({ messages, responseMessage }) => {
              await persistConversationAfterResponse({
                deps,
                agent,
                thread,
                messages,
                responseMessage,
                model,
                totalUsage: totalUsage
                  ? {
                      inputTokens: totalUsage.inputTokens,
                      outputTokens: totalUsage.outputTokens,
                      totalTokens: totalUsage.totalTokens,
                    }
                  : undefined,
                latestUserText,
              });
            },
          }),
          messageMetadata: () => (createdThreadId ? { threadId: createdThreadId } : undefined),
        });
      },
    },
  },
});

function extractLatestUserText(messages: IncomingMessage[]): string {
  const latestUser = [...messages]
    .reverse()
    .find((message) => message.role === "user" && !isSyntheticMessageId(message.id));
  if (!latestUser) {
    return "";
  }

  return latestUser.parts
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part != null && "type" in part && (part as { type?: string }).type === "text",
    )
    .map((part) => String(part.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function describeConnectedProvider(provider: string, configJson: string | null): string {
  const config = parseConnectionConfig(configJson);
  const selectedCustomerId = getGoogleAdsCustomerId(config);
  if (provider === "googleads") {
    return selectedCustomerId
      ? `googleads (project account ${formatGoogleAdsCustomerId(selectedCustomerId)})`
      : "googleads (project account not selected)";
  }
  return provider;
}

function describeConnectionBinding(
  provider: string,
  alias: string,
  resourceLabel?: string,
  resourceId?: string,
): string {
  if (provider === "googleads") {
    const account = resourceLabel ?? (resourceId ? formatGoogleAdsCustomerId(resourceId) : null);
    return account ? `googleads (${alias}: ${account})` : `googleads (${alias})`;
  }
  return `${provider} (${alias})`;
}

function parseConnectionConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getGoogleAdsCustomerId(config: Record<string, unknown>): string | null {
  const value = config.selectedCustomerId ?? config.customerId;
  return typeof value === "string" && value.trim() ? value.replace(/\D/g, "") : null;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
