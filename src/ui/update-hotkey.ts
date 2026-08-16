export function isCtrlU(key: { name?: string; ctrl?: boolean; meta?: boolean; super?: boolean }): boolean {
  return key.name === "u" && !!key.ctrl && !key.meta && !key.super;
}
