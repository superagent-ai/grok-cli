import { type ChildProcess, exec, spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdtemp, rm, stat, unlink } from "fs/promises";
import os from "os";
import path from "path";
import { executeEventHooks } from "../hooks/index";
import type { CwdChangedHookInput } from "../hooks/types";
import type { ToolResult } from "../types/index";
import { findGitRoot } from "../utils/git-root";
import type { SandboxMode, SandboxSettings } from "../utils/settings";

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
  sandboxSettings?: SandboxSettings;
}

let nextBgId = 1;

export class BashTool {
  private cwd: string;
  private bgProcesses = new Map<number, BackgroundProcess>();
  private tmpDir: string | null = null;
  private sandboxMode: SandboxMode;
  private sandboxSettings: SandboxSettings;

  constructor(initialCwd = process.cwd(), options: BashToolOptions = {}) {
    this.cwd = initialCwd;
    this.sandboxMode = options.sandboxMode ?? "off";
    this.sandboxSettings = options.sandboxSettings ?? {};
  }

  private async ensureTmpDir(): Promise<string> {
    if (!this.tmpDir) {
      this.tmpDir = await mkdtemp(path.join(os.tmpdir(), "grok-bg-"));
    }
    return this.tmpDir;
  }

  async execute(command: string, timeout = 30_000, abortSignal?: AbortSignal): Promise<ToolResult> {
    try {
      const cdTarget = getSimpleCdCommandTarget(command);
      if (cdTarget !== null) {
        try {
          const nextCwd = path.resolve(this.cwd, cdTarget);
          const info = await stat(nextCwd);
          if (!info.isDirectory()) {
            return { success: false, error: `Cannot change directory: ${nextCwd} is not a directory` };
          }
          const oldCwd = this.cwd;
          this.cwd = nextCwd;

          const cwdInput: CwdChangedHookInput = {
            hook_event_name: "CwdChanged",
            old_cwd: oldCwd,
            new_cwd: nextCwd,
            cwd: nextCwd,
          };
          executeEventHooks(cwdInput, nextCwd).catch(() => {});

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

      const gitRepositoryError = getGitInspectionRepositoryError(command, this.cwd);
      if (gitRepositoryError) {
        return { success: false, error: gitRepositoryError };
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
              const gitRepositoryRuntimeError = getGitRepositoryRuntimeError(command, output, this.cwd);
              if (gitRepositoryRuntimeError) {
                finish({ success: false, error: gitRepositoryRuntimeError });
                return;
              }
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
        const gitRepositoryRuntimeError = getGitRepositoryRuntimeError(command, output, this.cwd);
        if (gitRepositoryRuntimeError) {
          return { success: false, error: gitRepositoryRuntimeError };
        }
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

  getSandboxSettings(): SandboxSettings {
    return this.sandboxSettings;
  }

  setSandboxSettings(settings: SandboxSettings): void {
    this.sandboxSettings = settings;
  }

  getToolDescription(): string {
    if (this.sandboxMode === "shuru") {
      const s = this.sandboxSettings;
      const netStatus = s.allowNet
        ? s.allowedHosts?.length
          ? `network is restricted to: ${s.allowedHosts.join(", ")}`
          : "network access is enabled"
        : "network is disabled";
      const hostBrowserNote = s.hostBrowserCommandsOnHost
        ? " Commands that invoke agent-browser run on the host instead of inside Shuru so they can interact with forwarded localhost services."
        : "";
      return `Execute a bash command inside a Shuru sandbox. Use for find, ls, git inspection, build tools, test runners, and other shell commands that should stay isolated. For content search, prefer the dedicated grep tool. The current workspace is mounted inside the sandbox at /workspace, ${netStatus}, and shell-side workspace file changes do not persist back to the host in this version, so prefer the dedicated file tools for durable edits.${hostBrowserNote} Set background=true for long-running processes like dev servers or watchers.`;
    }
    return "Execute a bash command. Use for find, ls, git, build tools, package managers, running tests, and any other shell command. For content search, prefer the dedicated grep tool. Set background=true for long-running processes like dev servers, watchers, or anything that should keep running while you continue working. For file read/write/edit, prefer the dedicated file tools instead.";
  }

  private prepareCommand(command: string): { ok: true; command: string } | { ok: false; error: string } {
    if (this.sandboxMode !== "shuru") {
      return { ok: true, command };
    }
    if (shouldRunOnHostInSandboxMode(command, this.sandboxSettings)) {
      return { ok: true, command: wrapHostBrowserCommand(command) };
    }
    const unsupportedReason = getSandboxUnsupportedReason();
    if (unsupportedReason) {
      return { ok: false, error: unsupportedReason };
    }
    const blockedReason = getSandboxMutationBlockReason(command, this.sandboxSettings);
    if (blockedReason) {
      return { ok: false, error: blockedReason };
    }
    return { ok: true, command: wrapCommandForShuru(this.cwd, command, this.sandboxSettings) };
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

export function wrapCommandForShuru(cwd: string, command: string, settings: SandboxSettings = {}): string {
  const parts: string[] = ["shuru", "run"];

  if (settings.cpus) parts.push("--cpus", String(settings.cpus));
  if (settings.memory) parts.push("--memory", String(settings.memory));
  if (settings.diskSize) parts.push("--disk-size", String(settings.diskSize));
  if (settings.allowNet) parts.push("--allow-net");
  if (settings.allowedHosts) {
    for (const host of settings.allowedHosts) parts.push("--allow-host", host);
  }
  if (settings.ports) {
    for (const port of settings.ports) parts.push("-p", port);
  }
  if (settings.secrets) {
    for (const s of settings.secrets) {
      parts.push("--secret", `${s.name}=${s.fromEnv}@${s.hosts.join(",")}`);
    }
  }
  if (settings.from) parts.push("--from", settings.from);

  const mountArg = `${cwd}:/workspace`;
  parts.push("--mount", shellQuote(mountArg));
  const shellInit = buildShellInitScript(settings);
  const guestPrelude = buildGuestWorkspacePrelude(settings);
  const guestSteps = [
    shellInit,
    guestPrelude,
    `cd ${shellPathForScript(settings.guestWorkdir || "/workspace")}`,
    command,
  ].filter(Boolean);
  const guestCommand = guestSteps.join(" && ");
  parts.push("--", "sh", "-lc", shellQuote(guestCommand));
  return parts.join(" ");
}

const HOST_SAFE_SEGMENT_RE =
  /^\s*(?:(?:npx(?:\s+-y)?|bunx)\s+)?agent-browser\b|^\s*mkdir\s|^\s*sleep\s|^\s*echo\s|^\s*true\s*$|^\s*$/;

export function shouldRunOnHostInSandboxMode(command: string, settings: SandboxSettings = {}): boolean {
  if (!settings.hostBrowserCommandsOnHost) {
    return false;
  }
  if (!/\bagent-browser\b/.test(command)) {
    return false;
  }
  if (/\$\(|`/.test(command)) {
    return false;
  }
  const segments = command.split(/\s*(?:&&|\|\||;|\|[^|]|>>?)\s*/);
  return segments.every((segment) => HOST_SAFE_SEGMENT_RE.test(segment));
}

export function wrapHostBrowserCommand(command: string): string {
  const normalized = command
    .replace(/\bbunx\s+agent-browser\b/g, "__grok_ab")
    .replace(/\bnpx(?:\s+-y)?\s+agent-browser\b/g, "__grok_ab")
    .replace(/\bagent-browser\b/g, "__grok_ab");
  return [
    "__grok_ab() {",
    "  if command -v agent-browser >/dev/null 2>&1; then",
    '    command agent-browser "$@"',
    "  elif command -v bunx >/dev/null 2>&1; then",
    '    bunx agent-browser "$@"',
    "  elif command -v npx >/dev/null 2>&1; then",
    '    npx -y agent-browser "$@"',
    "  else",
    '    echo "agent-browser: not found (no bunx/npx fallback)" >&2',
    "    return 127",
    "  fi",
    "}",
    normalized,
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellPathForScript(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : shellQuote(value);
}

function buildGuestWorkspacePrelude(settings: SandboxSettings): string {
  if (!settings.guestWorkdir || !settings.syncHostWorkspace) {
    return "";
  }

  const guest = shellQuote(settings.guestWorkdir);
  const exclusions = [
    ".git",
    "node_modules",
    ".venv",
    ".next",
    "dist",
    "build",
    "target",
    ".pytest_cache",
    ".mypy_cache",
  ];
  const tarExcludes = exclusions.map((entry) => `--exclude=${shellQuote(entry)}`).join(" ");
  return [
    `mkdir -p ${guest}`,
    `find ${guest} -mindepth 1 -maxdepth 1 ${exclusions
      .map((entry) => `! -name ${shellQuote(entry)}`)
      .join(" ")} -exec rm -rf {} + 2>/dev/null || true`,
    `tar -C /workspace ${tarExcludes} -cf - . | tar -C ${guest} -xf -`,
  ].join(" && ");
}

function buildShellInitScript(settings: SandboxSettings): string {
  return (settings.shellInit ?? []).filter(Boolean).join(" && ");
}

function getSandboxUnsupportedReason(): string | null {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return "Shuru sandbox mode currently requires macOS on Apple Silicon.";
  }
  return null;
}

const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "rev-parse", "grep", "ls-files"]);

interface ShellWord {
  type: "word";
  value: string;
}

interface ShellOperator {
  type: "operator";
  value: string;
}

type ShellToken = ShellWord | ShellOperator;

interface GitInvocation {
  subcommand: string;
  cwd: string;
  explicitGitDir: boolean;
}

export function getGitInspectionRepositoryError(command: string, cwd: string): string | null {
  const inspection = findReadOnlyGitInspection(command, cwd);
  if (!inspection) return null;
  if (inspection.explicitGitDir) return null;
  if (findGitRoot(inspection.cwd)) return null;

  return formatGitRepositoryError(inspection.cwd);
}

export function getGitRepositoryRuntimeError(command: string, output: string, cwd: string): string | null {
  const inspection = findReadOnlyGitInspection(command, cwd);
  if (!inspection) return null;
  if (!/fatal:\s+not a git repository/i.test(output)) return null;
  return formatGitRepositoryError(inspection.cwd);
}

function findReadOnlyGitInspection(command: string, cwd: string): GitInvocation | null {
  return findGitInvocation(command, cwd, (subcommand) => READ_ONLY_GIT_SUBCOMMANDS.has(subcommand));
}

function findGitInvocation(
  command: string,
  cwd: string,
  subcommandMatches: (subcommand: string) => boolean,
  depth = 0,
): GitInvocation | null {
  if (depth > 3) return null;

  let effectiveCwd = cwd;
  const tokens = tokenizeShell(command);

  for (const segment of splitShellSegments(tokens)) {
    const words = segment.filter((token): token is ShellWord => token.type === "word").map((token) => token.value);
    if (words.length === 0) continue;

    const shellCommand = extractShellCommandString(words);
    if (shellCommand !== null) {
      const nested = findGitInvocation(shellCommand, effectiveCwd, subcommandMatches, depth + 1);
      if (nested) return nested;
      continue;
    }

    const cdTarget = getSimpleCdTarget(words);
    if (cdTarget !== null) {
      effectiveCwd = resolveShellPath(effectiveCwd, cdTarget);
      continue;
    }

    const commandIndex = getShellCommandIndex(words);
    if (commandIndex === null || !isGitExecutable(words[commandIndex])) continue;

    const invocation = parseGitInvocation(words.slice(commandIndex + 1), effectiveCwd);
    if (invocation && subcommandMatches(invocation.subcommand)) return invocation;
  }

  return null;
}

function tokenizeShell(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  const pushWord = () => {
    if (current.length > 0) {
      tokens.push({ type: "word", value: current });
      current = "";
    }
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === "\\" && i + 1 < command.length) {
        current += command[++i];
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "\\" && i + 1 < command.length) {
      current += command[++i];
      continue;
    }

    if (/\s/.test(char)) {
      pushWord();
      continue;
    }

    const next = command[i + 1];
    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushWord();
      tokens.push({ type: "operator", value: `${char}${next}` });
      i++;
      continue;
    }

    if (char === ";" || char === "|") {
      pushWord();
      tokens.push({ type: "operator", value: char });
      continue;
    }

    current += char;
  }

  pushWord();
  return tokens;
}

function splitShellSegments(tokens: ShellToken[]): ShellToken[][] {
  const segments: ShellToken[][] = [];
  let current: ShellToken[] = [];

  for (const token of tokens) {
    if (token.type === "operator") {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push(token);
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

function extractShellCommandString(words: string[]): string | null {
  const command = path.basename(words[0] ?? "");
  if (command !== "sh" && command !== "bash" && command !== "zsh") return null;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (isShellCommandOption(word)) {
      return words[i + 1] ?? null;
    }
  }

  return null;
}

function isShellCommandOption(word: string): boolean {
  if (word === "-c") return true;
  if (!word.startsWith("-") || word.startsWith("--")) return false;
  return word.slice(1).includes("c");
}

function getSimpleCdTarget(words: string[]): string | null {
  if (words[0] !== "cd") return null;
  if (words.length > 2) return null;
  const target = words[1] ?? os.homedir();
  if (target.includes("$") || target.includes("*") || target.includes("?")) return null;
  return target;
}

function getShellCommandIndex(words: string[]): number | null {
  let index = 0;

  index = skipEnvAssignments(words, index);

  if (words[index] === "env") {
    index = skipEnvCommandPrefix(words, index + 1);
  }

  index = skipEnvAssignments(words, index);

  if (words[index] === "command") {
    index++;
    index = skipEnvAssignments(words, index);
  }

  return index < words.length ? index : null;
}

function skipEnvAssignments(words: string[], start: number): number {
  let index = start;
  while (index < words.length && isEnvAssignment(words[index])) index++;
  return index;
}

function skipEnvCommandPrefix(words: string[], start: number): number {
  let index = start;

  while (index < words.length) {
    const word = words[index];

    if (word === "--") {
      return index + 1;
    }

    if (isEnvAssignment(word)) {
      index++;
      continue;
    }

    if (word === "-i" || word === "-0" || word === "--ignore-environment" || word === "--null") {
      index++;
      continue;
    }

    if (word === "-u" || word === "--unset" || word === "-C" || word === "--chdir") {
      index += 2;
      continue;
    }

    if (word.startsWith("--unset=") || word.startsWith("--chdir=")) {
      index++;
      continue;
    }

    if (word.startsWith("-")) {
      index++;
      continue;
    }

    return index;
  }

  return index;
}

function isEnvAssignment(word: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/u.test(word);
}

function isGitExecutable(word: string): boolean {
  return path.basename(word) === "git";
}

function parseGitInvocation(words: string[], cwd: string): GitInvocation | null {
  let index = 0;
  let effectiveCwd = cwd;
  let explicitGitDir = false;

  while (index < words.length) {
    const word = words[index];

    if (word === "-C") {
      const target = words[index + 1];
      if (!target) return null;
      effectiveCwd = resolveShellPath(effectiveCwd, target);
      index += 2;
      continue;
    }

    if (word.startsWith("-C") && word.length > 2) {
      effectiveCwd = resolveShellPath(effectiveCwd, word.slice(2));
      index++;
      continue;
    }

    if (word === "-c") {
      index += 2;
      continue;
    }

    if (word.startsWith("-c") && word.includes("=")) {
      index++;
      continue;
    }

    if (word === "--git-dir") {
      explicitGitDir = true;
      index += 2;
      continue;
    }

    if (word.startsWith("--git-dir=")) {
      explicitGitDir = true;
      index++;
      continue;
    }

    if (word === "--work-tree") {
      const target = words[index + 1];
      if (!target) return null;
      effectiveCwd = resolveShellPath(effectiveCwd, target);
      index += 2;
      continue;
    }

    if (word.startsWith("--work-tree=")) {
      effectiveCwd = resolveShellPath(effectiveCwd, word.slice("--work-tree=".length));
      index++;
      continue;
    }

    if (word.startsWith("--")) {
      index++;
      continue;
    }

    if (word.startsWith("-")) {
      index++;
      continue;
    }

    return { subcommand: word, cwd: effectiveCwd, explicitGitDir };
  }

  return null;
}

function resolveShellPath(cwd: string, target: string): string {
  if (target === "~") return os.homedir();
  if (target.startsWith("~/")) return path.join(os.homedir(), target.slice(2));
  return path.resolve(cwd, target);
}

function getSimpleCdCommandTarget(command: string): string | null {
  const tokens = tokenizeShell(command);
  if (tokens.some((token) => token.type === "operator")) return null;
  const words = tokens.filter((token): token is ShellWord => token.type === "word").map((token) => token.value);
  return getSimpleCdTarget(words);
}

function formatGitRepositoryError(cwd: string): string {
  return [
    `Not a git repository: ${cwd}`,
    "This git inspection command needs a repository checkout. Change into the repo root or a subdirectory before running git status, diff, log, show, rev-parse, grep, or ls-files.",
  ].join("\n");
}

export function getSandboxMutationBlockReason(command: string, settings: SandboxSettings = {}): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const gitInvocation = findGitInvocation(trimmed, process.cwd(), () => true);
  if (gitInvocation && !READ_ONLY_GIT_SUBCOMMANDS.has(gitInvocation.subcommand)) {
    return [
      "Sandbox mode blocks git commands that mutate repository state because Shuru guest-side workspace changes do not persist back to the host.",
      "Disable sandbox mode to run persistent git mutations on the real workspace.",
    ].join(" ");
  }

  const blockedPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern:
        /\b(?:prettier\s+--write|eslint\b.*--fix|biome\s+check\b.*--write|ruff\s+check\b.*--fix|gofmt\s+-w|rustfmt\b|clang-format\b.*-i)\b/,
      reason:
        "Shell-driven formatters that rewrite files are blocked in sandbox mode because those file changes would not persist back to the host workspace.",
    },
  ];

  if (!settings.allowEphemeralInstall) {
    const installPatterns: Array<{ pattern: RegExp; reason: string }> = [
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
    ];
    const installMatch = installPatterns.find(({ pattern }) => pattern.test(trimmed));
    if (installMatch) {
      return `${installMatch.reason} Use read_file/edit_file/write_file for durable edits, or disable sandbox mode for host-persistent shell changes.`;
    }
  }

  const matched = blockedPatterns.find(({ pattern }) => pattern.test(trimmed));
  if (!matched) return null;
  return `${matched.reason} Use read_file/edit_file/write_file for durable edits, or disable sandbox mode for host-persistent shell changes.`;
}
