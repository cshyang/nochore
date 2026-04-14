/**
 * Bridge between Composio tools and pi-coding-agent ToolDefinitions.
 *
 * Goes through ComposioAdapter (harness) rather than calling @composio/core directly.
 * Each Composio tool becomes a pi ToolDefinition that the agent can call like any
 * built-in tool.
 */

import { type ComposioAdapter, createComposioAdapter, type PiToolDefinition } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk/v3";

let _adapter: Promise<ComposioAdapter> | null = null;

function getAdapter(): Promise<ComposioAdapter> {
  if (!_adapter) {
    _adapter = createComposioAdapter();
  }
  return _adapter;
}

export async function getComposioToolsForPi(params: {
  userId: string;
  toolkits: string[];
}): Promise<PiToolDefinition[]> {
  if (!params.toolkits.length) return [];

  const adapter = await getAdapter();
  const rawTools = await adapter.getRawTools({
    userId: params.userId,
    toolkits: params.toolkits,
    important: false,
    limit: 100,
  });

  logger.info("Composio tools fetched for pi-agent", {
    userId: params.userId,
    toolkits: params.toolkits,
    toolCount: rawTools.length,
    toolNames: rawTools.map((t) => t.slug),
  });

  return rawTools.map((tool) => ({
    name: tool.slug,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? tool.parameters ?? { type: "object", properties: {} },
    execute: async (_toolCallId: string, toolParams: Record<string, unknown>) => {
      logger.info(`Composio tool executing: ${tool.slug}`, {
        inputPreview: JSON.stringify(toolParams).slice(0, 500),
      });

      try {
        const result = await adapter.execute({
          userId: params.userId,
          toolSlug: tool.slug,
          args: toolParams,
        });

        const output = JSON.stringify(result.data ?? result);
        logger.info(`Composio tool completed: ${tool.slug}`, {
          successful: result.successful ?? true,
          outputPreview: output.slice(0, 500),
        });

        return {
          content: [{ type: "text" as const, text: output }],
          details: { successful: result.successful ?? true, error: result.error ?? null },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Composio tool failed: ${tool.slug}`, { error: errorMsg });
        return {
          content: [{ type: "text" as const, text: `Error executing ${tool.slug}: ${errorMsg}` }],
          details: { successful: false, error: errorMsg },
        };
      }
    },
  }));
}
