import type { ChatEntry, ToolCall } from "../types/index.js";
import {
  DEFAULT_MAX_ASSISTANT_TURN_CHARS,
  DEFAULT_MAX_RECENT_USER_PROMPT_CHARS,
  DEFAULT_MAX_RECENT_USER_PROMPTS,
  DEFAULT_MAX_SUGGESTION_CHARS,
  DEFAULT_MAX_TOOL_SIGNAL_CHARS,
  DEFAULT_MAX_TOOL_SIGNALS,
  DEFAULT_MAX_TOUCHED_FILES,
  DEFAULT_MAX_UNRESOLVED_QUESTIONS,
  NO_SUGGESTION_TOKEN,
} from "./config.js";
import type { SuggestionPromptContext, TurnStatus } from "./types.js";

const PATH_ARG_KEYS = ["path", "file_path", "filePath", "target_file", "targetFile"];

export function buildSuggestionContext(
  entries: ChatEntry[],
  status: TurnStatus,
  options?: {
    abortNote?: string;
    maxSuggestionChars?: number;
    customInstruction?: string;
    intentSeed?: string;
    recentChanged?: Array<{ suggestedPrompt: string; actualUserPrompt: string }>;
  },
): SuggestionPromptContext {
  const lastTurn = sliceLastTurn(entries);
  const latestAssistantTurn = capText(lastAssistantText(lastTurn), DEFAULT_MAX_ASSISTANT_TURN_CHARS);

  return {
    turnStatus: status,
    abortContextNote: options?.abortNote,
    latestAssistantTurn,
    recentUserPrompts: collectRecentUserPrompts(entries),
    toolSignals: collectToolSignals(lastTurn),
    touchedFiles: collectTouchedFiles(lastTurn),
    unresolvedQuestions: collectUnresolvedQuestions(latestAssistantTurn),
    recentChanged: options?.recentChanged ?? [],
    customInstruction: options?.customInstruction ?? "",
    intentSeed: options?.intentSeed ?? "none",
    maxSuggestionChars: options?.maxSuggestionChars ?? DEFAULT_MAX_SUGGESTION_CHARS,
    noSuggestionToken: NO_SUGGESTION_TOKEN,
  };
}

export function sliceLastTurn(entries: ChatEntry[]): ChatEntry[] {
  let lastUser = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.type === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return entries.slice(-20);
  return entries.slice(lastUser);
}

function collectRecentUserPrompts(entries: ChatEntry[]): string[] {
  const prompts: string[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "user") continue;
    const text = capText(entry.content, DEFAULT_MAX_RECENT_USER_PROMPT_CHARS);
    if (text) prompts.push(text);
    if (prompts.length >= DEFAULT_MAX_RECENT_USER_PROMPTS) break;
  }
  return prompts.reverse();
}

function lastAssistantText(entries: ChatEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "assistant" && entry.content.trim()) return entry.content;
  }
  return "";
}

function collectToolSignals(entries: ChatEntry[]): string[] {
  const signals: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "tool_result") continue;
    const name = entry.toolCall?.function.name || "tool";
    const ok = entry.toolResult?.success !== false;
    const detail = capText(
      ok ? (entry.toolResult?.output ?? entry.content) : (entry.toolResult?.error ?? entry.content),
      160,
    );
    const signal = capText(
      `${name}: ${ok ? "ok" : "error"}${detail ? ` — ${detail}` : ""}`,
      DEFAULT_MAX_TOOL_SIGNAL_CHARS,
    );
    if (signal) signals.push(signal);
    if (signals.length >= DEFAULT_MAX_TOOL_SIGNALS) break;
  }
  return signals;
}

function collectTouchedFiles(entries: ChatEntry[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | undefined) => {
    const path = value?.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    files.push(path);
  };

  for (const entry of entries) {
    if (entry.type !== "tool_result") continue;
    add(entry.toolResult?.diff?.filePath);
    addPathsFromToolCall(entry.toolCall, add);
    if (files.length >= DEFAULT_MAX_TOUCHED_FILES) break;
  }
  return files.slice(0, DEFAULT_MAX_TOUCHED_FILES);
}

function addPathsFromToolCall(toolCall: ToolCall | undefined, add: (value: string | undefined) => void): void {
  if (!toolCall) return;
  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    for (const key of PATH_ARG_KEYS) {
      const value = args[key];
      if (typeof value === "string") add(value);
    }
  } catch {
    /* ignore malformed tool args */
  }
}

function collectUnresolvedQuestions(text: string): string[] {
  if (!text) return [];
  const questions: string[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "");
    if (!line.includes("?") || line.length < 8 || line.startsWith("```")) continue;
    questions.push(capText(line, 200));
    if (questions.length >= DEFAULT_MAX_UNRESOLVED_QUESTIONS) break;
  }
  return questions;
}

function capText(value: string | undefined, max: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd();
}
