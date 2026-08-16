import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { addUsage, emptySessionState, loadSuggesterSessionState, saveSuggesterSessionState } from "./store.js";

const dirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "grok-suggester-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("suggester session store", () => {
  it("round-trips last suggestion and usage", () => {
    const home = tempHome();
    const cwd = path.join(home, "repo");
    const state = emptySessionState();
    state.lastSuggestion = { text: "run the tests", shownAt: "2026-08-16T12:00:00.000Z", turnStatus: "success" };
    state.suggestionUsage = addUsage(
      state.suggestionUsage,
      { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      "grok-3-mini",
    );
    saveSuggesterSessionState(cwd, "sess-1", state, home);

    const loaded = loadSuggesterSessionState(cwd, "sess-1", home);
    expect(loaded.lastSuggestion?.text).toBe("run the tests");
    expect(loaded.suggestionUsage.calls).toBe(1);
    expect(loaded.suggestionUsage.totalTokens).toBe(14);
    expect(loaded.suggestionUsage.modelId).toBe("grok-3-mini");
  });

  it("returns empty state when missing", () => {
    expect(loadSuggesterSessionState("/tmp/missing-repo", "nope", tempHome()).suggestionUsage.calls).toBe(0);
  });
});
