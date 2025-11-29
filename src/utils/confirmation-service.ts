import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';

export interface ConfirmationOptions {
  operation: string;
  filename: string;
  showVSCodeOpen?: boolean;
  content?: string; // Content to show in confirmation dialog
}

export interface ConfirmationResult {
  confirmed: boolean;
  dontAskAgain?: boolean;
  feedback?: string;
}

/**
 * Execute a command safely using spawn with separate arguments
 * This prevents command injection attacks
 */
function spawnAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
    });

    proc.on('error', (error) => {
      reject(error);
    });

    // Don't wait for VS Code to close
    proc.unref();

    // Give it a moment to start
    setTimeout(() => resolve(), 100);
  });
}

/**
 * Check if a command exists in PATH
 */
function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command], { stdio: 'pipe' });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Validate and sanitize a filename for safe use
 */
function sanitizeFilename(filename: string): string {
  // Resolve to absolute path to prevent path traversal
  const resolved = path.resolve(filename);

  // Check for null bytes
  if (resolved.includes('\0')) {
    throw new Error('Invalid filename: contains null bytes');
  }

  return resolved;
}

export class ConfirmationService extends EventEmitter {
  private static instance: ConfirmationService;
  private pendingConfirmation: Promise<ConfirmationResult> | null = null;
  private resolveConfirmation: ((result: ConfirmationResult) => void) | null = null;

  // Session flags for different operation types
  private sessionFlags = {
    fileOperations: false,
    bashCommands: false,
    allOperations: false,
  };

  // Dry-run mode - preview changes without applying
  private dryRunMode: boolean = false;
  private dryRunLog: Array<{ operation: string; content: string; timestamp: Date }> = [];

  static getInstance(): ConfirmationService {
    if (!ConfirmationService.instance) {
      ConfirmationService.instance = new ConfirmationService();
    }
    return ConfirmationService.instance;
  }

  constructor() {
    super();
  }

  /**
   * Enable or disable dry-run mode
   */
  setDryRunMode(enabled: boolean): void {
    this.dryRunMode = enabled;
    if (enabled) {
      this.dryRunLog = [];
    }
  }

  /**
   * Check if dry-run mode is enabled
   */
  isDryRunMode(): boolean {
    return this.dryRunMode;
  }

  /**
   * Get dry-run log
   */
  getDryRunLog(): Array<{ operation: string; content: string; timestamp: Date }> {
    return [...this.dryRunLog];
  }

  /**
   * Clear dry-run log
   */
  clearDryRunLog(): void {
    this.dryRunLog = [];
  }

  /**
   * Format dry-run log for display
   */
  formatDryRunLog(): string {
    if (this.dryRunLog.length === 0) {
      return '🔍 Dry-run log is empty. No operations would have been executed.';
    }

    const lines = ['🔍 Dry-run Summary:', '═'.repeat(50)];

    for (let i = 0; i < this.dryRunLog.length; i++) {
      const entry = this.dryRunLog[i];
      lines.push(`\n${i + 1}. ${entry.operation}`);
      lines.push(`   Time: ${entry.timestamp.toLocaleTimeString()}`);
      if (entry.content) {
        const preview = entry.content.length > 200
          ? entry.content.slice(0, 200) + '...'
          : entry.content;
        lines.push(`   Content: ${preview}`);
      }
    }

    lines.push('\n' + '═'.repeat(50));
    lines.push(`Total operations that would execute: ${this.dryRunLog.length}`);

    return lines.join('\n');
  }

  async requestConfirmation(
    options: ConfirmationOptions,
    operationType: 'file' | 'bash' = 'file'
  ): Promise<ConfirmationResult> {
    // In dry-run mode, log the operation but don't execute
    if (this.dryRunMode) {
      this.dryRunLog.push({
        operation: `[${operationType.toUpperCase()}] ${options.operation}: ${options.filename}`,
        content: options.content || '',
        timestamp: new Date(),
      });

      // Emit event for UI to show what would happen
      setImmediate(() => {
        this.emit('dry-run-logged', {
          ...options,
          operationType,
          logIndex: this.dryRunLog.length,
        });
      });

      // In dry-run mode, return as if rejected (operation won't execute)
      return {
        confirmed: false,
        feedback: `[DRY-RUN] Operation logged but not executed: ${options.operation}`,
      };
    }

    // Check session flags
    if (
      this.sessionFlags.allOperations ||
      (operationType === 'file' && this.sessionFlags.fileOperations) ||
      (operationType === 'bash' && this.sessionFlags.bashCommands)
    ) {
      return { confirmed: true };
    }

    // If VS Code should be opened, try to open it
    if (options.showVSCodeOpen) {
      try {
        await this.openInVSCode(options.filename);
      } catch {
        // If VS Code opening fails, continue without it
        options.showVSCodeOpen = false;
      }
    }

    // Create a promise that will be resolved by the UI component
    this.pendingConfirmation = new Promise<ConfirmationResult>((resolve) => {
      this.resolveConfirmation = resolve;
    });

    // Emit custom event that the UI can listen to (using setImmediate to ensure the UI updates)
    setImmediate(() => {
      this.emit('confirmation-requested', options);
    });

    const result = await this.pendingConfirmation;

    if (result.dontAskAgain) {
      // Set the appropriate session flag based on operation type
      if (operationType === 'file') {
        this.sessionFlags.fileOperations = true;
      } else if (operationType === 'bash') {
        this.sessionFlags.bashCommands = true;
      }
      // Could also set allOperations for global skip
    }

    return result;
  }

  confirmOperation(confirmed: boolean, dontAskAgain?: boolean): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed, dontAskAgain });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  rejectOperation(feedback?: string): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed: false, feedback });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  /**
   * Open a file in VS Code safely using spawn with separate arguments
   * This prevents command injection by not using shell interpolation
   */
  private async openInVSCode(filename: string): Promise<void> {
    // Sanitize the filename
    const sanitizedPath = sanitizeFilename(filename);

    // Try different VS Code commands
    const commands = ['code', 'code-insiders', 'codium'];

    for (const cmd of commands) {
      try {
        const exists = await commandExists(cmd);
        if (exists) {
          // Use spawn with separate arguments - prevents injection
          await spawnAsync(cmd, [sanitizedPath]);
          return;
        }
      } catch {
        // Continue to next command
        continue;
      }
    }

    throw new Error('VS Code not found');
  }

  isPending(): boolean {
    return this.pendingConfirmation !== null;
  }

  resetSession(): void {
    this.sessionFlags = {
      fileOperations: false,
      bashCommands: false,
      allOperations: false,
    };
  }

  getSessionFlags() {
    return { ...this.sessionFlags };
  }

  setSessionFlag(flagType: 'fileOperations' | 'bashCommands' | 'allOperations', value: boolean) {
    this.sessionFlags[flagType] = value;
  }
}
