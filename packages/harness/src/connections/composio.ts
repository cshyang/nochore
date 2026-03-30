type ComposioClient = Awaited<ReturnType<typeof createComposioClient>>;

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

export async function sendNotificationTool(params: {
  composio: ComposioClient;
  userId: string;
  provider: "slack" | "gmail";
  payload: Record<string, unknown>;
}): Promise<unknown> {
  const slugMap: Record<string, string> = {
    slack: "SLACK_SEND_MESSAGE",
    gmail: "GMAIL_SEND_EMAIL",
  };
  const slug = slugMap[params.provider];
  if (!slug) {
    throw new Error(`Unknown notification provider: ${params.provider}`);
  }

  const result = await params.composio.tools.execute(slug, {
    arguments: params.payload,
    userId: params.userId,
    dangerouslySkipVersionCheck: true,
  });

  return result.data;
}
