import crypto from "node:crypto";
import type { RunSummary, RunTrigger } from "@nochore/harness";
import {
  type AgentRecord,
  classifyEpisodicLesson,
  createAiSdkModel,
  extractRunInsights,
  extractStructuredReport,
  getAgentWorkspacePath,
  parseRunReport,
} from "@nochore/harness";
import { logger, metadata, task } from "@trigger.dev/sdk";
import type { UIMessage } from "ai";
import { buildPromptBundle, createAgentRuntime, resolveAgentConnectionContext } from "../lib/agent-runtime";
import { runAgentSession } from "../lib/agent-session";
import { createDelegateTaskTool } from "../lib/agent-task-coordinator";
import { ApprovalCheckpointError, recordEvent } from "../lib/run-helpers";
import { buildLeadToolEnvelope } from "../lib/tool-envelope";
import { listProviderTools } from "../lib/tool-provider";

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: { agentId: string; projectId: string; trigger: RunTrigger; runId?: string }) => {
    const runtime = await createAgentRuntime(payload.projectId);
    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    const runId = await ensureRunRecord(runtime, agent, payload.runId, payload.trigger);
    const workItem = await ensureWorkItemForRun(runtime, agent, runId, payload.trigger);
    await runtime.workItemRepository.markRunning(workItem.id);
    await runtime.agentSessionRepository.update(workItem.sessionId, {
      status: "working",
      activeWorkItemId: workItem.id,
      lastActiveAt: new Date(),
    });
    const eventIds: string[] = [];
    const connectionContext = await resolveAgentConnectionContext({
      db: runtime.db,
      projectId: payload.projectId,
      agent,
    });

    try {
      await runtime.runRepository.markRunning(runId);
      metadata.set("status", "running");

      const startPayload = { trigger: payload.trigger, providers: connectionContext.activeProviders };
      const startId = await recordEvent(runtime, runId, agent.id, "run_started", startPayload);
      eventIds.push(startId);

      const promptBundle = await buildPromptBundle({
        agent,
        trigger: payload.trigger,
        providerConfigs: connectionContext.providerConfigs,
        providerBindings: connectionContext.providerBindings,
      });
      const promptPayload = {
        selectedSkills: promptBundle.selectedSkills.map((s) => s.id),
        systemLength: promptBundle.system.length,
        workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
      };
      const promptId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptPayload);
      eventIds.push(promptId);

      const providerTools = await listProviderTools({
        userId: runtime.userId,
        activeProviders: connectionContext.activeProviders,
        providerConfigs: connectionContext.providerConfigs,
        providerBindings: connectionContext.providerBindings,
      });

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);
      const allTools = buildLeadToolEnvelope({
        providerTools,
        delegateTaskTool: createDelegateTaskTool({
          runtime,
          agent,
          runId,
          projectId: payload.projectId,
          eventIds,
        }),
      });
      const contextSnapshotId = await runtime.contextSnapshotRepository.create({
        sessionId: workItem.sessionId,
        agentId: agent.id,
        workItemId: workItem.id,
        kind: workItem.kind === "scheduled_check" ? "scheduled_check" : "work_item",
        messagesVersion: `trigger:${payload.trigger.type}`,
        memoryVersion: `lessons:${(await runtime.lessonRepository.listByAgent(agent.id)).length}`,
        toolBindingsVersion: hashVersion(
          "tools",
          allTools
            .map((tool) => tool.name)
            .sort()
            .join(","),
        ),
        policyVersion: hashVersion("policy", JSON.stringify(agent.toolConfig)),
        promptHash: hashVersion("prompt", promptBundle.system),
        payload: {
          executor: process.env.AGENT_EXECUTOR ?? "flue",
          triggerType: payload.trigger.type,
          systemLength: promptBundle.system.length,
          userLength: promptBundle.user.length,
          selectedSkills: promptBundle.selectedSkills.map((skill) => skill.id),
          toolNames: allTools.map((tool) => tool.name).sort(),
          activeProviders: connectionContext.activeProviders,
        },
      });
      await runtime.agentSessionRepository.update(workItem.sessionId, {
        lastContextSnapshotId: contextSnapshotId,
        lastActiveAt: new Date(),
      });

      logger.info("Lead prompt context assembled", {
        skills: promptBundle.selectedSkills.map((s) => s.id),
        activeProviders: connectionContext.activeProviders,
      });

      const executionResult = await runAgentSession({
        runtime,
        agent,
        runId,
        projectId: payload.projectId,
        systemPrompt: promptBundle.system,
        userPrompt: promptBundle.user,
        workspacePath,
        tools: allTools,
        eventIds,
      });

      if (executionResult.output.trim()) {
        const findingPayload = { text: executionResult.output };
        const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
        eventIds.push(findingId);
      }

      const structured = executionResult.output.trim()
        ? await extractStructuredReport(createAiSdkModel(), executionResult.output)
        : null;
      const summary = buildSummary({
        status: "completed",
        finalText: executionResult.output,
        agent,
        runId,
        recentToolCalls: executionResult.toolCalls,
        eventIds,
        structured,
      });
      await runtime.runRepository.complete(runId, new Date(), summary);

      const completePayload = { summary };
      const completeId = await recordEvent(runtime, runId, agent.id, "run_completed", completePayload);
      eventIds.push(completeId);
      metadata.set("status", "completed");
      await runtime.workItemRepository.complete(workItem.id, new Date(), {
        runId,
        summary,
      });
      await runtime.agentSessionRepository.update(workItem.sessionId, {
        status: "idle",
        activeWorkItemId: null,
        lastActiveAt: new Date(),
      });

      await recordRunResultInConversation(runtime, agent.id, runId, summary, payload.trigger);

      const durableLessons = await runtime.lessonRepository.listDurableByAgent(agent.id);
      const existingInsights = durableLessons
        .filter((lesson) => lesson.scope === "memory:insight")
        .map((lesson) => lesson.content);

      const combinedContent = [summary.headline, summary.finalText, ...(summary.details ?? [])]
        .filter(Boolean)
        .join(" ")
        .trim();

      let lessonWrites = combinedContent
        ? await extractRunInsights({
            model: createAiSdkModel(),
            headline: summary.headline,
            finalText: summary.finalText,
            details: summary.details,
            existingInsights,
          })
        : [];

      if (lessonWrites.length === 0) {
        lessonWrites = classifyEpisodicLesson({
          headline: summary.headline,
          finalText: summary.finalText,
          details: summary.details,
          toolCallCount: executionResult.toolCalls.length,
        });
      }

      for (const lessonWrite of lessonWrites) {
        const lessonId = await runtime.lessonRepository.create({
          agentId: agent.id,
          content: lessonWrite.content,
          scope: lessonWrite.scope,
          confidence: lessonWrite.confidence,
          sourceEventIds: eventIds.slice(-10),
          createdAt: new Date(),
          expiresAt: lessonWrite.expiresInMs ? new Date(Date.now() + lessonWrite.expiresInMs) : undefined,
        });
        const lessonPayload = { lessonId, scope: lessonWrite.scope };
        const lessonEventId = await recordEvent(runtime, runId, agent.id, "lesson_distilled", lessonPayload);
        eventIds.push(lessonEventId);
      }

      logger.info("Agent run completed", {
        runId,
        agentId: agent.id,
        triggerType: payload.trigger.type,
        durationMs: executionResult.durationMs,
        toolCallCount: executionResult.toolCalls.length,
      });

      return { runId, agentId: agent.id, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isApprovalTerminal = error instanceof ApprovalCheckpointError;

      if (isApprovalTerminal) {
        await stopRunForApproval({
          runtime,
          runId,
          agentId: agent.id,
          error,
          eventIds,
          workItemId: workItem.id,
          sessionId: workItem.sessionId,
        });
        logger.info("Agent run stopped", { runId, agentId: agent.id, reason: message, cause: error.stopCause });
        return { runId, agentId: agent.id, stopped: true };
      }

      const summary = buildSummary({
        status: "failed",
        finalText: "",
        agent,
        runId,
        error: message,
        recentToolCalls: [],
        eventIds,
      });
      const failPayload = { reason: message, summary };
      const failId = await recordEvent(runtime, runId, agent.id, "run_failed", failPayload);
      eventIds.push(failId);
      metadata.set("status", "failed");
      await runtime.runRepository.fail(runId, new Date(), message, summary);
      await runtime.workItemRepository.fail(workItem.id, new Date(), message, {
        runId,
        summary,
      });
      await runtime.agentSessionRepository.update(workItem.sessionId, {
        status: "failed",
        activeWorkItemId: null,
        lastActiveAt: new Date(),
      });
      await recordRunResultInConversation(runtime, agent.id, runId, summary, payload.trigger);
      logger.error("Agent run failed", { runId, agentId: agent.id, error: message });
      throw error;
    }
  },
});

export async function stopRunForApproval(params: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  runId: string;
  agentId: string;
  error: ApprovalCheckpointError;
  eventIds: string[];
  workItemId?: string;
  sessionId?: string;
  metadataApi?: { set: (key: string, value: string) => void };
}) {
  const stopPayload = {
    cause: params.error.stopCause,
    reason: params.error.message,
    ...(params.error.approvalId ? { approvalId: params.error.approvalId } : {}),
    ...(params.error.taskId ? { taskId: params.error.taskId } : {}),
  };
  const stopId = await recordEvent(params.runtime, params.runId, params.agentId, "run_stopped", stopPayload);
  params.eventIds.push(stopId);
  await params.runtime.runRepository.stop(params.runId, new Date(), params.error.message);
  if (params.workItemId) {
    await params.runtime.workItemRepository.setStatus(params.workItemId, "waiting_for_approval");
  }
  if (params.sessionId) {
    await params.runtime.agentSessionRepository.update(params.sessionId, {
      status: "waiting_for_approval",
      activeWorkItemId: params.workItemId ?? null,
      lastActiveAt: new Date(),
    });
  }
  (params.metadataApi ?? metadata).set("status", "stopped");
}

async function ensureRunRecord(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
  agent: AgentRecord,
  runId: string | undefined,
  trigger: RunTrigger,
): Promise<string> {
  if (runId) {
    const existing = await runtime.runRepository.getById(runId);
    if (existing) {
      if (existing.status === "completed") {
        throw new Error(`Run ${runId} is already completed`);
      }
      // Allow retrying a failed run (trigger.dev retry) — reset it to running
      await runtime.runRepository.markRunning(runId);
      return runId;
    }
  }

  return runtime.runRepository.create({
    id: runId,
    agentId: agent.id,
    triggerType: trigger.type,
    startedAt: trigger.timestamp,
    status: "running",
  });
}

async function ensureWorkItemForRun(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
  agent: AgentRecord,
  runId: string,
  trigger: RunTrigger,
) {
  const existing = await runtime.workItemRepository.getByRunId(runId);
  if (existing) {
    return existing;
  }

  const session = await runtime.agentSessionRepository.getOrCreateForContext({
    projectId: agent.projectId,
    agentId: agent.id,
    contextKey: defaultRunContextKey(agent.id, trigger),
    status: "idle",
  });
  const id = await runtime.workItemRepository.create({
    sessionId: session.id,
    agentId: agent.id,
    kind: trigger.type === "cron" ? "scheduled_check" : "run",
    status: "queued",
    runId,
    title: trigger.type === "cron" ? "Scheduled check" : "Agent run",
    input: {
      triggerType: trigger.type,
      triggerTimestamp: trigger.timestamp.toISOString(),
      metadata: trigger.metadata ?? {},
    },
  });
  return (await runtime.workItemRepository.getById(id))!;
}

function defaultRunContextKey(agentId: string, trigger: RunTrigger): string {
  const threadId = typeof trigger.metadata?.threadId === "string" ? trigger.metadata.threadId : undefined;
  if (threadId) {
    return `web:${threadId}`;
  }
  return `agent:${agentId}:${trigger.type}`;
}

function hashVersion(prefix: string, value: string): string {
  return `${prefix}:sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

export async function recordRunResultInConversation(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
  agentId: string,
  runId: string,
  summary: RunSummary,
  trigger?: RunTrigger,
) {
  const thread = await resolveRunResultThread(runtime, agentId, trigger);
  const createdAt = new Date();
  const messageId = `run-result:${runId}`;
  const message: UIMessage = {
    id: messageId,
    role: "assistant",
    parts: [{ type: "text", text: formatRunResultMessage(summary) }],
  };

  await runtime.conversationEventRepository.upsertMessages([
    {
      threadId: thread.id,
      agentId,
      source: "run",
      message,
      createdAt,
    },
  ]);
  await runtime.conversationEventRepository.upsertStructuredEvents([
    {
      threadId: thread.id,
      agentId,
      source: "run",
      role: "system",
      eventType: "run_result",
      eventKey: `run:${runId}:result`,
      messageId,
      payload: {
        messageId,
        runId,
        status: summary.status,
        headline: summary.headline,
        details: summary.details,
        finalText: summary.finalText,
      },
      createdAt: new Date(createdAt.getTime() + 1),
    },
  ]);
  await runtime.conversationThreadRepository.touch(thread.id, createdAt);
}

async function resolveRunResultThread(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
  agentId: string,
  trigger?: RunTrigger,
) {
  const threadId = typeof trigger?.metadata?.threadId === "string" ? trigger.metadata.threadId : undefined;
  if (threadId) {
    const thread = await runtime.conversationThreadRepository.getById(threadId);
    if (thread?.agentId === agentId) {
      return thread;
    }
  }

  return runtime.conversationThreadRepository.getOrCreatePrimary(agentId);
}

function formatRunResultMessage(summary: RunSummary): string {
  const headline = summary.headline.trim();
  const finalText = summary.finalText?.trim();

  // If finalText already opens with the headline (typical — the agent emits a
  // heading and we extract its text as the headline), return finalText alone.
  // Otherwise prepend headline as a separate section.
  if (finalText) {
    const firstLine = finalText
      .split(/\r?\n/, 1)[0]
      ?.replace(/^#+\s*/, "")
      .trim();
    if (firstLine === headline) {
      return finalText;
    }
    return `${headline}\n\n${finalText}`.trim();
  }

  if (summary.details && summary.details.length > 0) {
    const visibleDetails = summary.details.filter((detail) => !detail.startsWith("Events recorded:"));
    if (visibleDetails.length > 0) {
      return `${headline}\n\n${visibleDetails.join("\n")}`.trim();
    }
  }

  return headline;
}

function buildSummary(params: {
  status: "completed" | "failed";
  finalText: string;
  agent: AgentRecord;
  runId: string;
  recentToolCalls: Array<{ toolName: string; timestamp: Date }>;
  eventIds: string[];
  error?: string;
  structured?: Awaited<ReturnType<typeof extractStructuredReport>>;
}): RunSummary {
  const normalizedText = params.finalText.trim();
  // Prefer LLM-extracted structure; fall back to heuristic parser on null.
  const parsed =
    params.structured ??
    (normalizedText
      ? parseRunReport(normalizedText)
      : { headline: "", overallSeverity: "info" as const, findings: [] });

  const fallbackHeadline =
    params.status === "completed" ? `${params.agent.name} completed` : `${params.agent.name} failed`;
  const headline = parsed.headline || normalizedText.split(/\n|\./, 1)[0]?.trim().slice(0, 140) || fallbackHeadline;

  // Legacy `details` kept for backward compat. Now only carries the error message
  // (if any) — trail/findings are dedicated fields.
  const details = params.error ? [`Error: ${params.error}`] : [];

  const trail = {
    ...(params.recentToolCalls.length > 0 ? { toolCalls: params.recentToolCalls.map((call) => call.toolName) } : {}),
    eventCount: params.eventIds.length,
  };

  return {
    status: params.status,
    headline,
    details,
    ...(normalizedText ? { finalText: normalizedText } : {}),
    ...(parsed.findings.length > 0 ? { findings: parsed.findings, overallSeverity: parsed.overallSeverity } : {}),
    trail,
  };
}
