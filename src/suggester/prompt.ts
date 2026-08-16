// Adapted from pi-prompt-suggester (MIT)
// Copyright (c) 2026 Guido Witt-Dörring
// https://github.com/guwidoe/pi-prompt-suggester

import type { SuggestionPromptContext } from "./types.js";

export function renderSuggestionPrompt(context: SuggestionPromptContext): string {
  return `Next user message only. No explanation. If none, return ${context.noSuggestionToken}. Max ${context.maxSuggestionChars} chars. Prefer Yes./Go ahead. when the assistant offered a next step.

Status: ${context.turnStatus}
Abort: ${context.abortContextNote ?? "(none)"}
Intent: ${context.intentSeed}
Recent: ${context.recentUserPrompts.length > 0 ? context.recentUserPrompts.map((prompt) => `- ${prompt}`).join(" | ") : "(none)"}
Tools: ${context.toolSignals.length > 0 ? context.toolSignals.join(" | ") : "(none)"}
Files: ${context.touchedFiles.length > 0 ? context.touchedFiles.join(", ") : "(none)"}
Questions: ${context.unresolvedQuestions.length > 0 ? context.unresolvedQuestions.join(" | ") : "(none)"}
${renderChangedExamples(context.recentChanged)}
${context.customInstruction.trim() ? `Pref: ${context.customInstruction.trim()}\n` : ""}Assistant:
${context.latestAssistantTurn || "(empty)"}`;
}

function renderChangedExamples(examples: Array<{ suggestedPrompt: string; actualUserPrompt: string }>): string {
  if (examples.length === 0) return "RecentUserCorrections:\n(none)";
  return `RecentUserCorrections:\n${examples
    .map(
      (example) =>
        `- instead of ${JSON.stringify(example.suggestedPrompt)}\n  the user wrote: ${JSON.stringify(example.actualUserPrompt)}`,
    )
    .join("\n")}`;
}
