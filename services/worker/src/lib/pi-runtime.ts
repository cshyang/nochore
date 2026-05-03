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
import type { AgentToolDefinition } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk/v3";
import type { AgentExecutionResult, AgentExecutor, AgentExecutorConfig } from "./agent-executor";

let providersRegistered = false;
function ensureProviders() {
  if (!providersRegistered) {
    registerBuiltInApiProviders();
    providersRegistered = true;
  }
}

function createPiModel() {
  ensureProviders();
  const provider = process.env.AGENT_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? "anthropic";
  const modelName = process.env.AGENT_LLM_MODEL ?? process.env.LLM_MODEL ?? "claude-sonnet-4-6";

  logger.info(`Creating pi model: ${provider}/${modelName}`);
  return getModel(provider as any, modelName as any);
}

/** Max times we'll re-prompt if the agent didn't call submit_report. */
const MAX_RETRY_ATTEMPTS = 2;

export const defaultAgentExecutor: AgentExecutor = executeWithPiCodingAgent;

async function executeWithPiCodingAgent(config: AgentExecutorConfig): Promise<AgentExecutionResult> {
  const start = Date.now();

  if (!existsSync(config.workspacePath)) {
    mkdirSync(config.workspacePath, { recursive: true });
  }

  const model = createPiModel();

  // ── submit_report tool ──────────────────────────────────────────────
  // The agent MUST call this to deliver its final output. Captures in
  // closure — no text-block guessing, no overwrite bugs.
  let report = "";
  const submitReportTool: AgentToolDefinition = {
    name: "submit_report",
    label: "Submit Report",
    description:
      "Submit your final response in the format required by the system prompt. Call this exactly once before finishing. " +
      "Lead with your conclusion in the first sentence — no vanity titles, no restating who you are. " +
      "Match depth to what was asked: a focused question gets a focused answer, a broad sweep gets a broader one. " +
      "Structure the response around what was asked, not a fixed template.",
    parameters: {
      type: "object",
      properties: {
        report: {
          type: "string",
          description: "The full final response in the format required by the system prompt.",
        },
      },
      required: ["report"],
    },
    execute: async (_toolCallId, params) => {
      report = (params.report as string) ?? "";
      return {
        content: [{ type: "text" as const, text: "Report submitted successfully." }],
        details: { length: report.length },
      };
    },
  };

  const allTools = [...config.tools, submitReportTool];

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    tools: createCodingTools(config.workspacePath),
    customTools: allTools as any,
    sessionManager: SessionManager.inMemory(),
    cwd: config.workspacePath,
  });

  // systemPrompt is a read-only getter — _baseSystemPrompt is the internal setter
  (session as any)._baseSystemPrompt = config.systemPrompt;

  // Wire native pre-tool hook for approval gates
  if (config.beforeToolCall) {
    const hook = config.beforeToolCall;
    (session as any).agent.setBeforeToolCall(async (context: any) => {
      return hook(context.toolCall.name, context.args);
    });
  }

  let lastStopReason = "";
  const toolCalls: AgentExecutionResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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

    if (e.type === "turn_end") {
      const msg = e.message;
      // Accumulate token usage across turns
      if (msg?.usage) {
        totalInputTokens += msg.usage.promptTokens ?? msg.usage.inputTokens ?? 0;
        totalOutputTokens += msg.usage.completionTokens ?? msg.usage.outputTokens ?? 0;
      }
      if (msg?.stopReason) {
        lastStopReason = msg.stopReason;
        const logMeta: Record<string, unknown> = {
          turnIndex: e.turnIndex,
          toolResultCount: e.toolResults?.length ?? 0,
        };
        if (msg.stopReason === "error") {
          logMeta.errorMessage = msg.errorMessage ?? "unknown";
          logMeta.usage = msg.usage;
          logger.error(`Turn ended: stopReason=error`, logMeta);
        } else {
          logger.info(`Turn ended: stopReason=${msg.stopReason}`, logMeta);
        }
      }
    }

    // Emit agent text as events for the live view
    if (e.type === "message_end") {
      const msg = e.message;
      if (msg?.role === "assistant") {
        for (const block of msg.content ?? []) {
          if (block.type === "text" && block.text?.trim()) {
            const text = block.text.trim();
            config.onEvent({ type: "agent_message", payload: { text: text.slice(0, 2000) } }).catch((err) => {
              logger.error("Failed to record agent_message event", { error: String(err) });
            });
          }
        }
      }
    }
  });

  logger.info("Starting pi-coding-agent session", {
    workspacePath: config.workspacePath,
    systemPromptLength: config.systemPrompt.length,
    userPromptLength: config.userPrompt.length,
    customToolCount: config.tools.length,
    customToolNames: config.tools.map((t) => t.name),
    builtInTools: "bash, read, edit, write, submit_report",
  });

  try {
    // prompt() runs the full agent loop internally:
    // agent_start → [turn_start → LLM + tools → turn_end]* → agent_end
    // It continues until the LLM stops making tool calls.
    await session.prompt(config.userPrompt);

    // If the agent didn't submit its report, re-prompt.
    // Handles both stopReason="length" (truncation) and "stop" (model chose to end early).
    let retries = 0;
    while (!report && retries < MAX_RETRY_ATTEMPTS) {
      retries++;
      logger.warn(`Report not submitted, re-prompting (attempt ${retries}/${MAX_RETRY_ATTEMPTS})`, {
        lastStopReason,
      });
      await session.prompt("You have not called submit_report yet. Call it now with your complete analysis.");
    }

    if (!report) {
      logger.warn("Agent finished without calling submit_report after retries");
    }
  } finally {
    session.dispose();
  }

  const output = report;
  logger.info("pi-coding-agent session completed", {
    durationMs: Date.now() - start,
    outputLength: output.length,
    outputPreview: output.slice(0, 500),
    toolCallCount: toolCalls.length,
    reportSubmitted: report.length > 0,
  });

  return {
    output,
    toolCalls,
    durationMs: Date.now() - start,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
