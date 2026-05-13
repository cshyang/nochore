import type { AgentToolDefinition } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import type { AgentProviderBinding } from "./agent-runtime";
import { getComposioAgentTools } from "./composio-agent-tools";

export interface ToolProviderContext {
  userId: string;
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
  providerBindings?: AgentProviderBinding[];
}

interface ToolProviderDeps {
  getComposioAgentTools: typeof getComposioAgentTools;
  warn: (message: string) => void;
}

const defaultDeps: ToolProviderDeps = {
  getComposioAgentTools,
  warn: (message) => logger.warn(message),
};

// Runtime-local tool provider seam. This keeps provider-specific routing out of the run loop
// without pretending we have a general-purpose framework adapter yet.
export async function listProviderTools(
  context: ToolProviderContext,
  deps: ToolProviderDeps = defaultDeps,
): Promise<AgentToolDefinition[]> {
  const tools: AgentToolDefinition[] = [];
  const composioProviders = context.activeProviders;

  if (composioProviders.length > 0) {
    tools.push(
      ...(await deps.getComposioAgentTools({
        userId: context.userId,
        toolkits: composioProviders,
        providerConfigs: context.providerConfigs,
        providerBindings: context.providerBindings,
      })),
    );
  }

  return tools;
}
