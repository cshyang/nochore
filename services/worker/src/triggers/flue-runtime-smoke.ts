import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentToolDefinition } from "@nochore/harness";
import { logger, task } from "@trigger.dev/sdk";
import { flueAgentExecutor } from "../lib/flue-runtime";

export const flueRuntimeSmokeTask = task({
  id: "flue-runtime-smoke",
  retry: { maxAttempts: 1 },
  run: async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), "nochore-flue-smoke-"));
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const policyDecisions: Array<{ toolName: string; block: boolean; reason?: string }> = [];

    const inspectTool: AgentToolDefinition = {
      name: "inspect_input",
      label: "Inspect Input",
      description: "Returns a structured observation for the Flue runtime smoke test.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic to inspect" },
        },
        required: ["topic"],
        additionalProperties: false,
      },
      async execute(_toolCallId, params) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, topic: params.topic, harness: "flue" }) }],
          details: { ok: true, topic: params.topic },
        };
      },
    };

    try {
      const result = await flueAgentExecutor({
        systemPrompt: [
          "You are running a Nochore Flue runtime smoke test.",
          "Use the requested tools exactly and report whether the runtime checks passed.",
        ].join("\n"),
        userPrompt: [
          "Run these checks:",
          '1. Call inspect_input with topic "flue-runtime-smoke".',
          '2. Call bash with command "echo allowed-flue-smoke".',
          '3. Call bash with command "echo blocked-check". This should be blocked by policy.',
          "4. Return a concise report describing the observed result.",
        ].join("\n"),
        workspacePath,
        tools: [inspectTool],
        async onEvent(event) {
          events.push(event);
          return `evt_${events.length}`;
        },
        async beforeToolCall(toolName, args) {
          const command =
            args && typeof args === "object" && "command" in args
              ? String((args as { command?: unknown }).command)
              : "";
          const block = toolName === "bash" && command.includes("blocked-check");
          const decision = {
            toolName,
            block,
            ...(block ? { reason: "Smoke policy blocks commands containing blocked-check." } : {}),
          };
          policyDecisions.push(decision);
          return block ? { block: true, reason: decision.reason } : undefined;
        },
      });

      const toolNames = result.toolCalls.map((call) => call.toolName);
      const blockedBashWasSeen = policyDecisions.some((decision) => decision.toolName === "bash" && decision.block);
      logger.info("Flue runtime smoke completed", { workspacePath, toolNames, blockedBashWasSeen });

      return {
        ok: result.output.trim().length > 0 && toolNames.includes("bash") && blockedBashWasSeen,
        output: result.output,
        toolNames,
        blockedBashWasSeen,
        eventTypes: events.map((event) => event.type),
        policyDecisions,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      };
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  },
});
