import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { logger } from "@trigger.dev/sdk/v3";
import type { ToolSet } from "ai";

let _composio: Composio | null = null;

function getComposio(): Composio {
  if (!_composio) {
    _composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY,
      provider: new VercelProvider(),
    });
  }
  return _composio;
}

/**
 * Create a Composio session and return AI SDK-ready tools.
 *
 * This replaces the old 6-layer stack (capabilities.ts → buildAgentToolSet →
 * buildRuntimeTools → double-wrap). Composio is now the source of truth for
 * what tools exist and how they work.
 */
export async function getSessionTools(params: {
  userId: string;
  toolkits: string[];
}): Promise<ToolSet> {
  const composio = getComposio();

  const session = await composio.create(params.userId, {
    toolkits: params.toolkits,
  });

  const tools = await session.tools({
    beforeExecute: ({ toolSlug, params: toolParams }) => {
      logger.info(`Executing tool: ${toolSlug}`, {
        inputPreview: JSON.stringify(toolParams).slice(0, 500),
      });
      return toolParams;
    },
    afterExecute: ({ toolSlug, result }) => {
      const output = JSON.stringify(result).slice(0, 500);
      logger.info(`Tool completed: ${toolSlug}`, {
        successful: (result as any)?.successful ?? true,
        outputPreview: output,
      });
      return result;
    },
  });

  logger.info("Composio session created", {
    userId: params.userId,
    toolkits: params.toolkits,
    toolCount: Object.keys(tools).length,
    toolNames: Object.keys(tools),
  });

  return tools;
}
