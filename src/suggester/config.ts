import { normalizeModelId } from "../grok/models.js";
import { loadUserSettings, saveUserSettings } from "../utils/settings.js";
import type { GhostAcceptKey, ResolvedSuggesterSettings, SuggesterSettings } from "./types.js";

export const DEFAULT_SUGGESTER_MODEL = "grok-3-mini";
export const DEFAULT_SEEDER_MODEL = "grok-3-mini";
export const NO_SUGGESTION_TOKEN = "[no suggestion]";
export const DEFAULT_RESEED_TURN_INTERVAL = 16;
export const DEFAULT_MAX_SUGGESTION_CHARS = 140;
export const DEFAULT_MAX_ASSISTANT_TURN_CHARS = 1_600;
export const DEFAULT_MAX_RECENT_USER_PROMPTS = 6;
export const DEFAULT_MAX_RECENT_USER_PROMPT_CHARS = 220;
export const DEFAULT_MAX_TOOL_SIGNALS = 4;
export const DEFAULT_MAX_TOOL_SIGNAL_CHARS = 140;
export const DEFAULT_MAX_TOUCHED_FILES = 5;
export const DEFAULT_MAX_UNRESOLVED_QUESTIONS = 3;

export const DEFAULT_SUGGESTER_SETTINGS: ResolvedSuggesterSettings = {
  enabled: true,
  model: DEFAULT_SUGGESTER_MODEL,
  seederModel: DEFAULT_SEEDER_MODEL,
  maxSuggestionChars: DEFAULT_MAX_SUGGESTION_CHARS,
  ghostAcceptKeys: ["space", "right"],
  fastPathContinueOnError: true,
  autoAccept: false,
  customInstruction: "",
  reseedEnabled: true,
  reseedTurnInterval: DEFAULT_RESEED_TURN_INTERVAL,
};

export function normalizeGhostAcceptKeys(value: unknown): GhostAcceptKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_SUGGESTER_SETTINGS.ghostAcceptKeys];
  const keys = value.filter((item): item is GhostAcceptKey => item === "space" || item === "right");
  return keys.length > 0 ? [...new Set(keys)] : [...DEFAULT_SUGGESTER_SETTINGS.ghostAcceptKeys];
}

export function resolveSuggesterSettings(raw?: SuggesterSettings): ResolvedSuggesterSettings {
  const maxChars =
    typeof raw?.maxSuggestionChars === "number" && Number.isFinite(raw.maxSuggestionChars)
      ? Math.max(20, Math.min(500, Math.floor(raw.maxSuggestionChars)))
      : DEFAULT_SUGGESTER_SETTINGS.maxSuggestionChars;

  return {
    enabled: raw?.enabled !== false,
    model: raw?.model ? normalizeModelId(raw.model) : DEFAULT_SUGGESTER_SETTINGS.model,
    seederModel: raw?.seederModel ? normalizeModelId(raw.seederModel) : DEFAULT_SUGGESTER_SETTINGS.seederModel,
    maxSuggestionChars: maxChars,
    ghostAcceptKeys: normalizeGhostAcceptKeys(raw?.ghostAcceptKeys),
    fastPathContinueOnError: raw?.fastPathContinueOnError !== false,
    autoAccept: raw?.autoAccept === true,
    customInstruction: typeof raw?.customInstruction === "string" ? raw.customInstruction : "",
    reseedEnabled: raw?.reseedEnabled !== false,
    reseedTurnInterval:
      typeof raw?.reseedTurnInterval === "number" && Number.isFinite(raw.reseedTurnInterval)
        ? Math.max(1, Math.min(100, Math.floor(raw.reseedTurnInterval)))
        : DEFAULT_SUGGESTER_SETTINGS.reseedTurnInterval,
  };
}

export function loadSuggesterSettings(): ResolvedSuggesterSettings {
  return resolveSuggesterSettings(loadUserSettings().suggester);
}

export function saveSuggesterSettings(partial: SuggesterSettings): ResolvedSuggesterSettings {
  const current = loadSuggesterSettings();
  const next = resolveSuggesterSettings({
    ...current,
    ...partial,
    ...(partial.ghostAcceptKeys !== undefined
      ? { ghostAcceptKeys: normalizeGhostAcceptKeys(partial.ghostAcceptKeys) }
      : {}),
  });
  saveUserSettings({
    suggester: {
      enabled: next.enabled,
      model: next.model,
      seederModel: next.seederModel,
      maxSuggestionChars: next.maxSuggestionChars,
      ghostAcceptKeys: next.ghostAcceptKeys,
      fastPathContinueOnError: next.fastPathContinueOnError,
      autoAccept: next.autoAccept,
      customInstruction: next.customInstruction,
      reseedEnabled: next.reseedEnabled,
      reseedTurnInterval: next.reseedTurnInterval,
    },
  });
  return next;
}
