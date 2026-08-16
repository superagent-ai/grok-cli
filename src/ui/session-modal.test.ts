import { describe, expect, it } from "vitest";
import type { SessionInfo } from "../types/index";
import { buildSessionBrowseRows, formatSessionRowTitle, formatSessionUpdatedAt } from "./session-modal";

function session(partial: Partial<SessionInfo> & Pick<SessionInfo, "id">): SessionInfo {
  return {
    workspaceId: "ws",
    title: null,
    recap: null,
    model: "grok-4.3",
    mode: "agent",
    cwdAtStart: "/tmp",
    cwdLast: "/tmp",
    status: "active",
    createdAt: new Date("2026-04-22T15:00:00.000Z"),
    updatedAt: new Date("2026-04-22T15:00:00.000Z"),
    ...partial,
  };
}

describe("session picker rows", () => {
  it("filters by title, id, recap, model, and mode", () => {
    const sessions = [
      session({ id: "aaa111", title: "Billing recap", mode: "plan" }),
      session({
        id: "bbb222",
        title: "Sandbox work",
        recap: { text: "Need to restore the sandbox flags", model: null, updatedAt: null },
      }),
      session({ id: "ccc333", model: "grok-4.20-non-reasoning" }),
    ];

    expect(buildSessionBrowseRows(sessions, "billing").map((row) => row.session.id)).toEqual(["aaa111"]);
    expect(buildSessionBrowseRows(sessions, "bbb").map((row) => row.session.id)).toEqual(["bbb222"]);
    expect(buildSessionBrowseRows(sessions, "sandbox flags").map((row) => row.session.id)).toEqual(["bbb222"]);
    expect(buildSessionBrowseRows(sessions, "4.20").map((row) => row.session.id)).toEqual(["ccc333"]);
    expect(buildSessionBrowseRows(sessions, "plan").map((row) => row.session.id)).toEqual(["aaa111"]);
  });

  it("falls back to Untitled when a session has no title", () => {
    expect(formatSessionRowTitle(session({ id: "plain" }))).toBe("Untitled");
  });

  it("formats relative update times", () => {
    const now = new Date("2026-04-22T16:00:00.000Z");
    expect(formatSessionUpdatedAt(new Date("2026-04-22T15:59:30.000Z"), now)).toBe("just now");
    expect(formatSessionUpdatedAt(new Date("2026-04-22T15:10:00.000Z"), now)).toBe("50m ago");
    expect(formatSessionUpdatedAt(new Date("2026-04-22T13:00:00.000Z"), now)).toBe("3h ago");
    expect(formatSessionUpdatedAt(new Date("2026-04-20T16:00:00.000Z"), now)).toBe("2d ago");
  });
});
