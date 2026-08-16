import { describe, expect, it } from "vitest";
import { finalizeSuggestionResult, normalizeSuggestion, shouldFastPathContinue } from "./engine.js";

describe("shouldFastPathContinue", () => {
  it("fast-paths error and aborted turns when enabled", () => {
    expect(shouldFastPathContinue("error", true)).toBe(true);
    expect(shouldFastPathContinue("aborted", true)).toBe(true);
    expect(shouldFastPathContinue("success", true)).toBe(false);
    expect(shouldFastPathContinue("error", false)).toBe(false);
  });
});

describe("normalizeSuggestion", () => {
  it("returns null for empty or no-suggestion tokens", () => {
    expect(normalizeSuggestion("   ", 200)).toBeNull();
    expect(normalizeSuggestion("[no suggestion]", 200)).toBeNull();
  });

  it("trims and truncates long suggestions", () => {
    expect(normalizeSuggestion("  Yes.  \n\n\nGo ahead.  ", 200)).toBe("Yes.\n\nGo ahead.");
    expect(normalizeSuggestion("abcdefghij", 6)).toBe("abcdef");
  });
});

describe("finalizeSuggestionResult", () => {
  it("keeps usage when the model declines to suggest", () => {
    const result = finalizeSuggestionResult(
      { kind: "suggestion", text: "[no suggestion]", usage: { totalTokens: 12 }, modelId: "grok-3-mini" },
      200,
    );
    expect(result.kind).toBe("no_suggestion");
    expect(result.usage?.totalTokens).toBe(12);
    expect(result.modelId).toBe("grok-3-mini");
  });
});
