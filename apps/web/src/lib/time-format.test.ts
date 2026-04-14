import { describe, expect, it } from "vitest";
import { formatDuration, formatTime } from "./time-format";

describe("formatDuration", () => {
  it("returns empty string when start or end is missing", () => {
    expect(formatDuration(undefined, undefined)).toBe("");
    expect(formatDuration("2026-04-15T00:00:00Z", undefined)).toBe("");
    expect(formatDuration(undefined, "2026-04-15T00:00:00Z")).toBe("");
  });

  it("formats sub-minute durations as seconds", () => {
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T00:00:30Z")).toBe("30s");
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T00:00:00Z")).toBe("0s");
  });

  it("formats sub-hour durations as whole minutes", () => {
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T00:05:00Z")).toBe("5m");
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T00:59:59Z")).toBe("59m");
  });

  it("formats hour+ durations with optional remaining minutes", () => {
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T01:00:00Z")).toBe("1h");
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T01:23:00Z")).toBe("1h 23m");
    expect(formatDuration("2026-04-15T00:00:00Z", "2026-04-15T03:00:00Z")).toBe("3h");
  });
});

describe("formatTime", () => {
  it("renders a hour:minute time string", () => {
    const result = formatTime("2026-04-15T14:07:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
