import crypto from "node:crypto";
import type { AgentToolDefinition } from "@nochore/harness";
import type { UIMessage } from "ai";
import type { AgentRow, ProjectDeps } from "./deps";

export interface BeginChatTurnParams {
  deps: ProjectDeps;
  projectId: string;
  agent: AgentRow;
  threadId: string;
  rawMessages: UIMessage[];
  system: string;
  memoryContext: string;
  providerTools: Record<string, unknown>;
  connectionBindingCount: number;
  latestUserText: string;
}

export interface BegunChatTurn {
  sessionId: string;
  workItemId: string;
  contextSnapshotId: string;
}

export async function beginChatTurn(params: BeginChatTurnParams): Promise<BegunChatTurn> {
  const contextKey = webThreadContextKey(params.threadId);
  const session = await params.deps.agentSessionRepository.getOrCreateForContext({
    projectId: params.projectId,
    agentId: params.agent.id,
    conversationThreadId: params.threadId,
    contextKey,
    status: "idle",
  });

  const workItemId = await params.deps.workItemRepository.create({
    sessionId: session.id,
    agentId: params.agent.id,
    kind: "chat_turn",
    status: "running",
    title: "Chat turn",
    input: {
      threadId: params.threadId,
      latestUserText: params.latestUserText.slice(0, 2000),
      messageCount: params.rawMessages.length,
    },
  });

  const toolNames = Object.keys(params.providerTools).sort();
  const payload = {
    executor: "inline-ai-sdk",
    threadId: params.threadId,
    messageCount: params.rawMessages.length,
    latestMessageId: latestMessageId(params.rawMessages),
    systemLength: params.system.length,
    memoryContextLength: params.memoryContext.length,
    toolNames,
    connectionBindingCount: params.connectionBindingCount,
    agentConfig: {
      schedule: params.agent.config.schedule,
      skillCount: params.agent.config.skills.length,
      globalApprovalRequired: params.agent.config.toolConfig.globalApprovalRequired,
    },
  };
  const contextSnapshotId = await params.deps.contextSnapshotRepository.create({
    sessionId: session.id,
    agentId: params.agent.id,
    workItemId,
    conversationThreadId: params.threadId,
    kind: "chat_turn",
    messagesVersion: messageVersion(params.rawMessages),
    memoryVersion: hashVersion("memory", params.memoryContext),
    toolBindingsVersion: hashVersion("tools", toolNames.join(",")),
    policyVersion: hashVersion("policy", JSON.stringify(params.agent.config.toolConfig)),
    promptHash: hashVersion("prompt", params.system),
    payload,
  });

  await params.deps.agentSessionRepository.update(session.id, {
    status: "thinking",
    activeWorkItemId: workItemId,
    lastContextSnapshotId: contextSnapshotId,
    lastActiveAt: new Date(),
  });

  return { sessionId: session.id, workItemId, contextSnapshotId };
}

export async function completeChatTurn(
  deps: ProjectDeps,
  turn: BegunChatTurn,
  result?: Record<string, unknown>,
): Promise<void> {
  await deps.workItemRepository.complete(turn.workItemId, new Date(), result);
  await deps.agentSessionRepository.update(turn.sessionId, {
    status: "idle",
    activeWorkItemId: null,
    lastActiveAt: new Date(),
  });
}

export async function failChatTurn(deps: ProjectDeps, turn: BegunChatTurn, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await deps.workItemRepository.fail(turn.workItemId, new Date(), message);
  await deps.agentSessionRepository.update(turn.sessionId, {
    status: "failed",
    activeWorkItemId: null,
    lastActiveAt: new Date(),
  });
}

export function webThreadContextKey(threadId: string): string {
  return `web:${threadId}`;
}

export function toolNamesFromDefinitions(tools: AgentToolDefinition[]): string {
  return tools
    .map((tool) => tool.name)
    .sort()
    .join(",");
}

function latestMessageId(messages: UIMessage[]): string | undefined {
  return [...messages].reverse().find((message) => message.id)?.id;
}

function messageVersion(messages: UIMessage[]): string {
  return hashVersion(
    "messages",
    JSON.stringify({
      count: messages.length,
      latestId: latestMessageId(messages) ?? null,
      roles: messages.map((message) => message.role),
    }),
  );
}

function hashVersion(prefix: string, value: string): string {
  return `${prefix}:sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}
