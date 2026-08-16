// Adapted from pi-prompt-suggester (MIT)
// Copyright (c) 2026 Guido Witt-Dörring
// https://github.com/guwidoe/pi-prompt-suggester

import type { SteeringClassification, SteeringEvent } from "./types.js";

export const DEFAULT_ACCEPTED_THRESHOLD = 0.82;
export const DEFAULT_STEERING_WINDOW = 20;
export const DEFAULT_MAX_CHANGED_EXAMPLES = 3;

export function classifySteering(
  suggestedPrompt: string,
  actualUserPrompt: string,
  acceptedThreshold = DEFAULT_ACCEPTED_THRESHOLD,
): { classification: SteeringClassification; similarity: number } {
  const suggested = normalizeText(suggestedPrompt);
  const actual = normalizeText(actualUserPrompt);
  if (suggested === actual) {
    return { classification: "accepted_exact", similarity: 1 };
  }

  const similarity = (jaccard(tokenSet(suggested), tokenSet(actual)) + sequenceSimilarity(suggested, actual)) / 2;
  return {
    classification: similarity >= acceptedThreshold ? "accepted_edited" : "changed_course",
    similarity,
  };
}

export function appendSteeringEvent(
  history: SteeringEvent[],
  event: SteeringEvent,
  window = DEFAULT_STEERING_WINDOW,
): SteeringEvent[] {
  return [...history, event].slice(-window);
}

export function recentChangedExamples(
  history: SteeringEvent[],
  max = DEFAULT_MAX_CHANGED_EXAMPLES,
): Array<{ suggestedPrompt: string; actualUserPrompt: string }> {
  return history
    .filter((event) => event.classification === "changed_course")
    .slice(-max)
    .reverse()
    .map((event) => ({ suggestedPrompt: event.suggestedPrompt, actualUserPrompt: event.actualUserPrompt }));
}

export function isRepeatedRejected(suggestion: string, history: SteeringEvent[]): boolean {
  const normalized = normalizeText(suggestion);
  return history.some(
    (event) => event.classification === "changed_course" && normalizeText(event.suggestedPrompt) === normalized,
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(/[^a-z0-9]+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function lcsLength(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i]![j] =
        a[i - 1] === b[j - 1] ? (dp[i - 1]![j - 1] ?? 0) + 1 : Math.max(dp[i - 1]![j] ?? 0, dp[i]![j - 1] ?? 0);
    }
  }
  return dp[a.length]![b.length] ?? 0;
}

function sequenceSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const lcs = lcsLength(a, b);
  return (2 * lcs) / Math.max(1, a.length + b.length);
}
