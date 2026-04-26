import { getGoogleAdsToolsForPi, type PiToolDefinition } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk/v3";
import { getComposioToolsForPi } from "./composio-pi-bridge";

export interface ToolProviderContext {
  userId: string;
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
}

interface ToolProviderDeps {
  getComposioToolsForPi: typeof getComposioToolsForPi;
  getGoogleAdsToolsForPi: typeof getGoogleAdsToolsForPi;
  warn: (message: string) => void;
}

const defaultDeps: ToolProviderDeps = {
  getComposioToolsForPi,
  getGoogleAdsToolsForPi,
  warn: (message) => logger.warn(message),
};

// Runtime-local tool provider seam. This keeps provider-specific routing out of the run loop
// without pretending we have a general-purpose framework adapter yet.
export async function listProviderTools(
  context: ToolProviderContext,
  deps: ToolProviderDeps = defaultDeps,
): Promise<PiToolDefinition[]> {
  const tools: PiToolDefinition[] = [];
  const composioProviders = context.activeProviders.filter((provider) => provider !== "googleads");

  if (context.activeProviders.includes("googleads")) {
    // Google Ads stays on the direct connector until the Composio integration is reliable enough
    // to collapse this branch back into the generic provider flow.
    const customerId = context.providerConfigs.googleads?.customerId;
    if (typeof customerId === "string" && customerId.length > 0) {
      tools.push(...deps.getGoogleAdsToolsForPi({ customerId }));
    } else {
      deps.warn("Google Ads connection active but no customerId in config - skipping tools");
    }
  }

  if (composioProviders.length > 0) {
    tools.push(
      ...(await deps.getComposioToolsForPi({
        userId: context.userId,
        toolkits: composioProviders,
      })),
    );
  }

  return tools;
}
