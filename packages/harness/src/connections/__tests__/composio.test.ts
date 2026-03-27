import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ComposioConnectionManager,
  createComposioClient,
  getComposioToolsForChat,
  DEFAULT_DATA_TYPE_MAPPINGS,
} from "../composio";

// ---------------------------------------------------------------------------
// Mock helpers — we mock the Composio SDK at the object level, never calling
// real APIs. The mock shape matches the actual Composio class from @composio/core.
// ---------------------------------------------------------------------------

function createMockComposio(overrides?: {
  executeResult?: { data: Record<string, unknown>; error: string | null; successful: boolean };
  executeError?: Error;
  sessionTools?: Record<string, unknown>;
}) {
  const mockExecute = overrides?.executeError
    ? vi.fn().mockRejectedValue(overrides.executeError)
    : vi.fn().mockResolvedValue(
        overrides?.executeResult ?? {
          data: { result: "ok" },
          error: null,
          successful: true,
        },
      );

  const mockSessionTools = vi.fn().mockResolvedValue(
    overrides?.sessionTools ?? { GOOGLEADS_SEARCH: { description: "mock" } },
  );

  return {
    tools: { execute: mockExecute },
    create: vi.fn().mockResolvedValue({
      sessionId: "sess_mock_001",
      tools: mockSessionTools,
    }),
    _mocks: { execute: mockExecute, sessionTools: mockSessionTools },
  };
}

// ---------------------------------------------------------------------------
// createComposioClient
// ---------------------------------------------------------------------------
describe("createComposioClient", () => {
  it("returns a Composio instance (smoke test)", () => {
    // We can't deeply test this without calling the real SDK constructor,
    // but we verify the function exists and is callable.
    expect(typeof createComposioClient).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ComposioConnectionManager
// ---------------------------------------------------------------------------
describe("ComposioConnectionManager", () => {
  const testUserId = "user_test_001";
  const testMappings = {
    search_terms: {
      toolSlug: "GOOGLEADS_SEARCH_TERMS_REPORT",
      defaultParams: { dateRange: "LAST_30_DAYS" },
    },
    ad_metrics: {
      toolSlug: "GOOGLEADS_CAMPAIGN_PERFORMANCE",
    },
  };

  let mockComposio: ReturnType<typeof createMockComposio>;
  let manager: ComposioConnectionManager;

  beforeEach(() => {
    mockComposio = createMockComposio({
      executeResult: {
        data: { keywords: ["brand", "generic"], totalSpend: 1250 },
        error: null,
        successful: true,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager = new ComposioConnectionManager(mockComposio as any, testUserId, testMappings);
  });

  // -----------------------------------------------------------------------
  // fetch
  // -----------------------------------------------------------------------
  describe("fetch", () => {
    it("calls composio.tools.execute with correct slug and params", async () => {
      await manager.fetch("search_terms");

      expect(mockComposio.tools.execute).toHaveBeenCalledOnce();
      expect(mockComposio.tools.execute).toHaveBeenCalledWith(
        "GOOGLEADS_SEARCH_TERMS_REPORT",
        {
          arguments: { dateRange: "LAST_30_DAYS" },
          userId: testUserId,
          dangerouslySkipVersionCheck: true,
        },
      );
    });

    it("returns the data from the Composio response", async () => {
      const result = await manager.fetch("search_terms");
      expect(result).toEqual({
        keywords: ["brand", "generic"],
        totalSpend: 1250,
      });
    });

    it("calls execute with empty arguments when no defaultParams", async () => {
      await manager.fetch("ad_metrics");

      expect(mockComposio.tools.execute).toHaveBeenCalledWith(
        "GOOGLEADS_CAMPAIGN_PERFORMANCE",
        {
          arguments: {},
          userId: testUserId,
          dangerouslySkipVersionCheck: true,
        },
      );
    });

    it("throws for unmapped data type", async () => {
      await expect(manager.fetch("nonexistent")).rejects.toThrow(
        /no composio mapping for data type: nonexistent/i,
      );
    });

    it("does not call composio.tools.execute for unmapped type", async () => {
      try {
        await manager.fetch("nonexistent");
      } catch {
        // expected
      }
      expect(mockComposio.tools.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // execute
  // -----------------------------------------------------------------------
  describe("execute", () => {
    it("calls composio.tools.execute with registry-backed slug", async () => {
      const result = await manager.execute("pause_ad", "google_ads", {
        customerId: "123",
      });

      expect(mockComposio.tools.execute).toHaveBeenCalledOnce();
      expect(mockComposio.tools.execute).toHaveBeenCalledWith(
        "GOOGLEADS_PAUSE_AD",
        {
          arguments: { customerId: "123" },
          userId: testUserId,
          dangerouslySkipVersionCheck: true,
        },
      );

      expect(result.status).toBe("executed");
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it("returns output from successful execution", async () => {
      const result = await manager.execute("pause_campaign", "meta_ads", {});

      expect(result.status).toBe("executed");
      expect(result.output).toEqual({
        keywords: ["brand", "generic"],
        totalSpend: 1250,
      });
    });

    it("returns failed result on execution error", async () => {
      const errorComposio = createMockComposio({
        executeError: new Error("API rate limit exceeded"),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorManager = new ComposioConnectionManager(errorComposio as any, testUserId, testMappings);

      const result = await errorManager.execute("pause_ad", "google_ads", {});

      expect(result.status).toBe("failed");
      expect(result.error).toBe("API rate limit exceeded");
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it("sets proposalId to empty string (caller fills it in)", async () => {
      const result = await manager.execute("pause_ad", "google_ads", {});
      expect(result.proposalId).toBe("");
    });

    it("fails unknown actions instead of guessing a slug", async () => {
      const result = await manager.execute("unknown_action", "google_ads", {});
      expect(result.status).toBe("failed");
      expect(result.error).toMatch(/unregistered action capability/i);
      expect(mockComposio.tools.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // availableDataTypes
  // -----------------------------------------------------------------------
  describe("availableDataTypes", () => {
    it("returns mapping keys", () => {
      const types = manager.availableDataTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain("search_terms");
      expect(types).toContain("ad_metrics");
    });

    it("returns empty array when no mappings", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emptyManager = new ComposioConnectionManager(mockComposio as any, testUserId, {});
      expect(emptyManager.availableDataTypes()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getHealth
  // -----------------------------------------------------------------------
  describe("getHealth", () => {
    it("returns a health entry with composio provider", async () => {
      const health = await manager.getHealth();
      expect(health).toHaveLength(1);
      expect(health[0]!.connectionId).toBe(`composio-${testUserId}-composio`);
      expect(health[0]!.provider).toBe("composio");
      expect(health[0]!.status).toBe("active");
      expect(health[0]!.lastChecked).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // explicit action capability mapping (tested indirectly via execute)
  // -----------------------------------------------------------------------
  describe("action capability registry", () => {
    it("google_ads + pause_ad → GOOGLEADS_PAUSE_AD", async () => {
      await manager.execute("pause_ad", "google_ads", {});
      const slug = mockComposio.tools.execute.mock.calls[0]![0];
      expect(slug).toBe("GOOGLEADS_PAUSE_AD");
    });

    it("meta_ads + pause_campaign → METAADS_PAUSE_CAMPAIGN", async () => {
      await manager.execute("pause_campaign", "meta_ads", {});
      const slug = mockComposio.tools.execute.mock.calls[0]![0];
      expect(slug).toBe("METAADS_PAUSE_CAMPAIGN");
    });
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_DATA_TYPE_MAPPINGS
// ---------------------------------------------------------------------------
describe("DEFAULT_DATA_TYPE_MAPPINGS", () => {
  it("has expected entries", () => {
    expect(DEFAULT_DATA_TYPE_MAPPINGS).toHaveProperty("search_terms");
    expect(DEFAULT_DATA_TYPE_MAPPINGS).toHaveProperty("ad_metrics");
    expect(DEFAULT_DATA_TYPE_MAPPINGS).toHaveProperty("budget_data");
    expect(DEFAULT_DATA_TYPE_MAPPINGS).toHaveProperty("impression_share");
    expect(DEFAULT_DATA_TYPE_MAPPINGS).toHaveProperty("quality_scores");
  });

  it("each mapping has a toolSlug", () => {
    for (const [key, mapping] of Object.entries(DEFAULT_DATA_TYPE_MAPPINGS)) {
      expect(mapping.toolSlug, `${key} should have toolSlug`).toBeTruthy();
      expect(typeof mapping.toolSlug).toBe("string");
    }
  });

  it("search_terms maps to GOOGLEADS_SEARCH_TERMS_REPORT", () => {
    expect(DEFAULT_DATA_TYPE_MAPPINGS.search_terms!.toolSlug).toBe(
      "GOOGLEADS_SEARCH_TERMS_REPORT",
    );
  });
});

// ---------------------------------------------------------------------------
// getComposioToolsForChat
// ---------------------------------------------------------------------------
describe("getComposioToolsForChat", () => {
  it("creates a session and returns tools", async () => {
    const expectedTools = {
      GOOGLEADS_SEARCH: { description: "search" },
      GOOGLEADS_PAUSE: { description: "pause" },
    };

    const mockComposio = createMockComposio({ sessionTools: expectedTools });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = await getComposioToolsForChat(mockComposio as any, "user_123");

    expect(mockComposio.create).toHaveBeenCalledWith("user_123");
    expect(tools).toEqual(expectedTools);
  });

  it("passes userId to composio.create", async () => {
    const mockComposio = createMockComposio();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getComposioToolsForChat(mockComposio as any, "user_abc");

    expect(mockComposio.create).toHaveBeenCalledWith("user_abc");
  });
});
