/**
 * pi-coding-agent runtime wrapper for agent runs.
 *
 * Replaces the bare generateText() loop with a full pi-coding-agent session
 * that has built-in coding tools (bash, read, edit, write) plus Composio
 * API tools injected as custom tools.
 *
 * The agent can now actually DO things: fetch web pages, read/write files,
 * run scripts, iterate on problems — not just call API endpoints.
 */

import { existsSync, mkdirSync } from "node:fs";
import { getModel, registerBuiltInApiProviders } from "@mariozechner/pi-ai";
import { createAgentSession, createCodingTools, SessionManager } from "@mariozechner/pi-coding-agent";
import { logger } from "@trigger.dev/sdk/v3";

// Register all built-in providers (anthropic, openai, zai, etc.)
registerBuiltInApiProviders();

interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>;
}

export interface PiAgentConfig {
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;
  composioTools: PiToolDefinition[];
  onEvent: (event: { type: string; payload: Record<string, unknown> }) => Promise<string>;
}

export interface PiAgentResult {
  output: string;
  toolCalls: Array<{ toolName: string; timestamp: Date }>;
  durationMs: number;
}

function createPiModel() {
  const provider = process.env.LLM_PROVIDER ?? "zai";
  const modelName = process.env.LLM_MODEL ?? "glm-5-turbo";

  return getModel(provider as any, modelName as any);
}

export async function executePiAgent(config: PiAgentConfig): Promise<PiAgentResult> {
  const start = Date.now();

  if (!existsSync(config.workspacePath)) {
    mkdirSync(config.workspacePath, { recursive: true });
  }

  const model = createPiModel();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    tools: createCodingTools(config.workspacePath),
    customTools: config.composioTools as any,
    sessionManager: SessionManager.inMemory(),
    cwd: config.workspacePath,
  });

  // systemPrompt is a read-only getter — _baseSystemPrompt is the internal setter
  (session as any)._baseSystemPrompt = config.systemPrompt;

  let output = "";
  const toolCalls: PiAgentResult["toolCalls"] = [];

  session.subscribe((e: any) => {
    if (e.type === "tool_execution_start") {
      const payload = { toolName: e.toolName, input: e.input };
      logger.info(`Tool called: ${e.toolName}`, { inputPreview: JSON.stringify(e.input).slice(0, 500) });
      config.onEvent({ type: "tool_called", payload }).catch((err) => {
        logger.error("Failed to record tool_called event", { error: String(err) });
      });
    }

    if (e.type === "tool_execution_end") {
      toolCalls.push({ toolName: e.toolName, timestamp: new Date() });

      if (!e.isError) {
        const outputStr = typeof e.result === "string" ? e.result : JSON.stringify(e.result);
        const payload = {
          toolName: e.toolName,
          output: outputStr.slice(0, 2000),
        };
        logger.info(`Tool executed: ${e.toolName}`, { outputPreview: outputStr.slice(0, 500) });
        config.onEvent({ type: "tool_executed", payload }).catch((err) => {
          logger.error("Failed to record tool_executed event", { error: String(err) });
        });
      } else {
        logger.error(`Tool failed: ${e.toolName}`, { error: e.error ?? e.result });
      }
    }

    if (e.type === "message_end") {
      const msg = e.message;
      if (msg?.role === "assistant") {
        for (const block of msg.content ?? []) {
          if (block.type === "text" && block.text?.trim()) {
            output = block.text.trim();
          }
        }
      }
    }
  });

  logger.info("Starting pi-coding-agent session", {
    workspacePath: config.workspacePath,
    systemPromptLength: config.systemPrompt.length,
    userPromptLength: config.userPrompt.length,
    composioToolCount: config.composioTools.length,
    composioToolNames: config.composioTools.map((t) => t.name),
    builtInTools: "bash, read, edit, write",
  });

  try {
    await session.prompt(config.userPrompt);
  } finally {
    session.dispose();
  }

  logger.info("pi-coding-agent session completed", {
    durationMs: Date.now() - start,
    outputLength: output.length,
    outputPreview: output.slice(0, 500),
    toolCallCount: toolCalls.length,
  });

  return {
    output,
    toolCalls,
    durationMs: Date.now() - start,
  };
}
