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
import { getModel, getModels, getProviders, registerBuiltInApiProviders } from "@mariozechner/pi-ai";
import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager } from "@mariozechner/pi-coding-agent";
import type { AgentToolDefinition } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import type { AgentExecutionResult, AgentExecutor, AgentExecutorConfig } from "./agent-executor";

let providersRegistered = false;
function ensureProviders() {
  if (!providersRegistered) {
    registerBuiltInApiProviders();
    providersRegistered = true;
  }
}

/**
 * Resolve a model reference to a pi-ai Model object.
 *
 * Accepts canonical "<provider>/<id>" (e.g. "zai/glm-5.1") or a bare id
 * (e.g. "glm-5.1") if it is unambiguous across registered providers.
 * Throws on miss — better a loud failure than the previous silent
 * empty-output behavior when the model wasn't in pi-ai's registry.
 */
function resolvePiModel(reference: string) {
  const slash = reference.indexOf("/");
  if (slash !== -1) {
    const provider = reference.slice(0, slash).trim();
    const id = reference.slice(slash + 1).trim();
    const model = getModel(provider as any, id as any);
    if (model) return model;
    throw new Error(
      `Model not found: provider "${provider}" has no model "${id}". Set AGENT_LLM_MODEL to a valid <provider>/<id>.`,
    );
  }
  const all = getProviders().flatMap((provider) => getModels(provider));
  const matches = all.filter((model) => model.id === reference);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`Model "${reference}" not found in any registered provider. Use <provider>/<id> form.`);
  }
  const providers = matches
    .map((model) => model.provider)
    .sort()
    .join(", ");
  throw new Error(
    `Model "${reference}" is ambiguous (registered under: ${providers}). Use <provider>/${reference} form.`,
  );
}

function createPiModel() {
  ensureProviders();
  const reference = process.env.AGENT_LLM_MODEL ?? process.env.LLM_MODEL ?? "anthropic/claude-sonnet-4-7";
  logger.info(`Resolving pi model: ${reference}`);
  const model = resolvePiModel(reference);
  logger.info(`Resolved to: ${model.provider}/${model.id} via ${model.api}`);
  return model;
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

  // Inject the system prompt via the public ResourceLoader path. Poking
  // session._baseSystemPrompt directly stopped working in 0.70 — the agent
  // rebuilds the system prompt from _baseSystemPromptOptions whenever the
  // tool set changes, which would overwrite our injection.
  const resourceLoader = new DefaultResourceLoader({
    cwd: config.workspacePath,
    agentDir: getAgentDir(),
    systemPrompt: config.systemPrompt,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    // tools: omitted — defaults to ["read", "bash", "edit", "write"]
    customTools: allTools as any,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    cwd: config.workspacePath,
  });

  // Wire native pre-tool hook for approval gates. In 0.70, beforeToolCall is a
  // public settable field on the agent (was setBeforeToolCall(...) in 0.62).
  if (config.beforeToolCall) {
    const hook = config.beforeToolCall;
    session.agent.beforeToolCall = async (context, _signal) => {
      return hook(context.toolCall.name, context.args);
    };
  }

  let lastStopReason = "";
  const toolCalls: AgentExecutionResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  session.subscribe((e: any) => {
    if (e.type === "tool_execution_start") {
      const payload = { toolName: e.toolName, input: e.args };
      logger.info(`Tool called: ${e.toolName}`, { inputPreview: JSON.stringify(e.args).slice(0, 500) });
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
      // Accumulate token usage across turns. 0.70 Usage shape: { input, output, ... }.
      if (msg?.usage) {
        totalInputTokens += msg.usage.input ?? 0;
        totalOutputTokens += msg.usage.output ?? 0;
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
