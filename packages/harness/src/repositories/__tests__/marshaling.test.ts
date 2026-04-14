import { describe, expect, it } from "vitest";
import { parseJson } from "../marshaling";

describe("parseJson", () => {
  it("parses valid JSON strings", () => {
    expect(parseJson<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
    expect(parseJson<number[]>("[1,2,3]", [])).toEqual([1, 2, 3]);
    expect(parseJson<string>('"hello"', "")).toBe("hello");
  });

  it("returns fallback for null input", () => {
    expect(parseJson<number[]>(null, [])).toEqual([]);
    const fallback = { default: true };
    expect(parseJson<{ default: boolean }>(null, fallback)).toBe(fallback);
  });

  it("returns fallback for undefined input", () => {
    expect(parseJson<number[]>(undefined, [1])).toEqual([1]);
  });

  it("returns fallback for malformed JSON", () => {
    expect(parseJson<number[]>("{not valid", [])).toEqual([]);
    expect(parseJson<unknown>("", null)).toBeNull();
  });

  it("preserves the type parameter for the caller", () => {
    const result = parseJson<{ name: string }>('{"name":"alice"}', { name: "" });
    expect(result.name).toBe("alice");
  });
});
