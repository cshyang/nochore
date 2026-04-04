import type { LearnedPolicyRule, RunSummary, RunTrigger, ToolConfigEntry, ToolMode } from "@nochore/harness";
import {
  type AgentRecord,
  buildToolConfigEntry,
  classifyRunLessonWrites,
  detectAndSuggestLearnedRules,
  evaluatePolicy,
  getAgentWorkspacePath,
  type PiToolDefinition,
} from "@nochore/harness";
import { logger, metadata, task, wait } from "@trigger.dev/sdk/v3";
import { buildPromptBundle, buildSubRunPrompt, createWorkerRuntime } from "../lib/agent-runtime";
import { narrateEvent } from "../lib/narrate";
import { executePiAgent } from "../lib/pi-runtime";
import { listProviderTools } from "../lib/tool-provider";

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: { agentId: string; projectId: string; trigger: RunTrigger; runId?: string }) => {
    const runtime = await createWorkerRuntime(payload.projectId);
    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    const runId = await ensureRunRecord(runtime, agent, payload.runId, payload.trigger);
    const eventIds: string[] = [];
    const liveEvents: Array<{
      id: string;
      type: string;
      summary: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }> = [];
    const learnedRules = await runtime.learnedRuleRepository.listActive(agent.id);

    function emitLiveEvent(id: string, type: string, eventPayload: Record<string, unknown>) {
      liveEvents.push({
        id,
        type,
        summary: narrateEvent(type, eventPayload),
        timestamp: Date.now(),
        payload: eventPayload,
      });
      metadata.set("events", liveEvents);
    }

    const recentToolCalls: Array<{ toolName: string; timestamp: Date }> = [];

    try {
      await runtime.runRepository.markRunning(runId);
      metadata.set("status", "running");

      const startPayload = { trigger: payload.trigger, providers: runtime.activeProviders };
      const startId = await recordEvent(runtime, runId, agent.id, "run_started", startPayload);
      eventIds.push(startId);
      emitLiveEvent(startId, "run_started", startPayload);

      const promptBundle = await buildPromptBundle({ agent, trigger: payload.trigger });
      const promptPayload = {
        selectedSkills: promptBundle.selectedSkills.map((s) => s.id),
        systemLength: promptBundle.system.length,
        workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
      };
      const promptId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptPayload);
      eventIds.push(promptId);
      emitLiveEvent(promptId, "prompt_built", promptPayload);

      const allTools: PiToolDefinition[] = await listProviderTools({
        userId: runtime.userId,
        activeProviders: runtime.activeProviders,
        providerConfigs: runtime.providerConfigs,
      });

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);

      // Sub-run delegation tool
      const MAX_SUB_RUNS = 3;
      let subRunCount = 0;

      const spawnSubRunTool: PiToolDefinition = {
        name: "spawn_sub_run",
        label: "Delegate to Specialist",
        description:
          "Delegate a focused sub-task to a specialist. Roles: scout (research & data gathering), " +
          "analyst (pattern analysis & insights), builder (executing specific actions). " +
          "Use when a sub-task benefits from focused attention.",
        parameters: {
          type: "object",
          required: ["role", "task"],
          properties: {
            role: { type: "string", enum: ["scout", "analyst", "builder"], description: "Specialist role" },
            task: { type: "string", description: "What the specialist should do" },
            context: { type: "string", description: "Optional data or context to pass to the specialist" },
          },
        },
        execute: async (_toolCallId, params) => {
          const role = (params.role as string) ?? "scout";
          const taskDesc = (params.task as string) ?? "";
          const context = params.context as string | undefined;

          if (subRunCount >= MAX_SUB_RUNS) {
            return {
              content: [
                { type: "text" as const, text: `Sub-run limit reached (${MAX_SUB_RUNS}). Cannot delegate further.` },
              ],
              details: { blocked: true, reason: "maxSubRuns" },
            };
          }
          subRunCount++;

          const startPayload = { role, task: taskDesc, subRunIndex: subRunCount };
          const startId = await recordEvent(runtime, runId, agent.id, "sub_run_started", startPayload);
          eventIds.push(startId);
          emitLiveEvent(startId, "sub_run_started", startPayload);

          const subPrompt = buildSubRunPrompt({
            role,
            task: taskDesc,
            context,
            agentInstructions: agent.instructions,
          });

          // Sub-run gets same tools minus spawn_sub_run (prevents recursion)
          const subTools = allTools.filter((t) => t.name !== "spawn_sub_run");
          const subToolConfigLookup = createToolConfigLookup(agent, subTools);

          try {
            const subResult = await executePiAgent({
              systemPrompt: subPrompt,
              userPrompt: taskDesc,
              workspacePath,
              composioTools: subTools,
              onEvent: async (event) => {
                const id = await recordEvent(
                  runtime,
                  runId,
                  agent.id,
                  event.type as "tool_called" | "tool_executed" | "agent_message",
                  { ...event.payload, subRunRole: role },
                );
                eventIds.push(id);
                emitLiveEvent(id, event.type, { ...event.payload, subRunRole: role });
                return id;
              },
              beforeToolCall: async (toolName, args) => {
                const toolInput = normalizeToolInput(args);
                const policy = evaluatePolicy(
                  {
                    toolName,
                    toolInput,
                    toolConfig: getToolConfigForCall(agent, subToolConfigLookup, toolName),
                  },
                  {
                    now: new Date(),
                    globalApprovalRequired: agent.toolConfig.globalApprovalRequired,
                    recentToolCalls,
                    learnedRules,
                  },
                );
                if (policy.result === "auto") return undefined;
                if (policy.result === "blocked") return { block: true, reason: policy.reason };
                return handleApprovalRequest({
                  runtime,
                  agent,
                  runId,
                  toolName,
                  toolInput,
                  policyReason: policy.reason,
                  eventIds,
                  emitLiveEvent,
                  projectId: payload.projectId,
                });
              },
            });

            const completePayload = { role, success: true, outputLength: subResult.output.length };
            const completeId = await recordEvent(runtime, runId, agent.id, "sub_run_completed", completePayload);
            eventIds.push(completeId);
            emitLiveEvent(completeId, "sub_run_completed", completePayload);

            return {
              content: [{ type: "text" as const, text: subResult.output || "(No output)" }],
              details: { role, success: true, durationMs: subResult.durationMs },
            };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const failPayload = { role, success: false, error: errorMsg };
            const failId = await recordEvent(runtime, runId, agent.id, "sub_run_completed", failPayload);
            eventIds.push(failId);
            emitLiveEvent(failId, "sub_run_completed", failPayload);

            return {
              content: [{ type: "text" as const, text: `Specialist (${role}) failed: ${errorMsg}` }],
              details: { role, success: false, error: errorMsg },
            };
          }
        },
      };

      allTools.push(spawnSubRunTool);
      const toolConfigLookup = createToolConfigLookup(agent, allTools);

      logger.info("Prompt assembled", {
        systemPromptLength: promptBundle.system.length,
        systemPromptPreview: promptBundle.system.slice(0, 500),
        userPromptPreview: promptBundle.user.slice(0, 500),
        skills: promptBundle.selectedSkills.map((s) => s.id),
        activeProviders: runtime.activeProviders,
        toolCount: allTools.length,
        toolNames: allTools.map((t) => t.name),
        workspacePath,
      });

      const piResult = await executePiAgent({
        systemPrompt: promptBundle.system,
        userPrompt: promptBundle.user,
        workspacePath,
        composioTools: allTools,
        onEvent: async (event) => {
          if (event.type === "tool_executed") {
            recentToolCalls.push({ toolName: event.payload.toolName as string, timestamp: new Date() });
          }
          const id = await recordEvent(
            runtime,
            runId,
            agent.id,
            event.type as "tool_called" | "tool_executed" | "agent_message",
            event.payload,
          );
          eventIds.push(id);
          emitLiveEvent(id, event.type, event.payload);
          return id;
        },
        beforeToolCall: async (toolName, args) => {
          const toolInput = normalizeToolInput(args);

          const policy = evaluatePolicy(
            {
              toolName,
              toolInput,
              toolConfig: getToolConfigForCall(agent, toolConfigLookup, toolName),
            },
            {
              now: new Date(),
              globalApprovalRequired: agent.toolConfig.globalApprovalRequired,
              recentToolCalls,
              learnedRules,
            },
          );

          if (policy.result === "auto") return undefined;
          if (policy.result === "blocked") return { block: true, reason: policy.reason };

          // Human approval needed — create token, persist, notify, checkpoint
          return handleApprovalRequest({
            runtime,
            agent,
            runId,
            toolName,
            toolInput,
            policyReason: policy.reason,
            eventIds,
            emitLiveEvent,
            projectId: payload.projectId,
          });
        },
      });

      if (piResult.output.trim()) {
        const findingPayload = { text: piResult.output };
        const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
        eventIds.push(findingId);
        emitLiveEvent(findingId, "finding_recorded", findingPayload);
      }

      const summary = buildSummary({
        status: "completed",
        finalText: piResult.output,
        agent,
        runId,
        recentToolCalls: piResult.toolCalls,
        eventIds,
      });
      await runtime.runRepository.complete(runId, new Date(), summary);

      const completePayload = { summary };
      const completeId = await recordEvent(runtime, runId, agent.id, "run_completed", completePayload);
      eventIds.push(completeId);
      emitLiveEvent(completeId, "run_completed", completePayload);
      metadata.set("status", "completed");

      await recordRunResultInConversation(runtime, agent.id, summary);

      const lessonWrites = classifyRunLessonWrites({
        headline: summary.headline,
        finalText: summary.finalText,
        details: summary.details,
        findingCount: 0,
        toolCallCount: piResult.toolCalls.length,
      });
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
        emitLiveEvent(lessonEventId, "lesson_distilled", lessonPayload);
      }

      logger.info("Agent run completed", {
        runId,
        agentId: agent.id,
        triggerType: payload.trigger.type,
        durationMs: piResult.durationMs,
        toolCallCount: piResult.toolCalls.length,
      });

      return { runId, agentId: agent.id, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isApprovalTerminal = error instanceof ApprovalCheckpointError;
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
      emitLiveEvent(failId, "run_failed", failPayload);
      metadata.set("status", "failed");
      await runtime.runRepository.fail(runId, new Date(), message, summary);
      await recordRunResultInConversation(runtime, agent.id, summary);
      logger.error("Agent run failed", { runId, agentId: agent.id, error: message });
      if (!isApprovalTerminal) {
        throw error;
      }
      return { runId, agentId: agent.id, summary };
    }
  },
});

async function ensureRunRecord(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
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

async function handleApprovalRequest(params: {
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>;
  agent: AgentRecord;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  policyReason: string;
  eventIds: string[];
  emitLiveEvent: (id: string, type: string, payload: Record<string, unknown>) => void;
  projectId: string;
}): Promise<{ block: boolean; reason?: string } | undefined> {
  const { runtime, agent, runId, toolName, toolInput, policyReason, eventIds, emitLiveEvent, projectId } = params;
  const approvalId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  const token = await wait.createToken({
    idempotencyKey: `approval-${runId}-${approvalId}`,
    timeout: "24h",
    tags: [projectId, agent.id, runId, approvalId, toolName],
  });

  const approvalRecordId = await runtime.approvalRepository.create({
    runId,
    agentId: agent.id,
    approvalId,
    waitTokenId: token.id,
    toolName,
    toolInput,
    requestReason: policyReason,
    createdAt,
    expiresAt,
  });

  const reqPayload = {
    approvalId: approvalRecordId,
    toolName,
    toolInput,
    requestReason: policyReason,
    reason: policyReason,
    policy: "approval",
    expiresAt: expiresAt.toISOString(),
  };
  const reqId = await recordEvent(runtime, runId, agent.id, "tool_approval_requested", reqPayload);
  eventIds.push(reqId);
  emitLiveEvent(reqId, "tool_approval_requested", reqPayload);
  await runtime.approvalRepository.setRequestEventId(approvalRecordId, reqId);

  await runtime.runRepository.markWaitingForApproval(runId);
  metadata.set("status", "waiting_for_approval");

  // Container checkpoints here — resumes when human responds
  let decision: { decision: string; reason?: string };
  let timedOut = false;
  try {
    decision = (await wait.forToken<{ decision: string; reason?: string }>(token).unwrap()) ?? {
      decision: "rejected",
      reason: "Token completed without data",
    };
  } catch (err) {
    timedOut = isApprovalTimeoutError(err);
    decision = {
      decision: timedOut ? "expired" : "rejected",
      reason: timedOut ? "Approval expired after 24 hours" : err instanceof Error ? err.message : String(err),
    };
  }

  const status =
    decision.decision === "approved" ? "approved" : decision.decision === "expired" ? "expired" : "rejected";
  let reason = decision.reason ?? policyReason;

  const approvalRow = await runtime.approvalRepository.getById(approvalRecordId);
  const wasAlreadyResolved = approvalRow?.status && approvalRow.status !== "pending";

  if (!wasAlreadyResolved) {
    if (status === "expired") {
      await runtime.approvalRepository.markExpired(approvalRecordId, reason, new Date());
      const expiryPayload = {
        approvalId: approvalRecordId,
        toolName,
        reason,
        expiresAt: expiresAt.toISOString(),
      };
      const expiryId = await recordEvent(runtime, runId, agent.id, "tool_approval_expired", expiryPayload);
      eventIds.push(expiryId);
      emitLiveEvent(expiryId, "tool_approval_expired", expiryPayload);
    } else {
      await runtime.approvalRepository.markResolved(approvalRecordId, status, reason, new Date());

      const resPayload = { approvalId: approvalRecordId, toolName, status, reason };
      const resId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", resPayload);
      eventIds.push(resId);
      emitLiveEvent(resId, "tool_approval_resolved", resPayload);

      const suggestions = await detectAndSuggestLearnedRules({
        agentId: agent.id,
        approvalRepository: runtime.approvalRepository,
        learnedRuleRepository: runtime.learnedRuleRepository,
      });
      await appendPolicySuggestionEvents({
        runtime,
        runId,
        agentId: agent.id,
        suggestions,
        eventIds,
        emitLiveEvent,
      });
    }
  } else {
    reason = approvalRow?.decisionReason ?? reason;
    const liveStatus = approvalRow?.status;
    if (liveStatus && liveStatus !== "pending") {
      emitLiveEvent(
        `approval-${approvalRecordId}-${liveStatus}`,
        liveStatus === "expired" ? "tool_approval_expired" : "tool_approval_resolved",
        {
          approvalId: approvalRecordId,
          toolName,
          status: liveStatus,
          reason,
          ...(liveStatus === "expired" ? { expiresAt: expiresAt.toISOString() } : {}),
        },
      );
    }
  }

  if ((approvalRow?.status ?? status) === "approved") {
    await runtime.runRepository.markRunning(runId);
    metadata.set("status", "running");
    return undefined;
  }

  throw new ApprovalCheckpointError(reason, (approvalRow?.status ?? status) === "expired" ? "expired" : "rejected");
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

async function recordEvent(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  runId: string,
  agentId: string,
  type:
    | "run_started"
    | "prompt_built"
    | "tool_called"
    | "tool_executed"
    | "tool_approval_requested"
    | "tool_approval_resolved"
    | "tool_approval_expired"
    | "policy_rule_suggested"
    | "agent_message"
    | "finding_recorded"
    | "sub_run_started"
    | "sub_run_completed"
    | "lesson_distilled"
    | "run_completed"
    | "run_failed",
  payload: Record<string, unknown>,
): Promise<string> {
  const id = await runtime.runEventRepository.append({
    runId,
    agentId,
    timestamp: new Date(),
    type,
    payload,
  });

  logger.info("Agent run event", { runId, agentId, type });
  return id;
}

async function recordRunResultInConversation(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  agentId: string,
  summary: RunSummary,
) {
  const thread = await runtime.conversationThreadRepository.getOrCreatePrimary(agentId);
  await runtime.conversationEventRepository.append({
    threadId: thread.id,
    agentId,
    source: "run",
    role: "system",
    eventType: "run_result",
    payload: {
      status: summary.status,
      headline: summary.headline,
      details: summary.details,
      finalText: summary.finalText,
    },
    createdAt: new Date(),
  });
}

const INTERNAL_TOOL_MODES: Record<string, ToolMode> = {
  bash: "write",
  edit: "write",
  read: "read",
  spawn_sub_run: "write",
  submit_report: "read",
  write: "write",
};

class ApprovalCheckpointError extends Error {
  constructor(
    message: string,
    readonly status: "rejected" | "expired",
  ) {
    super(message);
    this.name = "ApprovalCheckpointError";
  }
}

function createToolConfigLookup(agent: AgentRecord, tools: PiToolDefinition[]): Map<string, ToolConfigEntry> {
  const lookup = new Map<string, ToolConfigEntry>();

  for (const tool of tools) {
    lookup.set(
      tool.name,
      buildToolConfigEntry(
        {
          toolName: tool.name,
          slug: tool.name,
          provider: inferToolProvider(tool.name),
          title: tool.label,
          description: tool.description,
          mode: INTERNAL_TOOL_MODES[tool.name],
        },
        agent.toolConfig.tools[tool.name],
      ),
    );
  }

  return lookup;
}

function getToolConfigForCall(
  agent: AgentRecord,
  lookup: Map<string, ToolConfigEntry>,
  toolName: string,
): ToolConfigEntry {
  const existing = lookup.get(toolName) ?? agent.toolConfig.tools[toolName];
  if (existing) {
    return existing.provider === "internal" && !agent.toolConfig.tools[toolName]
      ? { ...existing, approvalMode: "auto" }
      : existing;
  }

  const inferred = buildToolConfigEntry({
    toolName,
    slug: toolName,
    provider: inferToolProvider(toolName),
    title: toolName,
    description: "",
    mode: INTERNAL_TOOL_MODES[toolName],
  });

  return inferred.provider === "internal" ? { ...inferred, approvalMode: "auto" } : inferred;
}

function inferToolProvider(toolName: string): string {
  if (toolName in INTERNAL_TOOL_MODES) {
    return "internal";
  }

  const [prefix] = toolName.split("_");
  return prefix?.toLowerCase() ?? "";
}

function isApprovalTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(timeout|timed out|expired)\b/i.test(message);
}

async function appendPolicySuggestionEvents(params: {
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>;
  runId: string;
  agentId: string;
  suggestions: LearnedPolicyRule[];
  eventIds: string[];
  emitLiveEvent: (id: string, type: string, payload: Record<string, unknown>) => void;
}) {
  for (const suggestion of params.suggestions) {
    const payload = {
      ruleId: suggestion.id,
      toolName: suggestion.toolName,
      learnedDecision: suggestion.learnedDecision,
      evidenceCount: suggestion.evidenceCount,
      consistencyRate: suggestion.consistencyRate,
      conditions: suggestion.conditions,
    };
    const eventId = await recordEvent(params.runtime, params.runId, params.agentId, "policy_rule_suggested", payload);
    params.eventIds.push(eventId);
    params.emitLiveEvent(eventId, "policy_rule_suggested", payload);
  }
}

function buildSummary(params: {
  status: "completed" | "failed";
  finalText: string;
  agent: AgentRecord;
  runId: string;
  recentToolCalls: Array<{ toolName: string; timestamp: Date }>;
  eventIds: string[];
  error?: string;
}): RunSummary {
  const normalizedText = params.finalText.trim();
  const headline =
    normalizedText.split(/\n|\./, 1)[0]?.trim().slice(0, 140) ||
    (params.status === "completed" ? `${params.agent.name} completed` : `${params.agent.name} failed`);

  const details = [
    params.error ? `Error: ${params.error}` : undefined,
    normalizedText ? normalizedText : undefined,
    params.recentToolCalls.length > 0
      ? `Tool calls executed: ${params.recentToolCalls.map((call) => call.toolName).join(", ")}`
      : undefined,
    `Events recorded: ${params.eventIds.length}`,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);

  return {
    status: params.status,
    headline,
    details,
    ...(normalizedText ? { finalText: normalizedText } : {}),
  };
}
