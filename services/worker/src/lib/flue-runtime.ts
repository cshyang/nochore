import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { FlueEvent, FlueSession, PromptResultResponse, SessionEnv, ShellResult, ToolDef } from "@flue/sdk/client";
import { createFlueContext, InMemorySessionStore, resolveModel } from "@flue/sdk/internal";
import { createLocalSessionEnv } from "@flue/sdk/node";
import { registerBuiltInApiProviders } from "@mariozechner/pi-ai";
import type { AgentToolDefinition, AgentToolResult } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import * as v from "valibot";
import type { AgentExecutionEvent, AgentExecutionResult, AgentExecutor, AgentExecutorConfig } from "./agent-executor";

const VIRTUAL_SYSTEM_PROMPT_FILE = "AGENTS.md";

let providersRegistered = false;

function ensureProviders() {
  if (!providersRegistered) {
    registerBuiltInApiProviders();
    providersRegistered = true;
  }
}

const ReportSchema = v.object({
  report: v.string(),
});

export const flueAgentExecutor: AgentExecutor = executeWithFlue;

async function executeWithFlue(config: AgentExecutorConfig): Promise<AgentExecutionResult> {
  const start = Date.now();
  ensureProviders();

  if (!existsSync(config.workspacePath)) {
    mkdirSync(config.workspacePath, { recursive: true });
  }

  const policyState = { enabled: false };
  const bridge = createFlueEventBridge(config.onEvent);
  const model = process.env.AGENT_LLM_MODEL ?? process.env.LLM_MODEL ?? "anthropic/claude-sonnet-4-7";

  const createEnv = async () =>
    createPolicyWrappedSessionEnv(createLocalSessionEnv({ cwd: config.workspacePath }), {
      systemPrompt: config.systemPrompt,
      beforeToolCall: config.beforeToolCall,
      policyState,
    });

  const context = createFlueContext({
    id: `nochore-${randomUUID()}`,
    payload: {},
    env: process.env as Record<string, unknown>,
    agentConfig: {
      systemPrompt: "",
      skills: {},
      roles: {},
      model: undefined,
      resolveModel,
      thinkingLevel: "off",
    },
    createDefaultEnv: createEnv,
    createLocalEnv: createEnv,
    defaultStore: new InMemorySessionStore(),
  });

  context.setEventCallback((event) => {
    bridge.handle(event).catch((error) => {
      logger.error("Failed to handle Flue event", { error: String(error), eventType: event.type });
    });
  });

  logger.info("Starting Flue agent session", {
    workspacePath: config.workspacePath,
    systemPromptLength: config.systemPrompt.length,
    userPromptLength: config.userPrompt.length,
    customToolCount: config.tools.length,
    customToolNames: config.tools.map((tool) => tool.name),
  });

  let response: Awaited<ReturnType<typeof runFluePrompt>>;
  try {
    const agent = await context.init({
      id: "run",
      sandbox: "local",
      cwd: config.workspacePath,
      model,
      thinkingLevel: "off",
      tools: config.tools.map((tool) => createFlueTool(tool, config.beforeToolCall)),
    });
    const session = await agent.sessions.create("default");

    policyState.enabled = true;
    response = await runFluePrompt(session, config.userPrompt);
  } finally {
    policyState.enabled = false;
  }

  await bridge.flushText();
  await bridge.waitForPendingEvents();

  const output = response.data.report;
  logger.info("Flue agent session completed", {
    durationMs: Date.now() - start,
    outputLength: output.length,
    outputPreview: output.slice(0, 500),
    toolCallCount: bridge.toolCalls.length,
  });

  return {
    output,
    toolCalls: bridge.toolCalls,
    durationMs: Date.now() - start,
    inputTokens: response.usage.input ?? 0,
    outputTokens: response.usage.output ?? 0,
  };
}

async function runFluePrompt(session: FlueSession, prompt: string): Promise<PromptResultResponse<{ report: string }>> {
  return (await session.prompt(prompt, { schema: ReportSchema, thinkingLevel: "off" })) as PromptResultResponse<{
    report: string;
  }>;
}

export function createFlueTool(
  tool: AgentToolDefinition,
  beforeToolCall?: AgentExecutorConfig["beforeToolCall"],
): ToolDef {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(args, signal) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error("Tool call aborted");
      }

      const gate = await beforeToolCall?.(tool.name, args);
      if (gate?.block) {
        return blockedToolResult(gate.reason);
      }

      const result = await tool.execute(`flue-${randomUUID()}`, normalizeToolArgs(args));
      return agentToolResultToText(result);
    },
  };
}

export interface PolicyWrappedSessionEnvOptions {
  systemPrompt: string;
  beforeToolCall?: AgentExecutorConfig["beforeToolCall"];
  policyState: { enabled: boolean };
}

export function createPolicyWrappedSessionEnv(env: SessionEnv, options: PolicyWrappedSessionEnvOptions): SessionEnv {
  async function gate(toolName: string, args: Record<string, unknown>) {
    if (!options.policyState.enabled) return undefined;
    return options.beforeToolCall?.(toolName, args);
  }

  async function assertAllowed(toolName: string, args: Record<string, unknown>) {
    const decision = await gate(toolName, args);
    if (decision?.block) {
      throw new Error(blockedToolResult(decision.reason));
    }
  }

  return {
    ...env,
    async exec(command, execOptions): Promise<ShellResult> {
      const decision = await gate("bash", {
        command,
        cwd: execOptions?.cwd,
        envKeys: execOptions?.env ? Object.keys(execOptions.env) : [],
      });
      if (decision?.block) {
        return {
          stdout: "",
          stderr: blockedToolResult(decision.reason),
          exitCode: 1,
        };
      }
      return env.exec(command, execOptions);
    },
    async readFile(filePath) {
      if (isVirtualSystemPromptPath(env, filePath)) return options.systemPrompt;
      await assertAllowed("read", { path: filePath });
      return env.readFile(filePath);
    },
    async readFileBuffer(filePath) {
      if (isVirtualSystemPromptPath(env, filePath)) return Buffer.from(options.systemPrompt, "utf8");
      await assertAllowed("read", { path: filePath });
      return env.readFileBuffer(filePath);
    },
    async writeFile(filePath, content) {
      await assertAllowed("write", {
        path: filePath,
        bytes: typeof content === "string" ? Buffer.byteLength(content) : content.byteLength,
      });
      if (isVirtualSystemPromptPath(env, filePath)) {
        throw new Error(`${VIRTUAL_SYSTEM_PROMPT_FILE} is a virtual read-only file`);
      }
      return env.writeFile(filePath, content);
    },
    async stat(filePath) {
      if (isVirtualSystemPromptPath(env, filePath)) {
        return {
          isFile: true,
          isDirectory: false,
          isSymbolicLink: false,
          size: Buffer.byteLength(options.systemPrompt),
          mtime: new Date(0),
        };
      }
      await assertAllowed("read", { path: filePath });
      return env.stat(filePath);
    },
    async readdir(filePath) {
      await assertAllowed("read", { path: filePath });
      const entries = await env.readdir(filePath);
      if (!isEnvCwd(env, filePath) || entries.includes(VIRTUAL_SYSTEM_PROMPT_FILE)) return entries;
      return [VIRTUAL_SYSTEM_PROMPT_FILE, ...entries];
    },
    async exists(filePath) {
      if (isVirtualSystemPromptPath(env, filePath)) return true;
      return env.exists(filePath);
    },
    async mkdir(filePath, mkdirOptions) {
      await assertAllowed("write", { path: filePath, recursive: mkdirOptions?.recursive ?? false });
      return env.mkdir(filePath, mkdirOptions);
    },
    async rm(filePath, rmOptions) {
      await assertAllowed("write", {
        path: filePath,
        recursive: rmOptions?.recursive ?? false,
        force: rmOptions?.force ?? false,
      });
      if (isVirtualSystemPromptPath(env, filePath)) {
        throw new Error(`${VIRTUAL_SYSTEM_PROMPT_FILE} is a virtual read-only file`);
      }
      return env.rm(filePath, rmOptions);
    },
  };
}

export function createFlueEventBridge(onEvent: AgentExecutorConfig["onEvent"]) {
  const toolCalls: AgentExecutionResult["toolCalls"] = [];
  const pendingEvents: Promise<unknown>[] = [];
  let textBuffer = "";

  function emit(event: AgentExecutionEvent) {
    pendingEvents.push(
      onEvent(event).catch((error) => {
        logger.error("Failed to record Flue event", { error: String(error), eventType: event.type });
      }),
    );
  }

  return {
    toolCalls,
    async handle(event: FlueEvent) {
      if (event.type === "text_delta") {
        textBuffer += event.text;
        return;
      }

      if (event.type === "turn_end" || event.type === "idle") {
        await this.flushText();
        return;
      }

      if (event.type === "tool_start") {
        toolCalls.push({ toolName: event.toolName, timestamp: new Date() });
        emit({ type: "tool_called", payload: { toolName: event.toolName, input: event.args ?? {} } });
        return;
      }

      if (event.type === "tool_end" && !event.isError) {
        emit({
          type: "tool_executed",
          payload: {
            toolName: event.toolName,
            output: flueResultToText(event.result).slice(0, 2000),
          },
        });
      }
    },
    async flushText() {
      const text = textBuffer.trim();
      textBuffer = "";
      if (text) emit({ type: "agent_message", payload: { text: text.slice(0, 2000) } });
    },
    async waitForPendingEvents() {
      await Promise.allSettled(pendingEvents);
    },
  };
}

export function agentToolResultToText(result: AgentToolResult): string {
  const text = result.content
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  if (text) return text;
  return JSON.stringify(result.details ?? {});
}

export function flueResultToText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray((result as AgentToolResult | undefined)?.content)) {
    return agentToolResultToText(result as AgentToolResult);
  }
  if (result === undefined) return "";
  return JSON.stringify(result);
}

function normalizeToolArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  return args && typeof args === "object" && !Array.isArray(args) ? args : {};
}

function blockedToolResult(reason: string | undefined): string {
  return `Blocked by policy: ${reason ?? "Tool call blocked"}`;
}

function isVirtualSystemPromptPath(env: SessionEnv, filePath: string): boolean {
  return normalizePath(env.resolvePath(filePath)) === normalizePath(path.join(env.cwd, VIRTUAL_SYSTEM_PROMPT_FILE));
}

function isEnvCwd(env: SessionEnv, filePath: string): boolean {
  return normalizePath(env.resolvePath(filePath)) === normalizePath(env.cwd);
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}
