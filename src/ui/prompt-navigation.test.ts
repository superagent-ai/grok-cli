import { describe, expect, it } from "vitest";
import {
  deriveUserPromptIndex,
  findNearestPrompt,
  getPromptNavigationDirection,
  type PromptAnchor,
} from "./prompt-navigation";

describe("deriveUserPromptIndex", () => {
  it("returns the positions of user chat entries from the existing entry list", () => {
    expect(
      deriveUserPromptIndex([{ type: "assistant" }, { type: "user" }, { type: "tool_result" }, { type: "user" }]),
    ).toEqual([1, 3]);
  });

  it("also recognizes transcript messages by role", () => {
    expect(deriveUserPromptIndex([{ role: "system" }, { role: "user" }, { role: "assistant" }])).toEqual([1]);
  });
});

describe("findNearestPrompt", () => {
  const anchors: PromptAnchor[] = [
    { messageIndex: 1, offset: 10 },
    { messageIndex: 4, offset: 80 },
    { messageIndex: 7, offset: 160 },
  ];

  it("finds the nearest previous prompt relative to the current scroll", () => {
    expect(findNearestPrompt(anchors, 120, "previous")).toEqual(anchors[1]);
  });

  it("finds the nearest next prompt relative to the current scroll", () => {
    expect(findNearestPrompt(anchors, 80, "next")).toEqual(anchors[2]);
  });

  it("stops at both boundaries without wrapping", () => {
    expect(findNearestPrompt(anchors, 0, "previous")).toBeNull();
    expect(findNearestPrompt(anchors, 160, "next")).toBeNull();
  });
});

describe("getPromptNavigationDirection", () => {
  it("maps the unambiguous control-letter events to navigation actions", () => {
    expect(getPromptNavigationDirection({ name: "p", ctrl: true, sequence: "\u0010" })).toBe("previous");
    expect(getPromptNavigationDirection({ name: "n", ctrl: true, sequence: "\u000e" })).toBe("next");
  });

  it("does not treat terminal control-bracket bytes or arrow events as navigation", () => {
    expect(getPromptNavigationDirection({ name: "escape", sequence: "\u001b" })).toBeNull();
    expect(getPromptNavigationDirection({ name: "\u001d", sequence: "\u001d" })).toBeNull();
    expect(getPromptNavigationDirection({ name: "up", ctrl: true })).toBeNull();
    expect(getPromptNavigationDirection({ name: "down", ctrl: true })).toBeNull();
  });
});
