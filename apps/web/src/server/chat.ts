/**
 * Chat server functions.
 *
 * Bridges the frontend AgentChat component to the harness chat handler.
 * Uses StubConnectionManager until Composio integration is wired.
 */

import { createServerFn } from "@tanstack/react-start";
import { handleChat } from "../../../../packages/harness/src/chat/handler";
import { StubConnectionManager } from "../../../../packages/harness/src/connections/stub";
import { getProjectDeps, getAgentDeps, getAgentRow } from "./deps";
import { jsonSafe } from "./serializable";

// ---------------------------------------------------------------------------
// sendChat — send a message to an agent and get a response
// ---------------------------------------------------------------------------

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { agentId: string; projectId: string; message: string }) => input,
  )
  .handler(async ({ data: { agentId, projectId, message } }) => {
    // Load agent config from DB
    const agent = getAgentRow(projectId, agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const agentDeps = getAgentDeps(projectId, agent.config);

    // Stub connection manager until Composio integration is complete
    const connectionManager = new StubConnectionManager({ data: {} });

    const result = await handleChat({
      agentId,
      config: agent.config,
      message,
      deps: {
        ...agentDeps,
        connectionManager,
      },
    });

    return jsonSafe(result);
  });

// ---------------------------------------------------------------------------
// getChatHistory — load chat history for an agent
// ---------------------------------------------------------------------------

export const getChatHistory = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { agentId: string; projectId: string; limit?: number }) => input,
  )
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const { chatSessionStore } = getProjectDeps(projectId);
    const messages = await chatSessionStore.loadHistory(agentId, limit ?? 50);
    return jsonSafe(messages);
  });
