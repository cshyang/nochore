import type { AgentToolDefinition } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import { listProviderTools } from "./tool-provider";

const composioTool: AgentToolDefinition = {
  name: "slack_send_message",
  label: "Send Slack Message",
  description: "Send a message.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({
    content: [{ type: "text", text: "{}" }],
    details: {},
  }),
};

describe("listProviderTools", () => {
  it("routes google ads and other providers through Composio", async () => {
    const getComposioAgentTools = vi.fn(async () => [composioTool]);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads", "slack"],
          providerConfigs: {
            googleads: {
              customerId: "123-456-7890",
              refreshToken: "refresh-token",
              managerCustomerId: "999-888-7777",
            },
          },
        },
        {
          getComposioAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([composioTool]);
    expect(getComposioAgentTools).toHaveBeenCalledWith({
      userId: "user_123",
      toolkits: ["googleads", "slack"],
      providerConfigs: {
        googleads: {
          customerId: "123-456-7890",
          refreshToken: "refresh-token",
          managerCustomerId: "999-888-7777",
        },
      },
    });
  });

  it("passes OAuth-backed google ads connections through Composio", async () => {
    const getComposioAgentTools = vi.fn(async () => [composioTool]);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads", "slack"],
          providerConfigs: {
            googleads: {
              composioConnectedAccountId: "ca_123",
              connector: "composio",
            },
          },
        },
        {
          getComposioAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([composioTool]);
    expect(getComposioAgentTools).toHaveBeenCalledWith({
      userId: "user_123",
      toolkits: ["googleads", "slack"],
      providerConfigs: {
        googleads: {
          composioConnectedAccountId: "ca_123",
          connector: "composio",
        },
      },
    });
  });

  it("returns no tools when no providers are active", async () => {
    const getComposioAgentTools = vi.fn(async () => []);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: [],
          providerConfigs: {},
        },
        {
          getComposioAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([]);
    expect(getComposioAgentTools).not.toHaveBeenCalled();
  });
});
