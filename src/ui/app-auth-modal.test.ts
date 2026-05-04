import { describe, expect, it } from "vitest";
import { getNextAuthModalError } from "./auth-modal-state";

describe("getNextAuthModalError", () => {
  it("clears stale auth errors by default", () => {
    expect(getNextAuthModalError("old error")).toBeNull();
  });

  it("preserves the current auth error for error-driven modal opens", () => {
    expect(getNextAuthModalError("Vertex authentication failed", { preserveError: true })).toBe(
      "Vertex authentication failed",
    );
  });
});
