import { describe, expect, it } from "vitest";
import { inferHeuristicSuggestion } from "./heuristic.js";
import type { SuggestionPromptContext } from "./types.js";

function ctx(partial: Partial<SuggestionPromptContext>): SuggestionPromptContext {
  return {
    turnStatus: "success",
    latestAssistantTurn: "",
    recentUserPrompts: [],
    toolSignals: [],
    touchedFiles: [],
    unresolvedQuestions: [],
    recentChanged: [],
    customInstruction: "",
    intentSeed: "none",
    maxSuggestionChars: 200,
    noSuggestionToken: "[no suggestion]",
    ...partial,
  };
}

describe("inferHeuristicSuggestion", () => {
  it("continues after an aborted turn", () => {
    expect(inferHeuristicSuggestion(ctx({ turnStatus: "aborted" }))).toEqual({
      text: "continue",
      confidence: "high",
    });
  });

  it("answers a yes/no offer without a model call", () => {
    expect(inferHeuristicSuggestion(ctx({ latestAssistantTurn: "Added the tests.\nWant me to run them?" }))?.text).toBe(
      "Yes.",
    );
  });

  it("returns null when there is no clear next move", () => {
    expect(inferHeuristicSuggestion(ctx({ latestAssistantTurn: "Pushed the branch to origin." }))).toBeNull();
  });
});
