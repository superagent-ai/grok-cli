import type { SeedArtifact } from "./seed.js";
import type { ResolvedSuggesterSettings, SuggesterSessionState } from "./types.js";

export function formatSuggesterStatus(
  settings: ResolvedSuggesterSettings,
  state: SuggesterSessionState,
  seed: SeedArtifact | null = null,
): string {
  const lines = [
    `Prompt suggester: ${settings.enabled ? "on" : "off"}`,
    `Fill: ${settings.autoAccept ? "auto" : "ghost"}`,
    `Suggester model: ${settings.model}`,
    `Seeder model: ${settings.seederModel}`,
    `Accept: ${settings.ghostAcceptKeys.join(", ") || "none"}`,
  ];

  if (state.lastSuggestion?.text) {
    const preview = state.lastSuggestion.text.replace(/\s+/g, " ").trim();
    lines.push(`Last suggestion: ${preview.length > 80 ? `${preview.slice(0, 77)}...` : preview}`);
  } else {
    lines.push("Last suggestion: none yet this session");
  }

  const usage = state.lastUsage;
  if (usage && (usage.totalTokens || usage.inputTokens || usage.outputTokens)) {
    lines.push(`Last call: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out (${usage.modelId})`);
  }

  if (state.suggestionUsage.calls > 0) {
    lines.push(
      `Suggester usage: ${state.suggestionUsage.calls} call${state.suggestionUsage.calls === 1 ? "" : "s"}, ${state.suggestionUsage.totalTokens} tokens`,
    );
  }
  if (state.seederUsage.calls > 0) {
    lines.push(
      `Seeder usage: ${state.seederUsage.calls} call${state.seederUsage.calls === 1 ? "" : "s"}, ${state.seederUsage.totalTokens} tokens`,
    );
  }

  if (seed) {
    const found = Object.entries(seed.categoryFindings)
      .filter(([, finding]) => finding.found)
      .map(([name]) => name)
      .join(", ");
    lines.push(`Seed: ${seed.keyFiles.length} key files${found ? ` (${found})` : ""}`);
    lines.push(`Seeded: ${seed.generatedAt}${seed.lastReseedReason ? ` via ${seed.lastReseedReason}` : ""}`);
  } else {
    lines.push("Seed: none yet");
  }

  if (settings.customInstruction.trim()) {
    const preview = settings.customInstruction.replace(/\s+/g, " ").trim();
    lines.push(`Instruction: ${preview.length > 80 ? `${preview.slice(0, 77)}...` : preview}`);
  } else {
    lines.push("Instruction: none");
  }

  const changed = state.steeringHistory.filter((event) => event.classification === "changed_course").length;
  const accepted = state.steeringHistory.length - changed;
  if (state.steeringHistory.length > 0) {
    lines.push(`Steering: ${accepted} accepted / ${changed} changed course`);
  }

  return lines.join("\n");
}
