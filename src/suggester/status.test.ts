import { describe, expect, it } from "vitest";
import { DEFAULT_SUGGESTER_SETTINGS } from "./config.js";
import { formatSuggesterStatus } from "./status.js";
import { emptySessionState } from "./store.js";

describe("formatSuggesterStatus", () => {
  it("reports off and empty history", () => {
    const text = formatSuggesterStatus({ ...DEFAULT_SUGGESTER_SETTINGS, enabled: false }, emptySessionState());
    expect(text).toContain("Prompt suggester: off");
    expect(text).toContain("Fill: ghost");
    expect(text).toContain("Last suggestion: none yet this session");
  });

  it("includes last suggestion and usage", () => {
    const text = formatSuggesterStatus(DEFAULT_SUGGESTER_SETTINGS, {
      lastSuggestion: { text: "run the tests", shownAt: "2026-08-16T12:00:00.000Z", turnStatus: "success" },
      lastUsage: { inputTokens: 80, outputTokens: 6, totalTokens: 86, modelId: "grok-3-mini" },
      suggestionUsage: { inputTokens: 80, outputTokens: 6, totalTokens: 86, calls: 1, modelId: "grok-3-mini" },
      seederUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 },
      steeringHistory: [],
      turnsSinceLastStalenessCheck: 0,
    });
    expect(text).toContain("Prompt suggester: on");
    expect(text).toContain("run the tests");
    expect(text).toContain("80 in / 6 out");
    expect(text).toContain("1 call");
    expect(text).toContain("Seed: none yet");
  });
});
