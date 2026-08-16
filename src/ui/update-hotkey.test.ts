import { describe, expect, it } from "vitest";
import { isCtrlU } from "./update-hotkey";

describe("isCtrlU", () => {
  it("matches control+u", () => {
    expect(isCtrlU({ name: "u", ctrl: true })).toBe(true);
  });

  it("ignores plain u, meta, and super", () => {
    expect(isCtrlU({ name: "u" })).toBe(false);
    expect(isCtrlU({ name: "u", ctrl: true, meta: true })).toBe(false);
    expect(isCtrlU({ name: "u", ctrl: true, super: true })).toBe(false);
  });
});
