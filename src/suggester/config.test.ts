import { describe, expect, it } from "vitest";
import { DEFAULT_SUGGESTER_SETTINGS, resolveSuggesterSettings } from "./config.js";

describe("resolveSuggesterSettings", () => {
  it("defaults to enabled with the cheap model", () => {
    expect(resolveSuggesterSettings()).toEqual(DEFAULT_SUGGESTER_SETTINGS);
    expect(resolveSuggesterSettings({})).toMatchObject({
      enabled: true,
      model: "grok-3-mini",
      seederModel: "grok-3-mini",
      ghostAcceptKeys: ["space", "right"],
      fastPathContinueOnError: true,
      autoAccept: false,
    });
  });

  it("treats enabled: false as off and clamps max chars", () => {
    expect(resolveSuggesterSettings({ enabled: false }).enabled).toBe(false);
    expect(resolveSuggesterSettings({ maxSuggestionChars: 5 }).maxSuggestionChars).toBe(20);
    expect(resolveSuggesterSettings({ maxSuggestionChars: 9_000 }).maxSuggestionChars).toBe(500);
  });

  it("drops unknown accept keys and falls back when empty", () => {
    expect(resolveSuggesterSettings({ ghostAcceptKeys: ["space"] }).ghostAcceptKeys).toEqual(["space"]);
    expect(resolveSuggesterSettings({ ghostAcceptKeys: [] }).ghostAcceptKeys).toEqual(["space", "right"]);
  });
});
