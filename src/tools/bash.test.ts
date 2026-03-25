import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalPlatform = process.platform;
const originalArch = process.arch;
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function importBashModule(
  options: { execMock?: ReturnType<typeof vi.fn>; spawnMock?: ReturnType<typeof vi.fn> } = {},
) {
  vi.resetModules();
  vi.doUnmock("child_process");

  if (options.execMock || options.spawnMock) {
    vi.doMock("child_process", async () => {
      const actual = await vi.importActual<typeof import("child_process")>("child_process");
      return {
        ...actual,
        exec: options.execMock ?? actual.exec,
        spawn: options.spawnMock ?? actual.spawn,
      };
    });
  }

  return import("./bash");
}

function setAppleSiliconHost(): void {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  Object.defineProperty(process, "arch", { value: "arm64", configurable: true });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  Object.defineProperty(process, "arch", { value: originalArch, configurable: true });
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("child_process");
});

describe("BashTool sandbox mode", () => {
  it("leaves host commands unchanged when sandbox is off", async () => {
    const execMock = vi.fn(
      (_command: string, _options: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        setTimeout(() => callback(null, "ok\n", ""), 0);
        return { kill: vi.fn() };
      },
    );
    const { BashTool } = await importBashModule({ execMock });
    const bash = new BashTool("/repo");

    const result = await bash.execute("echo hi");

    expect(result.success).toBe(true);
    expect(execMock).toHaveBeenCalledWith("echo hi", expect.objectContaining({ cwd: "/repo" }), expect.any(Function));
  });

  it("wraps foreground commands with shuru when sandbox is enabled", async () => {
    setAppleSiliconHost();
    const execMock = vi.fn(
      (_command: string, _options: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        setTimeout(() => callback(null, "sandboxed\n", ""), 0);
        return { kill: vi.fn() };
      },
    );
    const { BashTool } = await importBashModule({ execMock });
    const bash = new BashTool("/repo", { sandboxMode: "shuru" });

    const result = await bash.execute("echo hi");

    expect(result.success).toBe(true);
    expect(execMock).toHaveBeenCalledWith(
      "shuru run --mount '/repo:/workspace' -- sh -lc 'cd /workspace && echo hi'",
      expect.objectContaining({ cwd: "/repo" }),
      expect.any(Function),
    );
  });

  it("wraps background commands with shuru when sandbox is enabled", async () => {
    setAppleSiliconHost();
    const spawnMock = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        pid: number;
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.pid = 4321;
      return child;
    });
    const { BashTool } = await importBashModule({ spawnMock });
    const bash = new BashTool("/repo", { sandboxMode: "shuru" });

    const result = await bash.startBackground("npm run dev");

    expect(result.success).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      "sh",
      ["-c", "shuru run --mount '/repo:/workspace' -- sh -lc 'cd /workspace && npm run dev'"],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });

  it("blocks mutating git commands in sandbox mode", async () => {
    setAppleSiliconHost();
    const execMock = vi.fn();
    const { BashTool } = await importBashModule({ execMock });
    const bash = new BashTool("/repo", { sandboxMode: "shuru" });

    const result = await bash.execute("git add .");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Sandbox mode blocks git commands");
    expect(execMock).not.toHaveBeenCalled();
  });

  it("blocks mutating git commands inside compound shell expressions", async () => {
    setAppleSiliconHost();
    const execMock = vi.fn();
    const { BashTool } = await importBashModule({ execMock });
    const bash = new BashTool("/repo", { sandboxMode: "shuru" });

    const result = await bash.execute('echo foo && git commit -m "test"');

    expect(result.success).toBe(false);
    expect(result.error).toContain("Sandbox mode blocks git commands");
    expect(execMock).not.toHaveBeenCalled();
  });

  it("tracks cwd changes independently of sandbox mode", async () => {
    const { BashTool } = await importBashModule();
    const root = makeTempDir("grok-bash-test-");
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    const bash = new BashTool(root, { sandboxMode: "shuru" });

    const result = await bash.execute(`cd "${nested}"`);

    expect(result.success).toBe(true);
    expect(bash.getCwd()).toBe(nested);
  });
});
