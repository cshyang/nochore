import type { SessionEnv } from "@flue/sdk/client";
import type { AgentToolDefinition } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import {
  agentToolResultToText,
  createFlueEventBridge,
  createFlueTool,
  createPolicyWrappedSessionEnv,
} from "./flue-runtime";

function createTestEnv(): SessionEnv & {
  execCalls: string[];
  writes: Array<{ path: string; content: string | Uint8Array }>;
} {
  const files = new Map<string, string>([["/workspace/data.txt", "data"]]);
  return {
    execCalls: [],
    writes: [],
    cwd: "/workspace",
    resolvePath(p: string) {
      return p.startsWith("/") ? p : `/workspace/${p}`;
    },
    async exec(command) {
      this.execCalls.push(command);
      return { stdout: `ran ${command}`, stderr: "", exitCode: 0 };
    },
    async readFile(filePath) {
      return files.get(this.resolvePath(filePath)) ?? "";
    },
    async readFileBuffer(filePath) {
      return Buffer.from(await this.readFile(filePath), "utf8");
    },
    async writeFile(filePath, content) {
      this.writes.push({ path: this.resolvePath(filePath), content });
      files.set(this.resolvePath(filePath), typeof content === "string" ? content : Buffer.from(content).toString());
    },
    async stat(filePath) {
      const resolved = this.resolvePath(filePath);
      return {
        isFile: files.has(resolved),
        isDirectory: resolved === "/workspace",
        isSymbolicLink: false,
        size: files.get(resolved)?.length ?? 0,
        mtime: new Date(0),
      };
    },
    async readdir() {
      return ["data.txt"];
    },
    async exists(filePath) {
      return files.has(this.resolvePath(filePath));
    },
    async mkdir() {},
    async rm(filePath) {
      files.delete(this.resolvePath(filePath));
    },
  };
}

function createTool(execute = vi.fn()): AgentToolDefinition {
  return {
    name: "inspect_input",
    label: "Inspect Input",
    description: "Inspect input",
    parameters: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    },
    async execute(toolCallId, params) {
      execute(toolCallId, params);
      return {
        content: [{ type: "text", text: `topic=${params.topic}` }],
        details: { topic: params.topic },
      };
    },
  };
}

describe("Flue runtime helpers", () => {
  it("converts Nochore tool results to text", () => {
    expect(
      agentToolResultToText({
        content: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
        details: {},
      }),
    ).toBe("one\ntwo");

    expect(agentToolResultToText({ content: [], details: { ok: true } })).toBe('{"ok":true}');
  });

  it("wraps custom tools and allows policy-approved calls", async () => {
    const execute = vi.fn();
    const beforeToolCall = vi.fn(async () => undefined);
    const tool = createFlueTool(createTool(execute), beforeToolCall);

    await expect(tool.execute({ topic: "flue" })).resolves.toBe("topic=flue");
    expect(beforeToolCall).toHaveBeenCalledWith("inspect_input", { topic: "flue" });
    expect(execute).toHaveBeenCalledWith(expect.stringMatching(/^flue-/), { topic: "flue" });
  });

  it("blocks custom tools before execution", async () => {
    const execute = vi.fn();
    const tool = createFlueTool(createTool(execute), async () => ({
      block: true,
      reason: "blocked in test",
    }));

    await expect(tool.execute({ topic: "flue" })).resolves.toBe("Blocked by policy: blocked in test");
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks built-in bash through SessionEnv.exec", async () => {
    const env = createTestEnv();
    const wrapped = createPolicyWrappedSessionEnv(env, {
      systemPrompt: "System",
      policyState: { enabled: true },
      async beforeToolCall(toolName) {
        return toolName === "bash" ? { block: true, reason: "no shell" } : undefined;
      },
    });

    const result = await wrapped.exec("echo no");
    expect(result).toEqual({
      stdout: "",
      stderr: "Blocked by policy: no shell",
      exitCode: 1,
    });
    expect(env.execCalls).toEqual([]);
  });

  it("blocks write/edit through SessionEnv.writeFile", async () => {
    const env = createTestEnv();
    const wrapped = createPolicyWrappedSessionEnv(env, {
      systemPrompt: "System",
      policyState: { enabled: true },
      async beforeToolCall(toolName) {
        return toolName === "write" ? { block: true, reason: "no writes" } : undefined;
      },
    });

    await expect(wrapped.writeFile("new.txt", "content")).rejects.toThrow("Blocked by policy: no writes");
    expect(env.writes).toEqual([]);
  });

  it("suppresses policy while reading the virtual system prompt", async () => {
    const beforeToolCall = vi.fn();
    const wrapped = createPolicyWrappedSessionEnv(createTestEnv(), {
      systemPrompt: "Injected system prompt",
      policyState: { enabled: false },
      beforeToolCall,
    });

    await expect(wrapped.exists("AGENTS.md")).resolves.toBe(true);
    await expect(wrapped.readFile("AGENTS.md")).resolves.toBe("Injected system prompt");
    await expect(wrapped.readdir("/workspace")).resolves.toEqual(["AGENTS.md", "data.txt"]);
    expect(beforeToolCall).not.toHaveBeenCalled();
  });

  it("maps Flue events without double-emitting tool events", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const bridge = createFlueEventBridge(async (event) => {
      events.push(event);
      return `evt_${events.length}`;
    });

    await bridge.handle({ type: "tool_start", toolName: "bash", toolCallId: "call_1", args: { command: "echo ok" } });
    await bridge.handle({ type: "tool_end", toolName: "bash", toolCallId: "call_1", isError: false, result: "ok" });
    await bridge.handle({ type: "text_delta", text: "hello " });
    await bridge.handle({ type: "text_delta", text: "world" });
    await bridge.handle({ type: "turn_end" });
    await bridge.waitForPendingEvents();

    expect(bridge.toolCalls.map((call) => call.toolName)).toEqual(["bash"]);
    expect(events).toEqual([
      { type: "tool_called", payload: { toolName: "bash", input: { command: "echo ok" } } },
      { type: "tool_executed", payload: { toolName: "bash", output: "ok" } },
      { type: "agent_message", payload: { text: "hello world" } },
    ]);
  });
});
