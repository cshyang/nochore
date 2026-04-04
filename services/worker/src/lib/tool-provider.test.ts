import type { PiToolDefinition } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import { listProviderTools } from "./tool-provider";

const googleAdsTool: PiToolDefinition = {
  name: "googleads_list_campaigns",
  label: "List Campaigns",
  description: "List campaigns.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({
    content: [{ type: "text", text: "{}" }],
    details: {},
  }),
};

const composioTool: PiToolDefinition = {
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
    const getGoogleAdsToolsForPi = vi.fn(() => [googleAdsTool]);
    const getComposioToolsForPi = vi.fn(async () => [composioTool]);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads", "slack"],
          providerConfigs: { googleads: { customerId: "123-456-7890" } },
        },
        {
          getGoogleAdsToolsForPi,
          getComposioToolsForPi,
          warn: vi.fn(),
        },
      ),
    ).resolves.toEqual([googleAdsTool, composioTool]);
    expect(getGoogleAdsToolsForPi).toHaveBeenCalledWith({ customerId: "123-456-7890" });
    expect(getComposioToolsForPi).toHaveBeenCalledWith({
      userId: "user_123",
      toolkits: ["slack"],
    });
  });

  it("skips google ads tools when the customer id is missing", async () => {
    const warn = vi.fn();
    const getGoogleAdsToolsForPi = vi.fn(() => [googleAdsTool]);
    const getComposioToolsForPi = vi.fn(async () => []);

    await expect(
      listProviderTools(
        {
          userId: "user_123",
          activeProviders: ["googleads"],
          providerConfigs: {},
        },
        {
          getGoogleAdsToolsForPi,
          getComposioToolsForPi,
          warn,
        },
      ),
    ).resolves.toEqual([]);
    expect(getGoogleAdsToolsForPi).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Google Ads connection active but no customerId in config - skipping tools");
  });
});
