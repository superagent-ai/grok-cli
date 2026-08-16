import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findGitRoot } from "../utils/git-root.js";
import type { SuggesterSessionState, SuggestionUsage } from "./types.js";

const EMPTY_USAGE: SuggestionUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };

export function projectKeyFor(cwd: string): string {
  const root = findGitRoot(cwd) ?? cwd;
  return createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
}

export function suggesterStatePath(cwd: string, sessionId: string, homeDir = os.homedir()): string {
  return path.join(
    homeDir,
    ".grok",
    "prompt-suggester",
    "projects",
    projectKeyFor(cwd),
    "sessions",
    sessionId,
    "state.json",
  );
}

export function loadSuggesterSessionState(
  cwd: string,
  sessionId: string,
  homeDir = os.homedir(),
): SuggesterSessionState {
  const filePath = suggesterStatePath(cwd, sessionId, homeDir);
  try {
    if (!fs.existsSync(filePath)) return emptySessionState();
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<SuggesterSessionState>;
    return {
      lastSuggestion: parsed.lastSuggestion,
      lastUsage: parsed.lastUsage,
      suggestionUsage: {
        ...EMPTY_USAGE,
        ...parsed.suggestionUsage,
      },
      seederUsage: {
        ...EMPTY_USAGE,
        ...parsed.seederUsage,
      },
      steeringHistory: Array.isArray(parsed.steeringHistory) ? parsed.steeringHistory : [],
      turnsSinceLastStalenessCheck:
        typeof parsed.turnsSinceLastStalenessCheck === "number" ? parsed.turnsSinceLastStalenessCheck : 0,
    };
  } catch {
    return emptySessionState();
  }
}

export function saveSuggesterSessionState(
  cwd: string,
  sessionId: string,
  state: SuggesterSessionState,
  homeDir = os.homedir(),
): void {
  const filePath = suggesterStatePath(cwd, sessionId, homeDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    /* never block the TUI on suggester persistence */
  }
}

export function emptySessionState(): SuggesterSessionState {
  return {
    suggestionUsage: { ...EMPTY_USAGE },
    seederUsage: { ...EMPTY_USAGE },
    steeringHistory: [],
    turnsSinceLastStalenessCheck: 0,
  };
}

export function addUsage(
  current: SuggestionUsage,
  delta?: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
  modelId?: string,
): SuggestionUsage {
  return {
    inputTokens: current.inputTokens + (delta?.inputTokens ?? 0),
    outputTokens: current.outputTokens + (delta?.outputTokens ?? 0),
    totalTokens: current.totalTokens + (delta?.totalTokens ?? 0),
    calls: current.calls + 1,
    modelId: modelId ?? current.modelId,
  };
}
