import { tool } from "ai";
import type { ToolSet } from "ai";
import {
  getToolCapabilitiesForProviders,
  getToolCapability,
  type ToolCapabilityDefinition,
} from "./capabilities";

type ComposioClient = Awaited<ReturnType<typeof createComposioClient>>;
type ComposioSession = Awaited<ReturnType<ComposioClient["create"]>>;

export async function createComposioClient(apiKey?: string) {
  const { Composio: ComposioClass } = await import("@composio/core");
  const { VercelProvider } = await import("@composio/vercel");

  return new ComposioClass({
    apiKey: apiKey ?? process.env.COMPOSIO_API_KEY,
    provider: new VercelProvider(),
  });
}

export function getComposioUserId(projectId: string): string {
  return `nochore-${projectId}`;
}

export function buildAgentToolSet(params: {
  composio: ComposioClient;
  userId: string;
  providers: string[];
  toolConfig: {
    tools: Record<string, { enabled?: boolean; approvalMode?: string }>;
  };
}): ToolSet {
  const available = getToolCapabilitiesForProviders(params.providers)
    .filter((toolDef) => {
      const configured = params.toolConfig.tools[toolDef.toolName];
      return configured ? configured.enabled : true;
    });

  return Object.fromEntries(
    available.map((toolDef) => [
      toolDef.toolName,
      tool({
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        needsApproval: () => {
          const configured = params.toolConfig.tools[toolDef.toolName];
          return (configured?.approvalMode ?? toolDef.defaultApprovalMode) === "approval";
        },
        execute: async (input) =>
          executeComposioTool({
            composio: params.composio,
            userId: params.userId,
            slug: toolDef.slug,
            input: normalizeToolInput(input),
          }),
      }),
    ]),
  );
}

export async function executeComposioTool(params: {
  composio: ComposioClient;
  userId: string;
  slug: string;
  input: Record<string, unknown>;
}): Promise<unknown> {
  const result = await params.composio.tools.execute(params.slug, {
    arguments: params.input,
    userId: params.userId,
    dangerouslySkipVersionCheck: true,
  });

  return result.data;
}

export async function sendNotificationTool(params: {
  composio: ComposioClient;
  userId: string;
  provider: "slack" | "gmail";
  payload: Record<string, unknown>;
}): Promise<unknown> {
  const toolName =
    params.provider === "slack" ? "slack_send_message" : "gmail_send_email";
  const toolDef = getToolCapability(toolName);
  if (!toolDef) {
    throw new Error(`Notification tool "${toolName}" is not configured`);
  }

  return executeComposioTool({
    composio: params.composio,
    userId: params.userId,
    slug: toolDef.slug,
    input: params.payload,
  });
}

export async function getComposioToolsForChat(
  composio: ComposioClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const session = await composio.create(userId);
  const tools = await session.tools();

  return tools as unknown as Record<string, unknown>;
}

export type { ToolCapabilityDefinition } from "./capabilities";

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}
