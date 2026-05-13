import { describe, expect, it, vi } from "vitest";
import type { AgentExecutor, AgentExecutorConfig } from "./agent-executor";
import { normalizeAgentExecutorName, resolveAgentExecutor } from "./agent-executor-selector";

const config = {
  systemPrompt: "",
  userPrompt: "",
  workspacePath: "",
  tools: [],
  async onEvent() {
    return "evt";
  },
} satisfies AgentExecutorConfig;

describe("agent executor selector", () => {
  it("defaults to the Flue executor", () => {
    const pi = vi.fn() as unknown as AgentExecutor;
    const flue = vi.fn() as unknown as AgentExecutor;

    expect(resolveAgentExecutor(undefined, { pi, flue })).toBe(flue);
    expect(resolveAgentExecutor("", { pi, flue })).toBe(flue);
    expect(normalizeAgentExecutorName(undefined)).toBe("flue");
    expect(normalizeAgentExecutorName("")).toBe("flue");
  });

  it("selects pi explicitly as a fallback", () => {
    const pi = vi.fn() as unknown as AgentExecutor;
    const flue = vi.fn() as unknown as AgentExecutor;

    expect(resolveAgentExecutor("pi", { pi, flue })).toBe(pi);
    expect(resolveAgentExecutor(" PI ", { pi, flue })).toBe(pi);
  });

  it("selects flue explicitly", async () => {
    const pi = vi.fn() as unknown as AgentExecutor;
    const flue = vi.fn(async () => ({
      output: "ok",
      toolCalls: [],
      durationMs: 1,
      inputTokens: 0,
      outputTokens: 0,
    }));

    const executor = resolveAgentExecutor("flue", { pi, flue });
    expect(executor).toBe(flue);
    await expect(executor(config)).resolves.toMatchObject({ output: "ok" });
  });

  it("fails fast for unknown executor names", () => {
    const pi = vi.fn() as unknown as AgentExecutor;
    const flue = vi.fn() as unknown as AgentExecutor;

    expect(() => resolveAgentExecutor("cloudflare", { pi, flue })).toThrow(
      'Unknown AGENT_EXECUTOR "cloudflare". Expected "pi" or "flue".',
    );
  });
});
