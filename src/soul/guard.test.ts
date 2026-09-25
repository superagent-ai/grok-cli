import { describe, expect, it } from "vitest";
import { denialMessage, isProtectedEditTarget, SOUL_FILENAMES } from "./guard";

describe("soul formation guard", () => {
  it("protects the soul file and its eval artifacts", () => {
    expect(isProtectedEditTarget("SOUL.md")).toBe(true);
    expect(isProtectedEditTarget("src/SOUL.md")).toBe(true);
    expect(isProtectedEditTarget("SOUL.suite.yaml")).toBe(true);
    expect(isProtectedEditTarget("evals/SOUL.baseline.json")).toBe(true);
    expect(SOUL_FILENAMES).toEqual(["SOUL.md", "SOUL.suite.yaml", "SOUL.baseline.json"]);
  });

  it("does not protect ordinary files", () => {
    expect(isProtectedEditTarget("notes.md")).toBe(false);
    expect(isProtectedEditTarget("src/soul/guard.ts")).toBe(false);
    expect(isProtectedEditTarget("SOUL.md.bak")).toBe(false);
  });

  it("does not let a broad glob match", () => {
    expect(isProtectedEditTarget("*.md")).toBe(false);
    expect(isProtectedEditTarget("**/*.md")).toBe(false);
  });

  it("matches targeted globs", () => {
    expect(isProtectedEditTarget("**/SOUL.md")).toBe(true);
    expect(isProtectedEditTarget("**/SOUL.suite.yaml")).toBe(true);
  });

  it("explains the legitimate path in the denial", () => {
    const msg = denialMessage("SOUL.md");
    expect(msg).toContain("formation guard");
    expect(msg).toContain("SOUL.md");
    expect(msg).toContain("human edit");
  });
});
