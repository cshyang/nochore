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

const customGoogleAdsTool: AgentToolDefinition = {
  name: "googleads_add_negative_keywords",
  label: "Add Negative Keywords",
  description: "Add negative keywords.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({
    content: [{ type: "text", text: "{}" }],
    details: {},
  }),
};

describe("listProviderTools", () => {
  it("routes google ads and other providers through Composio", async () => {
    const getComposioAgentTools = vi.fn(async () => [composioTool]);
    const getGoogleAdsAgentTools = vi.fn(() => [customGoogleAdsTool]);

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
          getGoogleAdsAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([
      composioTool,
      expect.objectContaining({
        name: "googleads_add_negative_keywords",
        label: "Add Negative Keywords",
      }),
    ]);
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
      providerBindings: undefined,
    });
    expect(getGoogleAdsAgentTools).toHaveBeenCalledWith({
      customerId: "1234567890",
      managerCustomerId: "999-888-7777",
      refreshToken: "refresh-token",
    });
  });

  it("passes OAuth-backed google ads connections through Composio and adds custom Google Ads tools", async () => {
    const getComposioAgentTools = vi.fn(async () => [composioTool]);
    const getGoogleAdsAgentTools = vi.fn(() => [customGoogleAdsTool]);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads", "slack"],
          providerConfigs: {
            googleads: {
              composioConnectedAccountId: "ca_123",
              connector: "composio",
              selectedCustomerId: "4827228419",
            },
          },
        },
        {
          getComposioAgentTools,
          getGoogleAdsAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([
      composioTool,
      expect.objectContaining({
        name: "googleads_add_negative_keywords",
        description: expect.stringContaining("482-722-8419"),
      }),
    ]);
    expect(getComposioAgentTools).toHaveBeenCalledWith({
      userId: "user_123",
      toolkits: ["googleads", "slack"],
      providerConfigs: {
        googleads: {
          composioConnectedAccountId: "ca_123",
          connector: "composio",
          selectedCustomerId: "4827228419",
        },
      },
      providerBindings: undefined,
    });
    expect(getGoogleAdsAgentTools).toHaveBeenCalledWith({
      customerId: "4827228419",
      managerCustomerId: undefined,
      refreshToken: undefined,
    });
  });

  it("returns no tools when no providers are active", async () => {
    const getComposioAgentTools = vi.fn(async () => []);
    const getGoogleAdsAgentTools = vi.fn(() => []);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: [],
          providerConfigs: {},
        },
        {
          getComposioAgentTools,
          getGoogleAdsAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([]);
    expect(getComposioAgentTools).not.toHaveBeenCalled();
    expect(getGoogleAdsAgentTools).not.toHaveBeenCalled();
  });

  it("aliases custom Google Ads tools when multiple Google Ads bindings are active", async () => {
    const getComposioAgentTools = vi.fn(async () => []);
    const getGoogleAdsAgentTools = vi.fn(() => [customGoogleAdsTool]);

    const tools = await listProviderTools(
      {
        userId: "user_123",
        activeProviders: ["googleads"],
        providerConfigs: {},
        providerBindings: [
          {
            id: "binding_1",
            provider: "googleads",
            alias: "woodrose",
            connectionId: "conn_1",
            config: { selectedCustomerId: "4827228419" },
          },
          {
            id: "binding_2",
            provider: "googleads",
            alias: "homescape",
            connectionId: "conn_2",
            config: { selectedCustomerId: "1073100792" },
          },
        ],
      },
      {
        getComposioAgentTools,
        getGoogleAdsAgentTools,
        warn: vi.fn(),
      },
    );

    expect(tools.map((tool) => tool.name)).toEqual([
      "googleads_woodrose_add_negative_keywords",
      "googleads_homescape_add_negative_keywords",
    ]);
  });
});
