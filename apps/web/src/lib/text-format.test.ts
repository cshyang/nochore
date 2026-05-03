import { describe, expect, it } from "vitest";
import { humanize } from "./text-format";

describe("humanize", () => {
  it("replaces underscores with spaces and title-cases", () => {
    expect(humanize("tool_called")).toBe("Tool Called");
  });

  it("replaces hyphens with spaces and title-cases", () => {
    expect(humanize("waiting-for-approval")).toBe("Waiting For Approval");
  });

  it("handles mixed delimiters", () => {
    expect(humanize("task-started")).toBe("Task Started");
  });

  it("leaves single words capitalized", () => {
    expect(humanize("running")).toBe("Running");
  });

  it("returns empty string unchanged", () => {
    expect(humanize("")).toBe("");
  });
});
