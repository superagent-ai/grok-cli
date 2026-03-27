import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";
import { ensureVerifyCheckpoint, getVerifyCheckpointName } from "./checkpoint";
import { inferVerifyProjectProfile } from "./entrypoint";

const execFileMock = vi.mocked(execFile);
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  execFileMock.mockReset();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("verify checkpoints", () => {
  it("skips checkpoint creation when no install commands are needed", async () => {
    const dir = makeTempDir("grok-verify-ckpt-go-");
    fs.writeFileSync(path.join(dir, "go.mod"), "module example.com/demo\n");
    const profile = inferVerifyProjectProfile(dir);

    const result = await ensureVerifyCheckpoint(dir, profile, profile.sandboxSettings);
    expect(result).toEqual({ created: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("creates a deterministic checkpoint for install-based recipes", async () => {
    const dir = makeTempDir("grok-verify-ckpt-node-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { dev: "next dev" } }, null, 2),
    );
    fs.writeFileSync(path.join(dir, "package-lock.json"), "");

    execFileMock.mockImplementation((command, args, _options, callback) => {
      const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "list") {
        cb(null, "", "");
        return {} as never;
      }
      cb(null, "created", "");
      return {} as never;
    });

    const profile = inferVerifyProjectProfile(dir);
    const result = await ensureVerifyCheckpoint(dir, profile, profile.sandboxSettings);

    expect(result.created).toBe(true);
    expect(result.checkpointName).toMatch(/^verify-nextjs-/);
    expect(result.guestWorkdir).toBe("/grok/verify/worktree");
    expect(execFileMock).toHaveBeenCalledTimes(2);
    const createCall = execFileMock.mock.calls[1];
    expect(createCall[0]).toBe("shuru");
    const createArgs = createCall[1] as string[];
    expect(createArgs.slice(0, 3)).toEqual(["checkpoint", "create", result.checkpointName!]);
    expect(createArgs.join(" ")).toContain("export DEBIAN_FRONTEND=noninteractive");
    expect(createArgs.join(" ")).toContain("apt-get install -y nodejs npm");
  });

  it("includes bun shell init and bootstrap for bun-based apps", async () => {
    const dir = makeTempDir("grok-verify-ckpt-bun-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { dev: "next dev" } }, null, 2),
    );
    fs.writeFileSync(path.join(dir, "bun.lock"), "");

    execFileMock.mockImplementation((command, args, _options, callback) => {
      const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "list") {
        cb(null, "", "");
        return {} as never;
      }
      cb(null, "created", "");
      return {} as never;
    });

    const profile = inferVerifyProjectProfile(dir);
    await ensureVerifyCheckpoint(dir, profile, {
      ...profile.sandboxSettings,
      shellInit: profile.recipe.shellInitCommands,
    });

    const createArgs = execFileMock.mock.calls[1]?.[1] as string[];
    expect(createArgs.join(" ")).toContain('export PATH="$HOME/.bun/bin:$PATH"');
    expect(createArgs.join(" ")).toContain("bun.sh/install");
    expect(createArgs.join(" ")).toContain("bun install");
  });

  it("reuses an existing checkpoint when present", async () => {
    const dir = makeTempDir("grok-verify-ckpt-existing-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { dev: "next dev" } }, null, 2),
    );
    fs.writeFileSync(path.join(dir, "package-lock.json"), "");
    const profile = inferVerifyProjectProfile(dir);
    const checkpointName = getVerifyCheckpointName(dir, profile.recipe);

    execFileMock.mockImplementation((command, args, _options, callback) => {
      const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "list") {
        cb(null, `${checkpointName}\n`, "");
        return {} as never;
      }
      cb(null, "", "");
      return {} as never;
    });

    const result = await ensureVerifyCheckpoint(dir, profile, profile.sandboxSettings);

    expect(result.created).toBe(false);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it("deletes a failed checkpoint when bootstrap/install fails", async () => {
    const dir = makeTempDir("grok-verify-ckpt-fail-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }, null, 2));
    fs.writeFileSync(path.join(dir, "bun.lock"), "");
    const profile = inferVerifyProjectProfile(dir);
    const checkpointName = getVerifyCheckpointName(dir, profile.recipe);

    execFileMock.mockImplementation((command, args, _options, callback) => {
      const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "list") {
        cb(null, "", "");
        return {} as never;
      }
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "create") {
        cb(new Error("bun: not found"), "", "bun: not found");
        return {} as never;
      }
      if (Array.isArray(args) && args[0] === "checkpoint" && args[1] === "delete") {
        cb(null, "", "");
        return {} as never;
      }
      cb(null, "", "");
      return {} as never;
    });

    await expect(ensureVerifyCheckpoint(dir, profile, profile.sandboxSettings)).rejects.toThrow(
      `Verify checkpoint bootstrap failed for "${checkpointName}"`,
    );
    expect(execFileMock).toHaveBeenCalledTimes(3);
    expect(execFileMock.mock.calls[2]?.[1]).toEqual(["checkpoint", "delete", checkpointName]);
  });
});
