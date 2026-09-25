import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { editFile, writeFile } from "./file";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function freshCwd(): string {
  dir = mkdtempSync(join(tmpdir(), "grok-soul-guard-"));
  return dir;
}

describe("file tools: soul formation guard", () => {
  it("denies the agent writing SOUL.md", async () => {
    const result = await writeFile("SOUL.md", "new axioms", freshCwd());
    expect(result.success).toBe(false);
    expect(result.output).toContain("formation guard");
    expect(result.output).toContain("human edit");
  });

  it("denies the agent editing the suite and baseline from any subdirectory", async () => {
    const cwd = freshCwd();
    const suite = await editFile("evals/SOUL.suite.yaml", "a", "b", cwd);
    expect(suite.success).toBe(false);
    expect(suite.output).toContain("formation guard");
    const baseline = await writeFile("SOUL.baseline.json", "{}", cwd);
    expect(baseline.success).toBe(false);
  });

  it("still allows ordinary file edits", async () => {
    const cwd = freshCwd();
    const created = await writeFile("notes.md", "hello", cwd);
    expect(created.success).toBe(true);
    const edited = await editFile("notes.md", "hello", "world", cwd);
    expect(edited.success).toBe(true);
  });
});
