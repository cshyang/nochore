import { describe, expect, it } from "vitest";
import { deriveActivityVersion, derivePrimaryStatus } from "./activity-core";

describe("activity projection helpers", () => {
  it("prioritizes attention over running and error", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 1,
        activeRunCount: 2,
        latestRunStatus: "failed",
      }),
    ).toBe("attention");
  });

  it("treats concurrent active runs as running", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 0,
        activeRunCount: 2,
        latestRunStatus: "failed",
      }),
    ).toBe("running");
  });

  it("falls back to error when there are no active runs and the latest run failed", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 0,
        activeRunCount: 0,
        latestRunStatus: "failed",
      }),
    ).toBe("error");
  });

  it("changes version when a fresher timestamp is present", () => {
    const earlier = deriveActivityVersion([1_000, 2_000, 3_000]);
    const later = deriveActivityVersion([1_000, 2_000, 4_000]);

    expect(later).not.toBe(earlier);
    expect(later).toBeGreaterThan(earlier);
  });
});
