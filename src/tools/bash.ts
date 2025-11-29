import { spawn, SpawnOptions } from 'child_process';
import { ToolResult } from '../types/index.js';
import { ConfirmationService } from '../utils/confirmation-service.js';
import { getSandboxManager } from '../security/sandbox.js';
import { getSelfHealingEngine, SelfHealingEngine } from '../utils/self-healing.js';
import path from 'path';
import os from 'os';

/**
 * Dangerous command patterns that are always blocked
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+(-rf?|--recursive)\s+[/~]/i,  // rm -rf / or ~
  /rm\s+.*\/\s*$/i,                      // rm something/
  />\s*\/dev\/sd[a-z]/i,                 // Write to disk device
  /dd\s+.*if=.*of=\/dev/i,              // dd to device
  /mkfs/i,                               // Format filesystem
  /:()\s*{\s*:\|:&\s*};:/,              // Fork bomb
  /chmod\s+-R\s+777\s+\//i,             // chmod 777 /
  /wget.*\|\s*(ba)?sh/i,                // wget | sh
  /curl.*\|\s*(ba)?sh/i,                // curl | sh
  /sudo\s+(rm|dd|mkfs)/i,               // sudo dangerous commands
];

/**
 * Paths that should never be accessed
 */
const BLOCKED_PATHS: string[] = [
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.gnupg'),
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.docker'),
  path.join(os.homedir(), '.npmrc'),
  path.join(os.homedir(), '.gitconfig'),
  path.join(os.homedir(), '.netrc'),
  path.join(os.homedir(), '.env'),
  path.join(os.homedir(), '.config/gh'),
  path.join(os.homedir(), '.config/gcloud'),
  path.join(os.homedir(), '.kube'),
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
];

export class BashTool {
  private currentDirectory: string = process.cwd();
  private confirmationService = ConfirmationService.getInstance();
  private sandboxManager = getSandboxManager();
  private selfHealingEngine: SelfHealingEngine = getSelfHealingEngine();
  private selfHealingEnabled: boolean = true;

  /**
   * Validate command for dangerous patterns
   */
  private validateCommand(command: string): { valid: boolean; reason?: string } {
    // Check for blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          valid: false,
          reason: `Blocked command pattern detected: ${pattern.source}`
        };
      }
    }

    // Check for access to blocked paths
    for (const blockedPath of BLOCKED_PATHS) {
      if (command.includes(blockedPath)) {
        return {
          valid: false,
          reason: `Access to protected path blocked: ${blockedPath}`
        };
      }
    }

    // Also use sandbox manager validation
    const sandboxValidation = this.sandboxManager.validateCommand(command);
    if (!sandboxValidation.valid) {
      return sandboxValidation;
    }

    return { valid: true };
  }

  /**
   * Execute a command using spawn (safer than exec)
   */
  private executeWithSpawn(
    command: string,
    options: { timeout: number; cwd: string }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const spawnOptions: SpawnOptions = {
        shell: true,
        cwd: options.cwd,
        env: {
          ...process.env,
          // Disable history to prevent command logging
          HISTFILE: '/dev/null',
          HISTSIZE: '0',
        }
      };

      const proc = spawn('bash', ['-c', command], spawnOptions);

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, options.timeout);

      const maxBuffer = 1024 * 1024; // 1MB limit

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= maxBuffer) {
          stdout += chunk;
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= maxBuffer) {
          stderr += chunk;
        }
      });

      proc.on('close', (exitCode: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            stdout: stdout.trim(),
            stderr: 'Command timed out',
            exitCode: 124
          });
        } else {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? 1
          });
        }
      });

      proc.on('error', (error: Error) => {
        clearTimeout(timer);
        resolve({
          stdout: '',
          stderr: error.message,
          exitCode: 1
        });
      });
    });
  }

  async execute(command: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      // Validate command before any execution
      const validation = this.validateCommand(command);
      if (!validation.valid) {
        return {
          success: false,
          error: `Command blocked: ${validation.reason}`,
        };
      }

      // Check if user has already accepted bash commands for this session
      const sessionFlags = this.confirmationService.getSessionFlags();
      if (!sessionFlags.bashCommands && !sessionFlags.allOperations) {
        // Request confirmation showing the command
        const confirmationResult = await this.confirmationService.requestConfirmation(
          {
            operation: 'Run bash command',
            filename: command,
            showVSCodeOpen: false,
            content: `Command: ${command}\nWorking directory: ${this.currentDirectory}`,
          },
          'bash'
        );

        if (!confirmationResult.confirmed) {
          return {
            success: false,
            error: confirmationResult.feedback || 'Command execution cancelled by user',
          };
        }
      }

      // Handle cd command separately
      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        // Remove quotes if present
        const cleanDir = newDir.replace(/^["']|["']$/g, '');
        try {
          process.chdir(cleanDir);
          this.currentDirectory = process.cwd();
          return {
            success: true,
            output: `Changed directory to: ${this.currentDirectory}`,
          };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            error: `Cannot change directory: ${errorMessage}`,
          };
        }
      }

      // Execute using spawn (safer than exec)
      const result = await this.executeWithSpawn(command, {
        timeout,
        cwd: this.currentDirectory,
      });

      if (result.exitCode !== 0) {
        const errorMessage = result.stderr || `Command exited with code ${result.exitCode}`;

        // Attempt self-healing if enabled
        if (this.selfHealingEnabled) {
          const healingResult = await this.selfHealingEngine.attemptHealing(
            command,
            errorMessage,
            async (fixCmd: string) => {
              // Execute fix command without self-healing to avoid recursion
              const fixResult = await this.executeWithSpawn(fixCmd, {
                timeout: timeout * 2, // Give more time for fix commands
                cwd: this.currentDirectory,
              });

              if (fixResult.exitCode === 0) {
                return {
                  success: true,
                  output: fixResult.stdout || 'Fix applied successfully',
                };
              }
              return {
                success: false,
                error: fixResult.stderr || `Fix failed with code ${fixResult.exitCode}`,
              };
            }
          );

          if (healingResult.success && healingResult.finalResult) {
            return {
              success: true,
              output: `🔧 Self-healed after ${healingResult.attempts.length} attempt(s)\n` +
                      `Fix applied: ${healingResult.fixedCommand}\n\n` +
                      (healingResult.finalResult.output || 'Success'),
            };
          }

          // If healing failed, return original error with healing info
          if (healingResult.attempts.length > 0) {
            return {
              success: false,
              error: `${errorMessage}\n\n🔧 Self-healing attempted ${healingResult.attempts.length} fix(es) but failed.`,
            };
          }
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const output = result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : '');

      return {
        success: true,
        output: output.trim() || 'Command executed successfully (no output)',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Command failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Enable or disable self-healing
   */
  setSelfHealing(enabled: boolean): void {
    this.selfHealingEnabled = enabled;
  }

  /**
   * Check if self-healing is enabled
   */
  isSelfHealingEnabled(): boolean {
    return this.selfHealingEnabled;
  }

  /**
   * Get self-healing engine for configuration
   */
  getSelfHealingEngine(): SelfHealingEngine {
    return this.selfHealingEngine;
  }

  getCurrentDirectory(): string {
    return this.currentDirectory;
  }

  async listFiles(directory: string = '.'): Promise<ToolResult> {
    return this.execute(`ls -la ${directory}`);
  }

  async findFiles(pattern: string, directory: string = '.'): Promise<ToolResult> {
    return this.execute(`find ${directory} -name "${pattern}" -type f`);
  }

  async grep(pattern: string, files: string = '.'): Promise<ToolResult> {
    return this.execute(`grep -r "${pattern}" ${files}`);
  }
}
