import { exec } from "child_process";
import { stat } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { ToolResult } from "../types/index.js";

const execAsync = promisify(exec);

export class BashTool {
  private cwd: string;

  constructor(initialCwd = process.cwd()) {
    this.cwd = initialCwd;
  }

  async execute(command: string, timeout = 30_000): Promise<ToolResult> {
    try {
      if (command.startsWith("cd ")) {
        const dir = command.substring(3).trim().replace(/^["']|["']$/g, "");
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

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : "");
      return {
        success: true,
        output: output.trim() || "Command executed successfully (no output)",
      };
    } catch (err: unknown) {
      if (err && typeof err === "object" && "stdout" in err) {
        const execErr = err as { stdout?: string; stderr?: string; message: string };
        const output =
          (execErr.stdout || "") + (execErr.stderr ? `\nSTDERR: ${execErr.stderr}` : "");
        if (output.trim()) {
          return { success: false, error: output.trim() };
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Command failed: ${msg}` };
    }
  }

  getCwd(): string {
    return this.cwd;
  }
}
