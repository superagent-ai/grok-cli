import { describe, expect, it } from "vitest";
import type { ChatEntry } from "../types/index.js";
import { buildSuggestionContext, sliceLastTurn } from "./context.js";

function entry(partial: Partial<ChatEntry> & Pick<ChatEntry, "type" | "content">): ChatEntry {
  return { timestamp: new Date("2026-08-16T12:00:00.000Z"), ...partial };
}

describe("sliceLastTurn", () => {
  it("returns entries after the last user message", () => {
    const entries = [
      entry({ type: "user", content: "first" }),
      entry({ type: "assistant", content: "ok" }),
      entry({ type: "user", content: "second" }),
      entry({ type: "tool_result", content: "wrote file", toolCall: tool("write_file", { path: "src/a.ts" }) }),
      entry({ type: "assistant", content: "done" }),
    ];
    expect(sliceLastTurn(entries).map((item) => item.content)).toEqual(["second", "wrote file", "done"]);
  });
});

describe("buildSuggestionContext", () => {
  it("collects recent user prompts, tool signals, touched files, and questions", () => {
    const entries = [
      entry({ type: "user", content: "add tests" }),
      entry({ type: "assistant", content: "I can add them." }),
      entry({ type: "user", content: "do it for context.ts" }),
      entry({
        type: "tool_result",
        content: "ok",
        toolCall: tool("write_file", { path: "src/suggester/context.ts" }),
        toolResult: {
          success: true,
          output: "wrote context.ts",
          diff: { filePath: "src/suggester/context.ts", additions: 1, removals: 0, patch: "", isNew: false },
        },
      }),
      entry({ type: "assistant", content: "Added tests.\nWant me to run them?" }),
    ];

    const context = buildSuggestionContext(entries, "success");
    expect(context.turnStatus).toBe("success");
    expect(context.recentUserPrompts).toEqual(["add tests", "do it for context.ts"]);
    expect(context.latestAssistantTurn).toContain("Want me to run them?");
    expect(context.toolSignals[0]).toContain("write_file: ok");
    expect(context.touchedFiles).toContain("src/suggester/context.ts");
    expect(context.unresolvedQuestions.some((item) => item.includes("run them"))).toBe(true);
  });

  it("passes abort notes through", () => {
    const context = buildSuggestionContext([entry({ type: "user", content: "go" })], "aborted", {
      abortNote: "User interrupted the previous turn.",
    });
    expect(context.abortContextNote).toBe("User interrupted the previous turn.");
    expect(context.turnStatus).toBe("aborted");
  });
});

function tool(name: string, args: Record<string, unknown>) {
  return {
    id: "call-1",
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}
