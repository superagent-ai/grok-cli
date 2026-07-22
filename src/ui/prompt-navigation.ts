export type PromptSourceEntry = {
  role?: string;
  type?: string;
};

export type PromptNavigationDirection = "previous" | "next";

export type PromptNavigationKey = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  shift?: boolean;
  option?: boolean;
  meta?: boolean;
  super?: boolean;
};

export interface PromptAnchor {
  messageIndex: number;
  offset: number;
}

/**
 * Map terminal-safe control-letter events to navigation actions. Control
 * letters have unambiguous single-byte encodings and cannot be consumed as
 * ordinary arrow movement by a focused textarea or scrollbox.
 */
export function getPromptNavigationDirection(key: PromptNavigationKey): PromptNavigationDirection | null {
  if (key.ctrl && !key.shift && !key.option && !key.meta && !key.super) {
    if (key.name === "p") return "previous";
    if (key.name === "n") return "next";
  }
  return null;
}

/**
 * Chat entries are derived from transcript messages. Keep prompt navigation
 * derived from those entries so it cannot drift into a second message index.
 */
export function deriveUserPromptIndex(entries: readonly PromptSourceEntry[]): number[] {
  return entries.flatMap((entry, index) => (entry.role === "user" || entry.type === "user" ? [index] : []));
}

/**
 * Find the closest prompt strictly before or after the current scroll top.
 * Strict comparisons make a prompt already at the top count as the current
 * prompt, so navigation never wraps at either boundary.
 */
export function findNearestPrompt(
  anchors: readonly PromptAnchor[],
  currentScrollTop: number,
  direction: PromptNavigationDirection,
): PromptAnchor | null {
  if (direction === "previous") {
    for (let index = anchors.length - 1; index >= 0; index -= 1) {
      const anchor = anchors[index];
      if (anchor && anchor.offset < currentScrollTop) return anchor;
    }
    return null;
  }

  for (const anchor of anchors) {
    if (anchor.offset > currentScrollTop) return anchor;
  }
  return null;
}
