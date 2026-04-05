import { loadProjectSettings, loadUserSettings } from "../utils/settings.js";
import type { HookCommand, HookEvent, HookMatcher, HooksConfig } from "./types.js";

/**
 * Load and merge hooks config from user (~/.grok/user-settings.json)
 * and project (.grok/settings.json) settings.
 * Project-level hooks override user-level hooks per event key.
 */
export function loadHooksConfig(): HooksConfig {
  const userHooks = loadUserSettings().hooks ?? {};
  const projectHooks = loadProjectSettings().hooks ?? {};

  const merged: HooksConfig = { ...userHooks };
  for (const [key, matchers] of Object.entries(projectHooks)) {
    if (matchers) {
      merged[key as HookEvent] = matchers;
    }
  }

  return merged;
}

/**
 * Get hooks that match a given event and optional match value.
 *
 * For events that have a matcher field (e.g. PreToolUse matches on tool_name),
 * only matchers whose `matcher` string matches `matchValue` are included,
 * plus matchers with no `matcher` (which match everything).
 */
export function getMatchingHooks(config: HooksConfig, event: HookEvent, matchValue?: string): HookCommand[] {
  const matchers = config[event];
  if (!matchers || matchers.length === 0) return [];

  const matched: HookCommand[] = [];
  for (const entry of matchers) {
    if (matchesPattern(entry, matchValue)) {
      matched.push(...entry.hooks);
    }
  }

  return matched;
}

function matchesPattern(entry: HookMatcher, matchValue?: string): boolean {
  if (!entry.matcher) return true;
  if (!matchValue) return false;
  return matchValue === entry.matcher;
}
