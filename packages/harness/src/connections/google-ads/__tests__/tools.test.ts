import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolDefinition } from "../../../types";

const mockQuery = vi.fn().mockResolvedValue([]);
const mockMutate = vi.fn().mockResolvedValue({ mutate_operation_responses: [] });

// Mock the client module — this avoids env var validation and real API calls
vi.mock("../client", () => ({
  createGoogleAdsCustomer: vi.fn().mockReturnValue({
    query: mockQuery,
    mutateResources: mockMutate,
  }),
}));

const { createGoogleAdsCustomer } = await import("../client");
const { getGoogleAdsAgentTools } = await import("../tools");

describe("getGoogleAdsAgentTools", () => {
  let tools: AgentToolDefinition[];

  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue([]);
    mockMutate.mockReset().mockResolvedValue({ mutate_operation_responses: [] });
    tools = getGoogleAdsAgentTools({ customerId: "1073100792" });
  });

  it("passes connection-scoped credentials to the Google Ads client", async () => {
    const credentialScopedTools = getGoogleAdsAgentTools({
      customerId: "1073100792",
      refreshToken: "refresh-token",
      managerCustomerId: "9998887777",
    });
    const tool = credentialScopedTools.find((t) => t.name === "googleads_list_campaigns")!;
    await tool.execute("call-credentials", {});

    expect(createGoogleAdsCustomer).toHaveBeenLastCalledWith({
      customerId: "1073100792",
      refreshToken: "refresh-token",
      managerCustomerId: "9998887777",
    });
  });

  it("returns exactly 6 tools", () => {
    expect(tools).toHaveLength(6);
  });

  it("has correct tool names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "googleads_list_campaigns",
      "googleads_campaign_performance",
      "googleads_search_terms",
      "googleads_keyword_quality",
      "googleads_add_negative_keywords",
      "googleads_adjust_budget",
    ]);
  });

  it("each tool has label, description, parameters, and execute", () => {
    for (const tool of tools) {
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toHaveProperty("type", "object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("each tool has valid JSON Schema parameters with type object", () => {
    for (const tool of tools) {
      const params = tool.parameters as { type: string; properties?: Record<string, unknown> };
      expect(params.type).toBe("object");
    }
  });

  describe("read tool execution", () => {
    it("googleads_list_campaigns returns success shape on empty results", async () => {
      const tool = tools.find((t) => t.name === "googleads_list_campaigns")!;
      const result = await tool.execute("call-1", {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.details.successful).toBe(true);
      expect(result.details.error).toBeNull();

      const data = JSON.parse(result.content[0].text);
      expect(data.campaigns).toEqual([]);
      expect(data.count).toBe(0);
    });

    it("googleads_campaign_performance returns success shape", async () => {
      const tool = tools.find((t) => t.name === "googleads_campaign_performance")!;
      const result = await tool.execute("call-2", {
        campaignId: "123",
        startDate: "2026-03-01",
        endDate: "2026-03-29",
      });

      expect(result.details.successful).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.daily).toEqual([]);
    });

    it("converts cost_micros to cost correctly", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          campaign: { id: 1, name: "Test Campaign", status: "ENABLED" },
          campaign_budget: { amount_micros: 50_000_000 },
          metrics: {
            impressions: 1000,
            clicks: 50,
            cost_micros: 25_500_000,
            conversions: 5,
            conversions_value: 150,
          },
          customer: { currency_code: "USD" },
        },
      ]);

      const tool = tools.find((t) => t.name === "googleads_list_campaigns")!;
      const result = await tool.execute("call-3", {});
      const data = JSON.parse(result.content[0].text);

      expect(data.campaigns[0].cost).toBe(25.5);
      expect(data.campaigns[0].dailyBudget).toBe(50);
      expect(data.campaigns[0].impressions).toBe(1000);
    });
  });

  describe("error handling", () => {
    it("returns failure shape on API error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("API quota exceeded"));

      const tool = tools.find((t) => t.name === "googleads_list_campaigns")!;
      const result = await tool.execute("call-err", {});

      expect(result.details.successful).toBe(false);
      expect(result.details.error).toBe("API quota exceeded");
      expect(result.content[0].text).toContain("Error executing googleads_list_campaigns");
    });

    it("explains invalid_grant as a refresh-token reauthorization issue", async () => {
      mockQuery.mockRejectedValueOnce(new Error("invalid_grant"));

      const tool = tools.find((t) => t.name === "googleads_list_campaigns")!;
      const result = await tool.execute("call-invalid-grant", {});

      expect(result.details.successful).toBe(false);
      expect(result.details.error).toContain("refresh token is invalid or expired");
      expect(result.content[0].text).toContain("Update this project's Google Ads connection refresh token");
    });

    it("write tool returns failure when campaign not found", async () => {
      mockQuery.mockResolvedValueOnce([]);

      const tool = tools.find((t) => t.name === "googleads_add_negative_keywords")!;
      const result = await tool.execute("call-nf", {
        campaignId: "999",
        keywords: ["test"],
      });

      expect(result.details.successful).toBe(false);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("write tool execution", () => {
    it("googleads_add_negative_keywords calls mutateResources after resolve", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          campaign: { id: 123, name: "Brand Campaign", campaign_budget: "customers/107/campaignBudgets/1" },
          campaign_budget: { amount_micros: 50_000_000 },
          customer: { currency_code: "USD" },
        },
      ]);
      mockMutate.mockResolvedValueOnce({
        mutate_operation_responses: [
          { campaign_criterion_result: { resource_name: "customers/107/campaignCriteria/123~456" } },
        ],
      });

      const tool = tools.find((t) => t.name === "googleads_add_negative_keywords")!;
      const result = await tool.execute("call-neg", {
        campaignId: "123",
        keywords: ["bad keyword"],
        matchType: "EXACT",
      });

      expect(result.details.successful).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.addedKeywords).toEqual(["bad keyword"]);
      expect(data.matchType).toBe("EXACT");
      expect(mockMutate).toHaveBeenCalledOnce();
    });

    it("googleads_adjust_budget returns previous and new budget", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          campaign: { id: 123, name: "Brand Campaign", campaign_budget: "customers/107/campaignBudgets/1" },
          campaign_budget: { amount_micros: 50_000_000 },
          customer: { currency_code: "USD" },
        },
      ]);
      mockMutate.mockResolvedValueOnce({
        mutate_operation_responses: [{ campaign_budget_result: { resource_name: "customers/107/campaignBudgets/1" } }],
      });

      const tool = tools.find((t) => t.name === "googleads_adjust_budget")!;
      const result = await tool.execute("call-budget", {
        campaignId: "123",
        newBudgetAmount: 75,
      });

      expect(result.details.successful).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.previousBudget).toBe(50);
      expect(data.newBudget).toBe(75);
      expect(data.currency).toBe("USD");
    });
  });
});
