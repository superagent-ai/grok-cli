import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { findGitRoot } from "./git-root";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeValidGitDir(root: string): void {
  fs.mkdirSync(path.join(root, ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(root, ".git", "refs"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("findGitRoot", () => {
  it("finds a parent with a valid git directory", () => {
    const root = makeTempDir("grok-git-root-");
    const nested = path.join(root, "packages", "app");
    writeValidGitDir(root);
    fs.mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBe(root);
  });

  it("ignores empty .git directories that real git does not accept", () => {
    const root = makeTempDir("grok-empty-git-root-");
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBeNull();
  });

  it("supports worktree-style .git files", () => {
    const root = makeTempDir("grok-git-file-root-");
    const gitDir = path.join(root, ".actual-git");
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(root, ".git"), "gitdir: .actual-git\n");
    fs.mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBe(root);
  });
});
