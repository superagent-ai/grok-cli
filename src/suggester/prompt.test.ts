import { describe, expect, it } from "vitest";
import { renderSuggestionPrompt } from "./prompt.js";
import type { SuggestionPromptContext } from "./types.js";

describe("renderSuggestionPrompt", () => {
  it("includes turn signals and the no-suggestion token", () => {
    const context: SuggestionPromptContext = {
      turnStatus: "success",
      latestAssistantTurn: "I added the tests.",
      recentUserPrompts: ["add tests"],
      toolSignals: ["write_file: ok — src/foo.test.ts"],
      touchedFiles: ["src/foo.test.ts"],
      unresolvedQuestions: ["Want me to run them?"],
      recentChanged: [{ suggestedPrompt: "ship it", actualUserPrompt: "add tests first" }],
      customInstruction: "Prefer terse commands.",
      intentSeed: '{"projectIntentSummary":"Port the Pi suggester"}',
      maxSuggestionChars: 200,
      noSuggestionToken: "[no suggestion]",
    };
    const prompt = renderSuggestionPrompt(context);
    expect(prompt).toContain("Next user message only");
    expect(prompt).toContain("[no suggestion]");
    expect(prompt).toContain("add tests");
    expect(prompt).toContain("src/foo.test.ts");
    expect(prompt).toContain("Want me to run them?");
    expect(prompt).toContain("Intent:");
    expect(prompt).toContain("Port the Pi suggester");
    expect(prompt).toContain("Prefer terse commands.");
    expect(prompt).toContain("add tests first");
    expect(prompt).toContain("Max 200 chars");
  });
});
