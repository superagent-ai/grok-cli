import type { GhostAcceptKey } from "./types.js";

export interface GhostKeyLike {
  name?: string;
  sequence?: string;
}

export function isGhostAcceptKey(key: GhostKeyLike, acceptKeys: readonly GhostAcceptKey[]): boolean {
  for (const acceptKey of acceptKeys) {
    if (acceptKey === "space" && isSpaceKey(key)) return true;
    if (acceptKey === "right" && isRightKey(key)) return true;
  }
  return false;
}

export function isSpaceKey(key: GhostKeyLike): boolean {
  return key.name === "space" || key.sequence === " ";
}

export function isRightKey(key: GhostKeyLike): boolean {
  return key.name === "right" || key.name === "rightarrow";
}
