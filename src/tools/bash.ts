import { type ChildProcess, exec, spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdtemp, rm, stat, unlink } from "fs/promises";
import os from "os";
import path from "path";
import type { ToolResult } from "../types/index";
import type { SandboxMode } from "../utils/settings";

const MAX_TAIL_BYTES = 8_192;
const MAX_BACKGROUND_PROCESSES = 8;

export interface BackgroundProcess {
  id: number;
  command: string;
  pid: number;
  cwd: string;
  startedAt: Date;
  child: ChildProcess;
  logPath: string;
  alive: boolean;
  exitCode: number | null;
}

interface BashToolOptions {
  sandboxMode?: SandboxMode;
}

let nextBgId = 1;

export class BashTool {
  private cwd: string;
  private bgProcesses = new Map<number, BackgroundProcess>();
  private tmpDir: string | null = null;
  private sandboxMode: SandboxMode;

  constructor(initialCwd = process.cwd(), options: BashToolOptions = {}) {
    this.cwd = initialCwd;
    this.sandboxMode = options.sandboxMode ?? "off";
  }

  private async ensureTmpDir(): Promise<string> {
    if (!this.tmpDir) {
      this.tmpDir = await mkdtemp(path.join(os.tmpdir(), "grok-bg-"));
    }
    return this.tmpDir;
  }

  async execute(command: string, timeout = 30_000, abortSignal?: AbortSignal): Promise<ToolResult> {
    try {
      if (command.startsWith("cd ")) {
        const dir = command
          .substring(3)
          .trim()
          .replace(/^["']|["']$/g, "");
        try {
          const nextCwd = path.resolve(this.cwd, dir);
          const info = await stat(nextCwd);
          if (!info.isDirectory()) {
            return { success: false, error: `Cannot change directory: ${nextCwd} is not a directory` };
          }
          this.cwd = nextCwd;
          return { success: true, output: `Changed directory to: ${this.cwd}` };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Cannot change directory: ${msg}` };
        }
      }

      if (abortSignal?.aborted) {
        return { success: false, error: "[Cancelled]" };
      }

      const prepared = this.prepareCommand(command);
      if (!prepared.ok) {
        return { success: false, error: prepared.error };
      }

      return await new Promise<ToolResult>((resolve) => {
        let settled = false;
        let aborted = false;
        let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

        const finish = (result: ToolResult) => {
          if (settled) return;
          settled = true;
          if (forceKillTimer) clearTimeout(forceKillTimer);
          abortSignal?.removeEventListener("abort", onAbort);
          resolve(result);
        };

        const child = exec(
          prepared.command,
          {
            cwd: this.cwd,
            timeout,
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env, FORCE_COLOR: "0" },
          },
          (err, stdout, stderr) => {
            if (aborted || abortSignal?.aborted) {
              finish({ success: false, error: "[Cancelled]" });
              return;
            }

            const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : "");
            if (err) {
              const sandboxError = this.formatSandboxRuntimeError(output, err.message);
              if (sandboxError) {
                finish({ success: false, error: sandboxError });
                return;
              }
              if (output.trim()) {
                finish({ success: false, error: output.trim() });
                return;
              }
              finish({ success: false, error: `Command failed: ${err.message}` });
              return;
            }

            finish({
              success: true,
              output: output.trim() || "Command executed successfully (no output)",
            });
          },
        );

        const onAbort = () => {
          aborted = true;
          try {
            child.kill("SIGTERM");
          } catch {
            finish({ success: false, error: "[Cancelled]" });
            return;
          }

          forceKillTimer = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* already exited */
            }
          }, 1_000);
        };

        abortSignal?.addEventListener("abort", onAbort, { once: true });
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "stdout" in err) {
        const execErr = err as { stdout?: string; stderr?: string; message: string };
        const output = (execErr.stdout || "") + (execErr.stderr ? `\nSTDERR: ${execErr.stderr}` : "");
        if (output.trim()) {
          return { success: false, error: output.trim() };
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Command failed: ${msg}` };
    }
  }

  async startBackground(command: string): Promise<ToolResult> {
    const alive = [...this.bgProcesses.values()].filter((p) => p.alive);
    if (alive.length >= MAX_BACKGROUND_PROCESSES) {
      return {
        success: false,
        output: `Too many background processes (${alive.length}/${MAX_BACKGROUND_PROCESSES}). Stop one first with process_stop.`,
      };
    }

    try {
      const prepared = this.prepareCommand(command);
      if (!prepared.ok) {
        return { success: false, output: prepared.error };
      }
      const tmpDir = await this.ensureTmpDir();
      const id = nextBgId++;
      const logPath = path.join(tmpDir, `bg-${id}.log`);
      const logStream = createWriteStream(logPath, { flags: "a" });

      const child = spawn("sh", ["-c", prepared.command], {
        cwd: this.cwd,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      const entry: BackgroundProcess = {
        id,
        command,
        pid: child.pid ?? 0,
        cwd: this.cwd,
        startedAt: new Date(),
        child,
        logPath,
        alive: true,
        exitCode: null,
      };

      child.on("exit", (code) => {
        entry.alive = false;
        entry.exitCode = code;
        logStream.end();
      });

      child.on("error", () => {
        entry.alive = false;
        logStream.end();
      });

      this.bgProcesses.set(id, entry);

      return {
        success: true,
        output: [
          `Background process started (id: ${id}, pid: ${entry.pid})`,
          `Command: ${truncCmd(command, 80)}`,
          `Use process_logs(${id}) to view output, process_stop(${id}) to terminate.`,
        ].join("\n"),
        backgroundProcess: { id, pid: entry.pid, command },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to start background process: ${msg}` };
    }
  }

  async getProcessLogs(id: number, tail = 50): Promise<ToolResult> {
    const entry = this.bgProcesses.get(id);
    if (!entry) {
      return { success: false, output: `No background process with id ${id}.` };
    }

    try {
      const stats = await stat(entry.logPath);
      const start = Math.max(0, stats.size - MAX_TAIL_BYTES);

      const content = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = createReadStream(entry.logPath, { start });
        stream.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        stream.on("error", reject);
      });

      const lines = content.split("\n");
      const tailed = lines.slice(-tail).join("\n").trimEnd();
      const status = entry.alive ? "running" : `exited (code ${entry.exitCode ?? "unknown"})`;

      return {
        success: true,
        output: [
          `[Process ${id} — ${status} — pid ${entry.pid}]`,
          `[${truncCmd(entry.command, 70)}]`,
          "",
          tailed || "(no output yet)",
        ].join("\n"),
      };
    } catch {
      return {
        success: true,
        output: `[Process ${id} — ${entry.alive ? "running" : "exited"}] (no output yet)`,
      };
    }
  }

  async stopProcess(id: number): Promise<ToolResult> {
    const entry = this.bgProcesses.get(id);
    if (!entry) {
      return { success: false, output: `No background process with id ${id}.` };
    }

    if (!entry.alive) {
      return {
        success: true,
        output: `Process ${id} already exited (code ${entry.exitCode ?? "unknown"}).`,
      };
    }

    try {
      entry.child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            entry.child.kill("SIGKILL");
          } catch {
            /* already dead */
          }
          resolve();
        }, 3_000);
        entry.child.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      return {
        success: true,
        output: `Process ${id} (pid ${entry.pid}) stopped.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to stop process ${id}: ${msg}` };
    }
  }

  listProcesses(): ToolResult {
    const entries = [...this.bgProcesses.values()];
    if (entries.length === 0) {
      return { success: true, output: "No background processes." };
    }

    const lines = entries.map((entry) => {
      const status = entry.alive ? "running" : `exited(${entry.exitCode ?? "?"})`;
      const age = formatAge(entry.startedAt);
      return `${entry.id}  ${status}  pid:${entry.pid}  ${age}  ${truncCmd(entry.command, 50)}`;
    });

    return {
      success: true,
      output: ["ID  STATUS       PID    AGE     COMMAND", ...lines].join("\n"),
    };
  }

  async cleanup(): Promise<void> {
    for (const entry of this.bgProcesses.values()) {
      if (entry.alive) {
        try {
          entry.child.kill("SIGTERM");
        } catch {
          /* */
        }
      }
      try {
        await unlink(entry.logPath);
      } catch {
        /* */
      }
    }
    this.bgProcesses.clear();
    if (this.tmpDir) {
      try {
        await rm(this.tmpDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  }

  getCwd(): string {
    return this.cwd;
  }

  getSandboxMode(): SandboxMode {
    return this.sandboxMode;
  }

  setSandboxMode(mode: SandboxMode): void {
    this.sandboxMode = mode;
  }

  getToolDescription(): string {
    if (this.sandboxMode === "shuru") {
      return "Execute a bash command inside a Shuru sandbox. Use for searching (grep, rg, find), git inspection, build tools, test runners, and other shell commands that should stay isolated. The current workspace is mounted inside the sandbox at /workspace, network is disabled by default unless configured, and shell-side workspace file changes do not persist back to the host in this version, so prefer the dedicated file tools for durable edits. Set background=true for long-running processes like dev servers or watchers.";
    }
    return "Execute a bash command. Use for searching (grep, rg, find), git, build tools, package managers, running tests, and any other shell command. Set background=true for long-running processes like dev servers, watchers, or anything that should keep running while you continue working. For file read/write/edit, prefer the dedicated file tools instead.";
  }

  private prepareCommand(command: string): { ok: true; command: string } | { ok: false; error: string } {
    if (this.sandboxMode !== "shuru") {
      return { ok: true, command };
    }
    const unsupportedReason = getSandboxUnsupportedReason();
    if (unsupportedReason) {
      return { ok: false, error: unsupportedReason };
    }
    const blockedReason = getSandboxMutationBlockReason(command);
    if (blockedReason) {
      return { ok: false, error: blockedReason };
    }
    return { ok: true, command: wrapCommandForShuru(this.cwd, command) };
  }

  private formatSandboxRuntimeError(output: string, fallbackMessage: string): string | null {
    if (this.sandboxMode !== "shuru") {
      return null;
    }
    if (output.includes("shuru: command not found") || output.includes("sh: shuru: not found")) {
      return "Shuru sandbox mode is enabled, but the `shuru` CLI is not installed or not on PATH. Install Shuru or disable sandbox mode.";
    }
    if (output.includes("Apple Silicon") || fallbackMessage.includes("Apple Silicon")) {
      return "Shuru sandbox mode requires macOS on Apple Silicon.";
    }
    return null;
  }
}

function truncCmd(cmd: string, max: number): string {
  const oneLine = cmd.replace(/\n/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function formatAge(start: Date): string {
  const sec = Math.round((Date.now() - start.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h${min % 60}m`;
}

function wrapCommandForShuru(cwd: string, command: string): string {
  const mountArg = `${cwd}:/workspace`;
  const innerCommand = `cd /workspace && ${command}`;
  return `shuru run --mount ${shellQuote(mountArg)} -- sh -lc ${shellQuote(innerCommand)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getSandboxUnsupportedReason(): string | null {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return "Shuru sandbox mode currently requires macOS on Apple Silicon.";
  }
  return null;
}

function getSandboxMutationBlockReason(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  if (/\bgit\s+/.test(trimmed) && !/\bgit\s+(status|diff|log|show|rev-parse|branch|grep|ls-files)\b/.test(trimmed)) {
    return [
      "Sandbox mode blocks git commands that mutate repository state because Shuru guest-side workspace changes do not persist back to the host.",
      "Disable sandbox mode to run persistent git mutations on the real workspace.",
    ].join(" ");
  }

  const blockedPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:add|install|remove|unlink|update|upgrade)\b/,
      reason:
        "Package-manager installs are blocked in sandbox mode because workspace changes like lockfile updates would stay inside the Shuru guest overlay.",
    },
    {
      pattern: /\b(?:pip|pip3)\s+install\b|\bpoetry\s+add\b|\buv\s+add\b|\bcargo\s+add\b/,
      reason:
        "Dependency install commands are blocked in sandbox mode because resulting workspace changes would not persist back to the host.",
    },
    {
      pattern:
        /\b(?:prettier\s+--write|eslint\b.*--fix|biome\s+check\b.*--write|ruff\s+check\b.*--fix|gofmt\s+-w|rustfmt\b|clang-format\b.*-i)\b/,
      reason:
        "Shell-driven formatters that rewrite files are blocked in sandbox mode because those file changes would not persist back to the host workspace.",
    },
  ];

  const matched = blockedPatterns.find(({ pattern }) => pattern.test(trimmed));
  if (!matched) return null;
  return `${matched.reason} Use read_file/edit_file/write_file for durable edits, or disable sandbox mode for host-persistent shell changes.`;
}
