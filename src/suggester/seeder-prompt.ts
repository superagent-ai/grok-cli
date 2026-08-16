// Adapted from pi-prompt-suggester (MIT)
// Copyright (c) 2026 Guido Witt-Dörring
// https://github.com/guwidoe/pi-prompt-suggester

import { compactSeedForPrompt, type ReseedTrigger, type SeedArtifact } from "./seed.js";

export function renderSeederSystemPrompt(): string {
  return `You are an agentic read-only repository seeder for Grok next-prompt suggestions.

You can explore using one tool call per step:
- ls {"path"?: string, "limit"?: number}
- find {"pattern": string, "path"?: string, "limit"?: number}
- grep {"pattern": string, "path"?: string, "glob"?: string, "limit"?: number}
- read {"path": string, "offset"?: number, "limit"?: number}

CRITICAL RULES:
- Read-only exploration only.
- Explicitly investigate vision, architecture, and principles/guidelines/conventions.
- If no file is found for a category, say so with found=false and a rationale.
- Multiple files per category are allowed.

Reply with STRICT JSON only (no markdown):
Tool call:
{"type":"tool","tool":"ls|find|grep|read","arguments":{},"reason":"short reason"}

Final:
{"type":"final","seed":{
  "projectIntentSummary": string,
  "objectivesSummary": string,
  "constraintsSummary": string,
  "principlesGuidelinesSummary": string,
  "implementationStatusSummary": string,
  "topObjectives": string[],
  "constraints": string[],
  "keyFiles": [{"path": string, "whyImportant": string, "category": "vision|architecture|principles_guidelines|code_entrypoint|other"}],
  "categoryFindings": {
    "vision": {"found": boolean, "rationale": string, "files": string[]},
    "architecture": {"found": boolean, "rationale": string, "files": string[]},
    "principles_guidelines": {"found": boolean, "rationale": string, "files": string[]}
  },
  "openQuestions": string[],
  "reseedNotes": string
}}

Do not return type=final until you have looked for vision, architecture, and principles sources.`;
}

export function renderSeederUserPrompt(input: {
  cwd: string;
  trigger: ReseedTrigger;
  previousSeed: SeedArtifact | null;
  step: number;
  maxSteps: number;
  history: Array<{ modelResponse: string; toolResult?: string }>;
  forceFinal?: boolean;
}): string {
  const historyText =
    input.history.length === 0
      ? "(none yet)"
      : input.history
          .map(
            (entry, index) =>
              `Step ${index + 1} model response:\n${entry.modelResponse}\n\nStep ${index + 1} tool result:\n${entry.toolResult ?? "(none)"}`,
          )
          .join("\n\n");

  return `Repository root: ${input.cwd}
Reseed reason: ${input.trigger.reason}
Changed files: ${input.trigger.changedFiles.join(", ") || "(none)"}
Step: ${input.step}/${input.maxSteps}
${input.forceFinal ? "Tool use is now DISABLED. Return exactly one STRICT JSON object with type=final.\n" : ""}
Previous seed summary:
${compactSeedForPrompt(input.previousSeed)}

Exploration history:
${historyText}

${input.forceFinal ? "Use only evidence already gathered." : "Decide the next tool call, or return type=final when you have enough evidence."}`;
}

export function extractJsonObject(text: string): unknown | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}
