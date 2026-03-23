import { ToolLoopAgent, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { createModel } from "../skills/executor";

import type { MemoryStore } from "../types/memory";
import type { SkillRegistry } from "../skills/registry";
import type { ConnectionManager } from "../connections/types";
import type { ContextAssembler } from "../context/assembler";
import type { ApprovalRepository } from "../repositories/approval";
import type { RunRepository } from "../repositories/run";
import type { ChatSessionStore } from "../repositories/chat-session";
import type { WorkspaceStore } from "../workspace/store";
import type { AgentConfig } from "../types/agent-config";
import type { PipelineDependencies } from "../pipeline/runner";
import { runPipeline } from "../pipeline/runner";

import { createReadWorkspaceTool } from "./tools/read-workspace";
import { createWriteScratchpadTool } from "./tools/write-scratchpad";
import { createGenerateReportTool } from "./tools/generate-report";
import { createRunAnalysisTool } from "./tools/run-analysis";
import { createQueryMemoryTool } from "./tools/query-memory";
import { createGetInsightsTool } from "./tools/get-insights";
import { createApplyActionTool } from "./tools/apply-action";
import { createExplainDecisionTool } from "./tools/explain-decision";

// ---------------------------------------------------------------------------
// ChatDependencies — all external dependencies the chat handler needs
// ---------------------------------------------------------------------------

export interface ChatDependencies {
  memoryStore: MemoryStore;
  skillRegistry: SkillRegistry;
  connectionManager: ConnectionManager;
  contextAssembler: ContextAssembler;
  approvalRepository: ApprovalRepository;
  runRepository: RunRepository;
  chatSessionStore: ChatSessionStore;
  workspaceStore: WorkspaceStore;
}

// ---------------------------------------------------------------------------
// handleChat — the main chat handler (Mode 2)
// ---------------------------------------------------------------------------

export async function handleChat(params: {
  agentId: string;
  config: AgentConfig;
  message: string;
  deps: ChatDependencies;
}): Promise<{
  response: string;
  toolCalls: Array<{ toolName: string; args: unknown; result: unknown }>;
}> {
  const { agentId, config, message, deps } = params;

  // Step 1: Get chat context
  const context = await deps.contextAssembler.forChat(agentId);

  // Step 2: Load chat history
  const history = await deps.chatSessionStore.loadHistory(agentId, 50);

  // Step 3: Convert history to AI SDK ModelMessage format
  // Skip "tool" role messages — AI SDK handles tool results internally
  const historyMessages: ModelMessage[] = history
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Step 4: Save user message
  await deps.chatSessionStore.append({
    agentId,
    role: "user",
    content: message,
  });

  // Step 5: Build all 8 tools using factory functions
  const tools = {
    read_workspace: createReadWorkspaceTool(deps.workspaceStore),
    write_scratchpad: createWriteScratchpadTool(deps.workspaceStore),
    generate_report: createGenerateReportTool(deps.workspaceStore),
    run_analysis: createRunAnalysisTool({
      runPipeline,
      pipelineDeps: buildPipelineDeps(deps),
      config,
      agentId,
    }),
    query_memory: createQueryMemoryTool({
      memoryStore: deps.memoryStore,
      agentId,
    }),
    get_insights: createGetInsightsTool({
      memoryStore: deps.memoryStore,
      agentId,
    }),
    apply_action: createApplyActionTool({
      approvalRepository: deps.approvalRepository,
      connectionManager: deps.connectionManager,
      agentId,
    }),
    explain_decision: createExplainDecisionTool({
      memoryStore: deps.memoryStore,
      agentId,
    }),
  };

  // Step 6: Call AI SDK ToolLoopAgent
  const agent = new ToolLoopAgent({
    model: createModel(config.model),
    instructions: context.systemPrompt,
    tools,
    stopWhen: stepCountIs(5),
  });

  const result = await agent.generate({
    messages: [
      ...historyMessages,
      { role: "user" as const, content: message },
    ],
  });

  // Step 7: Save assistant response
  await deps.chatSessionStore.append({
    agentId,
    role: "assistant",
    content: result.text,
  });

  // Step 8: Build toolCalls from result.steps
  const toolCalls: Array<{ toolName: string; args: unknown; result: unknown }> =
    [];

  for (const step of result.steps) {
    if (step.toolCalls && step.toolResults) {
      for (let i = 0; i < step.toolCalls.length; i++) {
        const tc = step.toolCalls[i];
        const tr = step.toolResults[i];
        toolCalls.push({
          toolName: tc.toolName,
          args: tc.input,
          result: tr?.result,
        });
      }
    }
  }

  // Step 9: Return response and toolCalls
  return {
    response: result.text,
    toolCalls,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build PipelineDependencies from ChatDependencies.
 * The pipeline needs a subset of what the chat handler has.
 */
function buildPipelineDeps(deps: ChatDependencies): PipelineDependencies {
  return {
    memoryStore: deps.memoryStore,
    skillRegistry: deps.skillRegistry,
    connectionManager: deps.connectionManager,
    contextAssembler: deps.contextAssembler,
    approvalRepository: deps.approvalRepository,
    runRepository: deps.runRepository,
  };
}
