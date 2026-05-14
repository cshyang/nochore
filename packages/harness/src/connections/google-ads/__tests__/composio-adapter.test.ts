import { beforeEach, describe, expect, it, vi } from "vitest";
import { createComposioClient } from "../../composio";
import { createComposioAdapter } from "../../composio-adapter";

vi.mock("../../composio", () => ({
  createComposioClient: vi.fn(),
}));

describe("createComposioAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("paginates toolkit catalog results until Composio has no next cursor", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ slug: "GOOGLEADS_ONE", name: "One" }],
        next_cursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        items: [{ slug: "GOOGLEADS_TWO", name: "Two" }],
        next_cursor: null,
      });

    vi.mocked(createComposioClient).mockResolvedValue({
      client: { tools: { list } },
      tools: {
        execute: vi.fn(),
        getRawComposioTools: vi.fn(),
      },
    } as never);

    const adapter = await createComposioAdapter();
    const tools = await adapter.listToolkitCatalog({ toolkitSlug: "googleads", limit: 1 });

    expect(tools.map((tool) => tool.slug)).toEqual(["GOOGLEADS_ONE", "GOOGLEADS_TWO"]);
    expect(list).toHaveBeenNthCalledWith(1, { toolkit_slug: "googleads", limit: 1, cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { toolkit_slug: "googleads", limit: 1, cursor: "cursor_2" });
  });
});
