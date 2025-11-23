import { EventEmitter } from "events";
import { ToolResult } from "../types/index.js";

// Note: node-pty is an optional dependency for PTY support
// If not available, falls back to regular child_process

let pty: any = null;
try {
  // Dynamic import to avoid crash if node-pty isn't installed
  pty = require("node-pty");
} catch {
  // node-pty not available
}

export interface InteractiveSession {
  id: string;
  command: string;
  startTime: Date;
  isRunning: boolean;
}

export interface PTYOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export class InteractiveBashTool extends EventEmitter {
  private sessions: Map<string, any> = new Map();
  private sessionCounter: number = 0;
  private isPTYAvailable: boolean;

  constructor() {
    super();
    this.isPTYAvailable = pty !== null;
  }

  isPTYSupported(): boolean {
    return this.isPTYAvailable;
  }

  async executeInteractive(
    command: string,
    options: PTYOptions = {}
  ): Promise<{ sessionId: string; output: string }> {
    if (!this.isPTYAvailable) {
      return this.fallbackExecute(command);
    }

    const sessionId = `pty-${++this.sessionCounter}`;
    const cols = options.cols || 120;
    const rows = options.rows || 30;

    return new Promise((resolve, reject) => {
      try {
        const shell = pty.spawn("bash", ["-c", command], {
          name: "xterm-256color",
          cols,
          rows,
          cwd: options.cwd || process.cwd(),
          env: {
            ...process.env,
            ...options.env,
            TERM: "xterm-256color",
          } as any,
        });

        let output = "";
        let resolved = false;

        const session: InteractiveSession = {
          id: sessionId,
          command,
          startTime: new Date(),
          isRunning: true,
        };

        this.sessions.set(sessionId, { shell, session });

        shell.onData((data: string) => {
          output += data;
          this.emit("pty:data", { sessionId, data });
        });

        shell.onExit(({ exitCode }: { exitCode: number }) => {
          session.isRunning = false;
          this.emit("pty:exit", { sessionId, exitCode });

          if (!resolved) {
            resolved = true;
            resolve({ sessionId, output });
          }
        });

        // Timeout for non-interactive commands
        setTimeout(() => {
          if (!resolved && !this.isInteractiveCommand(command)) {
            resolved = true;
            shell.kill();
            resolve({ sessionId, output });
          }
        }, 30000);
      } catch (error: any) {
        reject(new Error(`PTY execution failed: ${error.message}`));
      }
    });
  }

  private isInteractiveCommand(command: string): boolean {
    const interactiveCommands = [
      "vim",
      "vi",
      "nano",
      "emacs",
      "htop",
      "top",
      "less",
      "more",
      "man",
      "git rebase -i",
      "git add -i",
      "git add -p",
      "ssh",
      "python",
      "node",
      "irb",
      "rails console",
      "mysql",
      "psql",
      "mongo",
    ];

    return interactiveCommands.some((cmd) =>
      command.toLowerCase().includes(cmd)
    );
  }

  private async fallbackExecute(
    command: string
  ): Promise<{ sessionId: string; output: string }> {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    const sessionId = `exec-${++this.sessionCounter}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        sessionId,
        output: stdout + (stderr ? `\nStderr:\n${stderr}` : ""),
      };
    } catch (error: any) {
      return {
        sessionId,
        output: error.stdout + "\n" + (error.stderr || error.message),
      };
    }
  }

  sendInput(sessionId: string, input: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry || !entry.session.isRunning) {
      return false;
    }

    try {
      entry.shell.write(input);
      return true;
    } catch {
      return false;
    }
  }

  sendKey(sessionId: string, key: string): boolean {
    const keyMap: Record<string, string> = {
      enter: "\r",
      tab: "\t",
      escape: "\x1b",
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      "ctrl-c": "\x03",
      "ctrl-d": "\x04",
      "ctrl-z": "\x1a",
      "ctrl-l": "\x0c",
    };

    const keyCode = keyMap[key.toLowerCase()] || key;
    return this.sendInput(sessionId, keyCode);
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry || !this.isPTYAvailable) {
      return false;
    }

    try {
      entry.shell.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  kill(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return false;
    }

    try {
      entry.shell.kill();
      entry.session.isRunning = false;
      return true;
    } catch {
      return false;
    }
  }

  getSession(sessionId: string): InteractiveSession | null {
    const entry = this.sessions.get(sessionId);
    return entry?.session || null;
  }

  getActiveSessions(): InteractiveSession[] {
    return Array.from(this.sessions.values())
      .map((entry) => entry.session)
      .filter((session) => session.isRunning);
  }

  async executeWithToolResult(
    command: string,
    options?: PTYOptions
  ): Promise<ToolResult> {
    try {
      const { output } = await this.executeInteractive(command, options);

      // Strip ANSI codes for cleaner output
      const cleanOutput = this.stripAnsi(output);

      return {
        success: true,
        output: cleanOutput,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  }

  formatHelp(): string {
    const ptyStatus = this.isPTYAvailable
      ? "✓ Available"
      : "✗ Not installed (install node-pty for full support)";

    return `
Interactive Terminal (PTY) Support

Status: ${ptyStatus}

Capabilities:
  - Run interactive commands (vim, htop, git rebase -i)
  - Full terminal emulation with color support
  - Send keystrokes and control sequences
  - Resize terminal dimensions

Usage:
  /interactive <command>   Run command in PTY
  /pty send <input>        Send input to active session
  /pty key <keyname>       Send special key (enter, ctrl-c, etc.)
  /pty resize <cols> <rows> Resize terminal
  /pty kill <sessionId>    Kill session

Special Keys:
  enter, tab, escape, up, down, left, right
  ctrl-c, ctrl-d, ctrl-z, ctrl-l

Examples:
  /interactive vim file.txt
  /interactive htop
  /interactive git rebase -i HEAD~5

Note: PTY support requires the 'node-pty' package:
  npm install node-pty
  # or
  bun add node-pty
`;
  }

  cleanup(): void {
    for (const [sessionId] of this.sessions) {
      this.kill(sessionId);
    }
    this.sessions.clear();
  }
}

// Singleton instance
let interactiveBashInstance: InteractiveBashTool | null = null;

export function getInteractiveBash(): InteractiveBashTool {
  if (!interactiveBashInstance) {
    interactiveBashInstance = new InteractiveBashTool();
  }
  return interactiveBashInstance;
}
