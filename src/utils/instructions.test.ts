import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeValidGitDir(root: string): void {
  fs.mkdirSync(path.join(root, ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(root, ".git", "refs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
}

async function importLoadCustomInstructions(mockedHome?: string) {
  vi.resetModules();
  vi.doUnmock("os");

  if (mockedHome) {
    process.env.HOME = mockedHome;
    vi.doMock("os", async () => {
      const actual = await vi.importActual<typeof import("os")>("os");
      return {
        ...actual,
        homedir: () => mockedHome,
      };
    });
  }

  const mod = await import("./instructions");
  return mod.loadCustomInstructions;
}

const originalHome = process.env.HOME;

describe("loadCustomInstructions", () => {
  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("os");
  });

  it("returns null when no instruction files exist", async () => {
    const home = makeTempDir("grok-home-");
    const cwd = makeTempDir("grok-cwd-");
    const loadCustomInstructions = await importLoadCustomInstructions(home);

    expect(loadCustomInstructions(cwd)).toBeNull();
  });

  it("loads global plus repo-chain AGENTS files in order", async () => {
    const home = makeTempDir("grok-home-");
    const repoRoot = makeTempDir("grok-repo-");
    const cwd = path.join(repoRoot, "pkg", "feature");
    writeValidGitDir(repoRoot);
    fs.mkdirSync(cwd, { recursive: true });

    writeFile(path.join(home, ".grok", "AGENTS.md"), "global instructions");
    writeFile(path.join(repoRoot, "AGENTS.md"), "root instructions");
    writeFile(path.join(repoRoot, "pkg", "AGENTS.md"), "pkg instructions");
    writeFile(path.join(repoRoot, "pkg", "feature", "AGENTS.md"), "feature instructions");
    const loadCustomInstructions = await importLoadCustomInstructions(home);

    expect(loadCustomInstructions(cwd)).toBe(
      ["global instructions", "root instructions", "pkg instructions", "feature instructions"].join("\n\n"),
    );
  });

  it("prefers AGENTS.override.md over AGENTS.md in the same directory", async () => {
    const home = makeTempDir("grok-home-");
    const repoRoot = makeTempDir("grok-repo-");
    const cwd = path.join(repoRoot, "nested");
    writeValidGitDir(repoRoot);
    fs.mkdirSync(cwd, { recursive: true });

    writeFile(path.join(repoRoot, "AGENTS.md"), "root instructions");
    writeFile(path.join(repoRoot, "nested", "AGENTS.md"), "nested base instructions");
    writeFile(path.join(repoRoot, "nested", "AGENTS.override.md"), "nested override instructions");
    const loadCustomInstructions = await importLoadCustomInstructions(home);

    expect(loadCustomInstructions(cwd)).toBe(["root instructions", "nested override instructions"].join("\n\n"));
  });
});
