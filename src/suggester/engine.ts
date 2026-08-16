import { NO_SUGGESTION_TOKEN } from "./config.js";
import type { SuggestionResult, TurnStatus } from "./types.js";

export function shouldFastPathContinue(status: TurnStatus, enabled: boolean): boolean {
  return enabled && status !== "success";
}

export function normalizeSuggestion(
  value: string,
  maxChars: number,
  noSuggestionToken = NO_SUGGESTION_TOKEN,
): string | null {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized || normalized === noSuggestionToken) return null;
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).trimEnd() || null;
}

export function finalizeSuggestionResult(
  raw: SuggestionResult,
  maxChars: number,
  noSuggestionToken = NO_SUGGESTION_TOKEN,
): SuggestionResult {
  const text = normalizeSuggestion(raw.text, maxChars, noSuggestionToken);
  if (!text) {
    return {
      kind: "no_suggestion",
      text: noSuggestionToken,
      usage: raw.usage,
      modelId: raw.modelId,
    };
  }
  return {
    kind: "suggestion",
    text,
    usage: raw.usage,
    modelId: raw.modelId,
  };
}

export function fastPathContinueResult(): SuggestionResult {
  return { kind: "suggestion", text: "continue" };
}
