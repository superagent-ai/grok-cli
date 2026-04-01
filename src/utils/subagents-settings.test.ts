import { describe, expect, it } from "vitest";
import { parseSubAgentsRawList } from "./settings";

describe("parseSubAgentsRawList", () => {
  it("returns empty for non-array or missing", () => {
    expect(parseSubAgentsRawList(undefined)).toEqual([]);
    expect(parseSubAgentsRawList(null)).toEqual([]);
    expect(parseSubAgentsRawList({})).toEqual([]);
  });

  it("keeps valid entries with known model ids", () => {
    expect(
      parseSubAgentsRawList([
        { name: "docs", model: "grok-4-1-fast-reasoning", instruction: "Focus on documentation." },
      ]),
    ).toEqual([{ name: "docs", model: "grok-4-1-fast-reasoning", instruction: "Focus on documentation." }]);
  });

  it("normalizes legacy aliases to canonical ids", () => {
    expect(
      parseSubAgentsRawList([
        { name: "research", model: "x-ai/grok-4.20-multi-agent-beta", instruction: "Focus on research." },
      ]),
    ).toEqual([{ name: "research", model: "grok-4.20-multi-agent-0309", instruction: "Focus on research." }]);
  });

  it("skips unknown models", () => {
    expect(parseSubAgentsRawList([{ name: "bad", model: "not-a-real-model", instruction: "x" }])).toEqual([]);
  });

  it("skips reserved and empty names", () => {
    expect(
      parseSubAgentsRawList([
        { name: "general", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "Explore", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "vision", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "Verify", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "computer", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "", model: "grok-4-1-fast-reasoning", instruction: "x" },
        { name: "  ", model: "grok-4-1-fast-reasoning", instruction: "x" },
      ]),
    ).toEqual([]);
  });

  it("dedupes by case-insensitive name with first entry winning", () => {
    expect(
      parseSubAgentsRawList([
        { name: "Docs", model: "grok-4-1-fast", instruction: "first" },
        { name: "docs", model: "grok-code-fast-1", instruction: "second" },
      ]),
    ).toEqual([{ name: "Docs", model: "grok-4-1-fast-reasoning", instruction: "first" }]);
  });

  it("ignores non-object rows", () => {
    expect(parseSubAgentsRawList([null, "x", { name: "ok", model: "grok-3-mini", instruction: "" }])).toEqual([
      { name: "ok", model: "grok-3-mini", instruction: "" },
    ]);
  });
});
