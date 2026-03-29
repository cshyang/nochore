/**
 * Bridge between Composio tools and pi-coding-agent ToolDefinitions.
 *
 * Uses @composio/core directly (no VercelProvider) to get raw tool metadata
 * and execute tools via composio.tools.execute(). Each Composio tool becomes
 * a pi ToolDefinition that the agent can call like any built-in tool.
 */

import { Composio } from "@composio/core";
import { logger } from "@trigger.dev/sdk/v3";

interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>;
}

let _composio: Composio | null = null;

function getComposio(): Composio {
  if (!_composio) {
    _composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  }
  return _composio;
}

/**
 * Fetch Composio tools for the given toolkits and wrap each as a pi ToolDefinition.
 *
 * The raw metadata provides name/description/schema. Execution goes through
 * composio.tools.execute() which handles auth, versioning, and the actual API call.
 */
export async function getComposioToolsForPi(params: {
  userId: string;
  toolkits: string[];
}): Promise<PiToolDefinition[]> {
  if (!params.toolkits.length) return [];

  const composio = getComposio();

  const rawTools = (await composio.tools.getRawComposioTools({
    toolkits: params.toolkits,
    important: false,
    limit: 100,
  })) as Array<{
    slug: string;
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  }>;

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
        const result = (await composio.tools.execute(tool.slug, {
          userId: params.userId,
          arguments: toolParams,
          dangerouslySkipVersionCheck: true,
        })) as { data?: unknown; error?: string | null; successful?: boolean };

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
