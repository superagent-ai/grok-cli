import { spawn, SpawnOptions } from 'child_process';
import path from 'path';
import os from 'os';

export interface SandboxConfig {
  // Filesystem restrictions
  allowedPaths: string[];
  readOnlyPaths: string[];
  blockedPaths: string[];

  // Network restrictions
  networkEnabled: boolean;
  allowedDomains?: string[];

  // Execution limits
  timeoutMs: number;
  maxOutputSize: number;

  // Sandbox method
  method: 'none' | 'firejail' | 'docker' | 'native';
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  sandboxed: boolean;
}

const DEFAULT_BLOCKED_PATHS = [
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.gnupg'),
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.config/gcloud'),
  path.join(os.homedir(), '.kube'),
  path.join(os.homedir(), '.docker'),
  path.join(os.homedir(), '.npmrc'),
  path.join(os.homedir(), '.gitconfig'),
  path.join(os.homedir(), '.netrc'),
  path.join(os.homedir(), '.env'),
  path.join(os.homedir(), '.config/gh'),
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
];

const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'dd if=',
  'mkfs',
  ':(){ :|:& };:',
  'chmod -R 777 /',
  'chown -R',
  '> /dev/sda',
  'wget.*|.*sh',
  'curl.*|.*sh',
  'sudo rm',
  'sudo dd',
];

/**
 * Sandbox Manager for secure command execution
 */
export class SandboxManager {
  private config: SandboxConfig;
  private firejailAvailable: boolean | null = null;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      allowedPaths: [process.cwd()],
      readOnlyPaths: [],
      blockedPaths: DEFAULT_BLOCKED_PATHS,
      networkEnabled: true,
      timeoutMs: 30000,
      maxOutputSize: 1024 * 1024, // 1MB
      method: 'native',
      ...config
    };
  }

  /**
   * Check if firejail is available on the system
   */
  async isFirejailAvailable(): Promise<boolean> {
    if (this.firejailAvailable !== null) {
      return this.firejailAvailable;
    }

    try {
      await this.executeRaw('which firejail', { timeout: 5000 });
      this.firejailAvailable = true;
    } catch {
      this.firejailAvailable = false;
    }

    return this.firejailAvailable;
  }

  /**
   * Validate a command before execution
   */
  validateCommand(command: string): { valid: boolean; reason?: string } {
    // Note: lowerCommand reserved for case-insensitive pattern matching if needed

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_COMMANDS) {
      if (new RegExp(pattern, 'i').test(command)) {
        return {
          valid: false,
          reason: `Potentially dangerous command pattern detected: ${pattern}`
        };
      }
    }

    // Check for attempts to access blocked paths
    for (const blockedPath of this.config.blockedPaths) {
      if (command.includes(blockedPath)) {
        return {
          valid: false,
          reason: `Access to blocked path: ${blockedPath}`
        };
      }
    }

    // Check for shell escapes and injection attempts
    const dangerousChars = ['`', '$(', '${', '|&', '&&', '||', ';'];
    const hasMultipleCommands = dangerousChars.some(char => command.includes(char));

    // Allow piping for common safe operations
    const safePipes = ['grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'awk', 'sed', 'cut', 'less', 'more'];
    if (hasMultipleCommands && command.includes('|')) {
      const parts = command.split('|').map(p => p.trim().split(' ')[0]);
      const allSafe = parts.every(cmd => safePipes.includes(cmd) || !cmd.includes('$'));
      if (!allSafe && command.includes('$(')) {
        return {
          valid: false,
          reason: 'Command substitution detected. Use explicit commands instead.'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Execute a command with sandbox protection
   */
  async execute(command: string): Promise<SandboxResult> {
    // Validate command first
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      return {
        stdout: '',
        stderr: validation.reason || 'Command validation failed',
        exitCode: 1,
        timedOut: false,
        sandboxed: false
      };
    }

    // Choose execution method based on config and availability
    switch (this.config.method) {
      case 'firejail':
        if (await this.isFirejailAvailable()) {
          return this.executeWithFirejail(command);
        }
        // Fallback to native
        return this.executeNative(command);

      case 'native':
      default:
        return this.executeNative(command);
    }
  }

  /**
   * Execute with firejail sandbox (Linux)
   */
  private async executeWithFirejail(command: string): Promise<SandboxResult> {
    const firejailArgs = [
      '--quiet',
      '--private-tmp',
      '--nogroups',
      '--nonewprivs',
      '--noroot',
      `--timeout=${Math.floor(this.config.timeoutMs / 1000)}`,
    ];

    // Add path restrictions
    for (const blockedPath of this.config.blockedPaths) {
      firejailArgs.push(`--blacklist=${blockedPath}`);
    }

    // Network restrictions
    if (!this.config.networkEnabled) {
      firejailArgs.push('--net=none');
    }

    // Working directory
    firejailArgs.push(`--whitelist=${process.cwd()}`);

    const fullCommand = `firejail ${firejailArgs.join(' ')} -- bash -c "${command.replace(/"/g, '\\"')}"`;

    return this.executeRaw(fullCommand, {
      timeout: this.config.timeoutMs,
      sandboxed: true
    });
  }

  /**
   * Execute with native restrictions (basic validation only)
   */
  private async executeNative(command: string): Promise<SandboxResult> {
    return this.executeRaw(command, {
      timeout: this.config.timeoutMs,
      sandboxed: false,
      env: {
        ...process.env,
        // Restrict some environment variables
        HISTFILE: '/dev/null',
        HISTSIZE: '0'
      }
    });
  }

  /**
   * Raw command execution
   */
  private executeRaw(
    command: string,
    options: { timeout?: number; sandboxed?: boolean; env?: NodeJS.ProcessEnv }
  ): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const { timeout = 30000, sandboxed = false, env } = options;

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const spawnOptions: SpawnOptions = {
        shell: true,
        cwd: process.cwd(),
        env: env || process.env
      };

      const proc = spawn('bash', ['-c', command], spawnOptions);

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeout);

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= this.config.maxOutputSize) {
          stdout += chunk;
        }
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= this.config.maxOutputSize) {
          stderr += chunk;
        }
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? 1,
          timedOut,
          sandboxed
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          stdout: '',
          stderr: error.message,
          exitCode: 1,
          timedOut: false,
          sandboxed
        });
      });
    });
  }

  /**
   * Get current sandbox configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  /**
   * Update sandbox configuration
   */
  updateConfig(updates: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Add a path to blocked list
   */
  blockPath(pathToBlock: string): void {
    const resolved = path.resolve(pathToBlock);
    if (!this.config.blockedPaths.includes(resolved)) {
      this.config.blockedPaths.push(resolved);
    }
  }

  /**
   * Add a path to allowed list
   */
  allowPath(pathToAllow: string): void {
    const resolved = path.resolve(pathToAllow);
    if (!this.config.allowedPaths.includes(resolved)) {
      this.config.allowedPaths.push(resolved);
    }
  }

  /**
   * Format sandbox status for display
   */
  formatStatus(): string {
    const lines = [
      'Sandbox Configuration:',
      `  Method: ${this.config.method}`,
      `  Network: ${this.config.networkEnabled ? 'enabled' : 'disabled'}`,
      `  Timeout: ${this.config.timeoutMs}ms`,
      `  Blocked paths: ${this.config.blockedPaths.length}`,
      `  Allowed paths: ${this.config.allowedPaths.length}`
    ];
    return lines.join('\n');
  }
}

// Singleton instance
let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(config?: Partial<SandboxConfig>): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager(config);
  }
  return sandboxManagerInstance;
}

export function resetSandboxManager(): void {
  sandboxManagerInstance = null;
}
