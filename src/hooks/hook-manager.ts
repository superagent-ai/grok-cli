import * as fs from "fs-extra";
import * as path from "path";
import { spawn } from "child_process";

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreEdit"
  | "PostEdit";

export interface Hook {
  event: HookEvent;
  command: string;
  pattern?: string;  // Regex pattern to match tool names or other criteria
  timeout?: number;  // Timeout in milliseconds (default: 30000)
  enabled?: boolean;
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  sessionId?: string;
  message?: string;
  filePath?: string;
  timestamp: Date;
}

export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  blocked?: boolean;  // If true, the operation should be blocked
  modifiedArgs?: Record<string, any>;  // Modified tool arguments
}

export interface HooksConfig {
  hooks: Hook[];
}

// Default hooks configuration - available for initialization
const _DEFAULT_HOOKS_CONFIG: HooksConfig = {
  hooks: []
};

export class HookManager {
  private hooks: Hook[] = [];
  private configPath: string;
  private globalConfigPath: string;
  private enabled: boolean = true;

  constructor() {
    this.configPath = path.join(process.cwd(), ".grok", "hooks.json");
    this.globalConfigPath = path.join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".grok",
      "hooks.json"
    );
    this.loadHooks();
  }

  private loadHooks(): void {
    // Load global hooks first
    if (fs.existsSync(this.globalConfigPath)) {
      try {
        const globalConfig = fs.readJsonSync(this.globalConfigPath) as HooksConfig;
        this.hooks = [...(globalConfig.hooks || [])];
      } catch (error) {
        console.warn("Failed to load global hooks config:", error);
      }
    }

    // Load project-level hooks (override/extend global)
    if (fs.existsSync(this.configPath)) {
      try {
        const projectConfig = fs.readJsonSync(this.configPath) as HooksConfig;
        this.hooks = [...this.hooks, ...(projectConfig.hooks || [])];
      } catch (error) {
        console.warn("Failed to load project hooks config:", error);
      }
    }
  }

  public reloadHooks(): void {
    this.hooks = [];
    this.loadHooks();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getHooks(): Hook[] {
    return [...this.hooks];
  }

  public getHooksForEvent(event: HookEvent): Hook[] {
    return this.hooks.filter(
      (hook) => hook.event === event && hook.enabled !== false
    );
  }

  public addHook(hook: Hook): void {
    this.hooks.push(hook);
    this.saveHooks();
  }

  public removeHook(index: number): boolean {
    if (index >= 0 && index < this.hooks.length) {
      this.hooks.splice(index, 1);
      this.saveHooks();
      return true;
    }
    return false;
  }

  private saveHooks(): void {
    try {
      const dir = path.dirname(this.configPath);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(this.configPath, { hooks: this.hooks }, { spaces: 2 });
    } catch (error) {
      console.warn("Failed to save hooks config:", error);
    }
  }

  public async executeHooks(
    event: HookEvent,
    context: Partial<HookContext>
  ): Promise<HookResult> {
    if (!this.enabled) {
      return { success: true };
    }

    const fullContext: HookContext = {
      event,
      timestamp: new Date(),
      ...context,
    };

    const hooks = this.getHooksForEvent(event);

    if (hooks.length === 0) {
      return { success: true };
    }

    let combinedResult: HookResult = { success: true };

    for (const hook of hooks) {
      // Check pattern matching for tool-specific hooks
      if (hook.pattern && fullContext.toolName) {
        const regex = new RegExp(hook.pattern);
        if (!regex.test(fullContext.toolName)) {
          continue;
        }
      }

      try {
        const result = await this.executeHook(hook, fullContext);

        if (!result.success) {
          combinedResult.success = false;
          combinedResult.error = result.error;
        }

        if (result.blocked) {
          combinedResult.blocked = true;
          combinedResult.error = result.error || "Operation blocked by hook";
          break;  // Stop processing further hooks
        }

        if (result.modifiedArgs) {
          combinedResult.modifiedArgs = {
            ...combinedResult.modifiedArgs,
            ...result.modifiedArgs,
          };
        }

        if (result.output) {
          combinedResult.output = combinedResult.output
            ? `${combinedResult.output}\n${result.output}`
            : result.output;
        }
      } catch (error: any) {
        console.warn(`Hook execution error: ${error.message}`);
        // Continue with other hooks even if one fails
      }
    }

    return combinedResult;
  }

  private async executeHook(
    hook: Hook,
    context: HookContext
  ): Promise<HookResult> {
    return new Promise((resolve) => {
      const timeout = hook.timeout || 30000;

      const child = spawn("sh", ["-c", hook.command], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GROK_HOOK_EVENT: context.event,
          GROK_HOOK_TOOL: context.toolName || "",
          GROK_HOOK_SESSION: context.sessionId || "",
        },
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeout);

      // Send context as JSON to stdin
      child.stdin.write(JSON.stringify(context));
      child.stdin.end();

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            success: false,
            error: `Hook timed out after ${timeout}ms`,
          });
          return;
        }

        // Try to parse stdout as JSON for advanced hook responses
        let parsedOutput: any = null;
        try {
          parsedOutput = JSON.parse(stdout.trim());
        } catch {
          // Not JSON, use as plain text
        }

        if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim(),
            blocked: parsedOutput?.blocked,
            modifiedArgs: parsedOutput?.modifiedArgs,
          });
        } else if (code === 77) {
          // Special exit code to block the operation
          resolve({
            success: false,
            blocked: true,
            error: stderr.trim() || stdout.trim() || "Operation blocked by hook",
          });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `Hook exited with code ${code}`,
          });
        }
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `Hook execution failed: ${error.message}`,
        });
      });
    });
  }

  public formatStatus(): string {
    const status = this.enabled ? "enabled" : "disabled";
    const hookCount = this.hooks.length;

    let output = `Hook System: ${status}\n`;
    output += `Total hooks: ${hookCount}\n\n`;

    if (hookCount > 0) {
      output += "Configured Hooks:\n";
      this.hooks.forEach((hook, index) => {
        const enabledStatus = hook.enabled !== false ? "✓" : "✗";
        output += `  ${index + 1}. [${enabledStatus}] ${hook.event}`;
        if (hook.pattern) {
          output += ` (pattern: ${hook.pattern})`;
        }
        output += `\n     Command: ${hook.command}\n`;
      });
    }

    return output;
  }
}

// Singleton instance
let hookManagerInstance: HookManager | null = null;

export function getHookManager(): HookManager {
  if (!hookManagerInstance) {
    hookManagerInstance = new HookManager();
  }
  return hookManagerInstance;
}
