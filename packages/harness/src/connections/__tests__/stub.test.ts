import { describe, it, expect } from "vitest";
import { StubConnectionManager } from "../stub";
import type { ExecutionResult } from "../../types/action";

// ---------------------------------------------------------------------------
// StubConnectionManager
// ---------------------------------------------------------------------------
describe("StubConnectionManager", () => {
  // -----------------------------------------------------------------------
  // fetch
  // -----------------------------------------------------------------------
  describe("fetch", () => {
    it("returns configured data for a known data type", async () => {
      const mockData = { keywords: ["brand", "generic"], totalSpend: 1250 };
      const cm = new StubConnectionManager({
        data: { search_terms: mockData },
      });

      const result = await cm.fetch("search_terms");
      expect(result).toEqual(mockData);
    });

    it("returns different data for different data types", async () => {
      const searchData = { keywords: ["brand"] };
      const metricsData = { impressions: 5000, clicks: 200 };
      const cm = new StubConnectionManager({
        data: {
          search_terms: searchData,
          ad_metrics: metricsData,
        },
      });

      expect(await cm.fetch("search_terms")).toEqual(searchData);
      expect(await cm.fetch("ad_metrics")).toEqual(metricsData);
    });

    it("throws for unknown data type", async () => {
      const cm = new StubConnectionManager({
        data: { search_terms: { keywords: [] } },
      });

      await expect(cm.fetch("nonexistent")).rejects.toThrow(
        /no data configured for data type "nonexistent"/i,
      );
    });

    it("throws when no data is configured at all", async () => {
      const cm = new StubConnectionManager({});

      await expect(cm.fetch("search_terms")).rejects.toThrow(
        /no data configured/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // execute
  // -----------------------------------------------------------------------
  describe("execute", () => {
    it("returns configured result for a known action", async () => {
      const expectedResult: ExecutionResult = {
        proposalId: "prop_001",
        status: "executed",
        output: { keywordId: "kw_123" },
        executedAt: new Date("2026-03-21T00:00:00Z"),
      };

      const cm = new StubConnectionManager({
        executionResults: { add_negative_keyword: expectedResult },
      });

      const result = await cm.execute("add_negative_keyword", "google_ads", {
        term: "free wallpaper",
      });
      expect(result).toEqual(expectedResult);
    });

    it("records the call in the execution log", async () => {
      const cm = new StubConnectionManager({
        defaultExecutionResult: {
          proposalId: "prop_default",
          status: "executed",
          executedAt: new Date("2026-03-21T00:00:00Z"),
        },
      });

      await cm.execute("pause_ad", "google_ads", { adId: "ad_001" });

      const log = cm.getExecutionLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toEqual({
        action: "pause_ad",
        toolCategory: "google_ads",
        args: { adId: "ad_001" },
      });
    });

    it("records multiple calls in order", async () => {
      const cm = new StubConnectionManager({
        defaultExecutionResult: {
          proposalId: "prop_default",
          status: "executed",
          executedAt: new Date("2026-03-21T00:00:00Z"),
        },
      });

      await cm.execute("pause_ad", "google_ads", { adId: "ad_001" });
      await cm.execute("update_bid", "google_ads", {
        keywordId: "kw_001",
        bid: 2.5,
      });
      await cm.execute("update_budget", "meta_ads", {
        campaignId: "c_001",
        budget: 100,
      });

      const log = cm.getExecutionLog();
      expect(log).toHaveLength(3);
      expect(log[0]!.action).toBe("pause_ad");
      expect(log[1]!.action).toBe("update_bid");
      expect(log[2]!.action).toBe("update_budget");
    });

    it("returns default execution result for unknown action", async () => {
      const defaultResult: ExecutionResult = {
        proposalId: "prop_default",
        status: "skipped",
        executedAt: new Date("2026-03-21T00:00:00Z"),
      };

      const cm = new StubConnectionManager({
        defaultExecutionResult: defaultResult,
      });

      const result = await cm.execute("unknown_action", "some_tool", {});
      expect(result).toEqual(defaultResult);
    });

    it("throws when no result configured and no default", async () => {
      const cm = new StubConnectionManager({});

      await expect(
        cm.execute("unknown_action", "some_tool", {}),
      ).rejects.toThrow(/no execution result configured for action "unknown_action"/i);
    });

    it("prefers specific result over default", async () => {
      const specificResult: ExecutionResult = {
        proposalId: "prop_specific",
        status: "executed",
        output: { success: true },
        executedAt: new Date("2026-03-21T00:00:00Z"),
      };
      const defaultResult: ExecutionResult = {
        proposalId: "prop_default",
        status: "skipped",
        executedAt: new Date("2026-03-21T00:00:00Z"),
      };

      const cm = new StubConnectionManager({
        executionResults: { pause_ad: specificResult },
        defaultExecutionResult: defaultResult,
      });

      const result = await cm.execute("pause_ad", "google_ads", {});
      expect(result).toEqual(specificResult);
    });
  });

  // -----------------------------------------------------------------------
  // availableDataTypes
  // -----------------------------------------------------------------------
  describe("availableDataTypes", () => {
    it("returns configured data type keys", () => {
      const cm = new StubConnectionManager({
        data: {
          search_terms: { keywords: [] },
          ad_metrics: { impressions: 0 },
          quality_score: { score: 7 },
        },
      });

      const types = cm.availableDataTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain("search_terms");
      expect(types).toContain("ad_metrics");
      expect(types).toContain("quality_score");
    });

    it("returns empty array when no data configured", () => {
      const cm = new StubConnectionManager({});

      expect(cm.availableDataTypes()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getHealth
  // -----------------------------------------------------------------------
  describe("getHealth", () => {
    it("returns a single healthy connection stub", async () => {
      const cm = new StubConnectionManager({});

      const health = await cm.getHealth();
      expect(health).toHaveLength(1);
      expect(health[0]!.status).toBe("active");
      expect(health[0]!.connectionId).toBeTruthy();
      expect(health[0]!.provider).toBeTruthy();
      expect(health[0]!.lastChecked).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // getExecutionLog
  // -----------------------------------------------------------------------
  describe("getExecutionLog", () => {
    it("returns empty array initially", () => {
      const cm = new StubConnectionManager({});
      expect(cm.getExecutionLog()).toEqual([]);
    });

    it("returns a defensive copy", async () => {
      const cm = new StubConnectionManager({
        defaultExecutionResult: {
          proposalId: "prop_default",
          status: "executed",
          executedAt: new Date("2026-03-21T00:00:00Z"),
        },
      });

      await cm.execute("test_action", "test_tool", {});

      const log1 = cm.getExecutionLog();
      const log2 = cm.getExecutionLog();

      // Same contents
      expect(log1).toEqual(log2);
      // Different array references
      expect(log1).not.toBe(log2);
    });
  });
});
