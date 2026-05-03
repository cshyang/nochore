import type { AgentToolDefinition } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import { listProviderTools } from "./tool-provider";

const googleAdsTool: AgentToolDefinition = {
  name: "googleads_list_campaigns",
  label: "List Campaigns",
  description: "List campaigns.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({
    content: [{ type: "text", text: "{}" }],
    details: {},
  }),
};

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
  it("combines direct google ads tools and composio tools", async () => {
    const getGoogleAdsAgentTools = vi.fn(() => [googleAdsTool]);
    const getComposioAgentTools = vi.fn(async () => [composioTool]);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads", "slack"],
          providerConfigs: { googleads: { customerId: "123-456-7890" } },
        },
        {
          getGoogleAdsAgentTools,
          getComposioAgentTools,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([googleAdsTool, composioTool]);
    expect(getGoogleAdsAgentTools).toHaveBeenCalledWith({ customerId: "123-456-7890" });
    expect(getComposioAgentTools).toHaveBeenCalledWith({
      userId: "user_123",
      toolkits: ["slack"],
    });
  });

  it("skips google ads tools when the customer id is missing", async () => {
    const warn = vi.fn();
    const getGoogleAdsAgentTools = vi.fn(() => [googleAdsTool]);
    const getComposioAgentTools = vi.fn(async () => []);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads"],
          providerConfigs: {},
        },
        {
          getGoogleAdsAgentTools,
          getComposioAgentTools,
          warn,
        },
      ),
    ).resolves.toEqual([]);
    expect(getGoogleAdsAgentTools).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Google Ads connection active but no customerId in config - skipping tools");
  });
});
