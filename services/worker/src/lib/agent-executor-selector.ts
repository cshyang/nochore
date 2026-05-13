import type { AgentExecutor } from "./agent-executor";

export type AgentExecutorName = "pi" | "flue";

export interface AgentExecutorRegistry {
  pi: AgentExecutor;
  flue: AgentExecutor;
}

const piAgentExecutorLoader: AgentExecutor = async (config) => {
  const { defaultAgentExecutor: piAgentExecutor } = await import("./pi-runtime");
  return piAgentExecutor(config);
};

const flueAgentExecutorLoader: AgentExecutor = async (config) => {
  const { flueAgentExecutor } = await import("./flue-runtime");
  return flueAgentExecutor(config);
};

const defaultRegistry: AgentExecutorRegistry = {
  pi: piAgentExecutorLoader,
  flue: flueAgentExecutorLoader,
};

export function resolveAgentExecutor(
  value = process.env.AGENT_EXECUTOR,
  registry: AgentExecutorRegistry = defaultRegistry,
): AgentExecutor {
  const name = normalizeAgentExecutorName(value);
  return registry[name];
}

export const defaultAgentExecutor: AgentExecutor = async (config) => {
  const executor = resolveAgentExecutor();
  return executor(config);
};

export function normalizeAgentExecutorName(value: string | undefined): AgentExecutorName {
  const normalized = (value ?? "flue").trim().toLowerCase();
  if (normalized === "" || normalized === "flue") return "flue";
  if (normalized === "pi") return "pi";
  throw new Error(`Unknown AGENT_EXECUTOR "${value}". Expected "pi" or "flue".`);
}
