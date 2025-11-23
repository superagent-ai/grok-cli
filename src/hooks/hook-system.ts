import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';

export type HookType =
  | 'pre-commit'
  | 'post-commit'
  | 'pre-edit'
  | 'post-edit'
  | 'pre-create'
  | 'post-create'
  | 'pre-bash'
  | 'post-bash'
  | 'on-file-change'
  | 'on-error'
  | 'on-session-start'
  | 'on-session-end';

export interface Hook {
  type: HookType;
  command: string;
  enabled: boolean;
  timeout?: number;
  continueOnError?: boolean;
  description?: string;
}

export interface HooksConfig {
  hooks: Hook[];
  globalTimeout?: number;
  enabled?: boolean;
}

export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  skipped?: boolean;
  timedOut?: boolean;
}

export interface HookContext {
  file?: string;
  files?: string[];
  command?: string;
  oldContent?: string;
  newContent?: string;
  error?: Error;
  [key: string]: any;
}

/**
 * Hook System - Inspired by Claude Code
 * Allows automatic actions at specific points like pre-commit, post-edit, etc.
 */
export class HookSystem extends EventEmitter {
  private hooks: Map<HookType, Hook[]> = new Map();
  private workingDirectory: string;
  private configPaths: string[];
  private globalTimeout: number = 30000; // 30 seconds default
  private enabled: boolean = true;

  constructor(workingDirectory: string = process.cwd()) {
    super();
    this.workingDirectory = workingDirectory;
    this.configPaths = [
      path.join(workingDirectory, '.grok', 'hooks.json'),
      path.join(os.homedir(), '.grok', 'hooks.json')
    ];

    this.loadHooks();
  }

  /**
   * Load hooks from configuration files
   */
  private loadHooks(): void {
    this.hooks.clear();

    for (const configPath of this.configPaths) {
      if (!fs.existsSync(configPath)) continue;

      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config: HooksConfig = JSON.parse(content);

        if (config.globalTimeout) {
          this.globalTimeout = config.globalTimeout;
        }

        if (config.enabled !== undefined) {
          this.enabled = config.enabled;
        }

        for (const hook of config.hooks || []) {
          if (!hook.type || !hook.command) continue;

          const existing = this.hooks.get(hook.type) || [];
          existing.push({
            ...hook,
            enabled: hook.enabled !== false,
            timeout: hook.timeout || this.globalTimeout,
            continueOnError: hook.continueOnError ?? true
          });
          this.hooks.set(hook.type, existing);
        }
      } catch (error) {
        console.warn(`Failed to load hooks from ${configPath}:`, error);
      }
    }
  }

  /**
   * Execute hooks of a specific type
   */
  async executeHooks(type: HookType, context: HookContext = {}): Promise<HookResult[]> {
    if (!this.enabled) {
      return [{ success: true, skipped: true }];
    }

    const hooks = this.hooks.get(type) || [];
    const results: HookResult[] = [];

    for (const hook of hooks) {
      if (!hook.enabled) {
        results.push({ success: true, skipped: true });
        continue;
      }

      const result = await this.executeHook(hook, context);
      results.push(result);

      this.emit('hook-executed', { type, hook, result, context });

      // Stop execution if hook failed and continueOnError is false
      if (!result.success && !hook.continueOnError) {
        this.emit('hook-failed', { type, hook, result, context });
        break;
      }
    }

    return results;
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: Hook, context: HookContext): Promise<HookResult> {
    return new Promise((resolve) => {
      // Replace placeholders in command
      let command = this.interpolateCommand(hook.command, context);

      const timeout = hook.timeout || this.globalTimeout;
      let timedOut = false;

      const spawnOptions: SpawnOptions = {
        cwd: this.workingDirectory,
        shell: true,
        env: {
          ...process.env,
          GROK_HOOK_TYPE: hook.type,
          GROK_FILE: context.file || '',
          GROK_FILES: (context.files || []).join(':'),
          GROK_COMMAND: context.command || ''
        }
      };

      const child = spawn(command, [], spawnOptions);

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          resolve({
            success: false,
            error: `Hook timed out after ${timeout}ms`,
            timedOut: true,
            exitCode: code || undefined
          });
        } else if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim() || undefined,
            exitCode: 0
          });
        } else {
          resolve({
            success: false,
            output: stdout.trim() || undefined,
            error: stderr.trim() || `Hook exited with code ${code}`,
            exitCode: code || undefined
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: `Failed to execute hook: ${error.message}`
        });
      });
    });
  }

  /**
   * Interpolate placeholders in hook command
   */
  private interpolateCommand(command: string, context: HookContext): string {
    let result = command;

    // Replace {file} with the file path
    if (context.file) {
      result = result.replace(/\{file\}/g, context.file);
    }

    // Replace {files} with space-separated file list
    if (context.files) {
      result = result.replace(/\{files\}/g, context.files.join(' '));
    }

    // Replace {command} with the command
    if (context.command) {
      result = result.replace(/\{command\}/g, context.command);
    }

    // Replace any other context variables
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string') {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    return result;
  }

  /**
   * Check if any hooks are registered for a type
   */
  hasHooks(type: HookType): boolean {
    const hooks = this.hooks.get(type) || [];
    return hooks.some(h => h.enabled);
  }

  /**
   * Get hooks of a specific type
   */
  getHooks(type: HookType): Hook[] {
    return this.hooks.get(type) || [];
  }

  /**
   * Get all hooks
   */
  getAllHooks(): Map<HookType, Hook[]> {
    return new Map(this.hooks);
  }

  /**
   * Add a hook programmatically
   */
  addHook(hook: Hook): void {
    const existing = this.hooks.get(hook.type) || [];
    existing.push({
      ...hook,
      enabled: hook.enabled !== false,
      timeout: hook.timeout || this.globalTimeout,
      continueOnError: hook.continueOnError ?? true
    });
    this.hooks.set(hook.type, existing);
  }

  /**
   * Remove hooks of a specific type
   */
  removeHooks(type: HookType): void {
    this.hooks.delete(type);
  }

  /**
   * Enable or disable the hook system
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if hook system is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reload hooks from configuration
   */
  reload(): void {
    this.loadHooks();
  }

  /**
   * Save current hooks to project configuration
   */
  saveHooks(): void {
    const configPath = path.join(this.workingDirectory, '.grok', 'hooks.json');
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const allHooks: Hook[] = [];
    for (const hooks of this.hooks.values()) {
      allHooks.push(...hooks);
    }

    const config: HooksConfig = {
      enabled: this.enabled,
      globalTimeout: this.globalTimeout,
      hooks: allHooks
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Create default hooks configuration template
   */
  createDefaultConfig(): string {
    const configPath = path.join(this.workingDirectory, '.grok', 'hooks.json');
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const defaultConfig: HooksConfig = {
      enabled: true,
      globalTimeout: 30000,
      hooks: [
        {
          type: 'pre-commit',
          command: 'npm run lint && npm test',
          enabled: false,
          timeout: 60000,
          continueOnError: false,
          description: 'Run linter and tests before commit'
        },
        {
          type: 'post-edit',
          command: 'npm run typecheck',
          enabled: false,
          timeout: 30000,
          continueOnError: true,
          description: 'Run type checking after file edit'
        },
        {
          type: 'on-file-change',
          command: 'prettier --write {file}',
          enabled: false,
          timeout: 10000,
          continueOnError: true,
          description: 'Format file with Prettier on change'
        },
        {
          type: 'on-session-start',
          command: 'echo "Grok CLI session started"',
          enabled: false,
          timeout: 5000,
          continueOnError: true,
          description: 'Run on session start'
        }
      ]
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    this.reload();

    return configPath;
  }

  /**
   * Format hooks status for display
   */
  formatStatus(): string {
    let output = '🪝 Hook System Status\n' + '═'.repeat(50) + '\n\n';
    output += `Status: ${this.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    output += `Global Timeout: ${this.globalTimeout}ms\n\n`;

    const hookTypes: HookType[] = [
      'pre-commit', 'post-commit',
      'pre-edit', 'post-edit',
      'pre-create', 'post-create',
      'pre-bash', 'post-bash',
      'on-file-change', 'on-error',
      'on-session-start', 'on-session-end'
    ];

    let hasHooks = false;

    for (const type of hookTypes) {
      const hooks = this.hooks.get(type) || [];
      if (hooks.length > 0) {
        hasHooks = true;
        output += `📌 ${type}:\n`;
        for (const hook of hooks) {
          const status = hook.enabled ? '✅' : '⏸️';
          output += `   ${status} ${hook.command}\n`;
          if (hook.description) {
            output += `      ${hook.description}\n`;
          }
        }
        output += '\n';
      }
    }

    if (!hasHooks) {
      output += 'No hooks configured.\n';
      output += '\n💡 Create hooks in .grok/hooks.json or use /init to create a template.';
    }

    return output;
  }
}

// Singleton instance
let hookSystemInstance: HookSystem | null = null;

export function getHookSystem(workingDirectory?: string): HookSystem {
  if (!hookSystemInstance || workingDirectory) {
    hookSystemInstance = new HookSystem(workingDirectory);
  }
  return hookSystemInstance;
}

export function resetHookSystem(): void {
  hookSystemInstance = null;
}
