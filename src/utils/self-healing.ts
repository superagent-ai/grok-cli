import { GrokClient, GrokMessage } from '../grok/client.js';
import { ToolResult } from '../types/index.js';

export interface SelfHealingOptions {
  maxRetries: number;           // Maximum number of fix attempts (default: 3)
  enabled: boolean;             // Whether self-healing is enabled
  autoFix: boolean;             // Automatically apply fixes without asking
  verbose: boolean;             // Show detailed fix attempts
}

export interface FixAttempt {
  attemptNumber: number;
  originalError: string;
  fixApplied: string;
  result: 'success' | 'failure' | 'partial';
  newError?: string;
}

export interface SelfHealingResult {
  success: boolean;
  originalError: string;
  attempts: FixAttempt[];
  finalResult?: ToolResult;
  fixedCommand?: string;
}

const DEFAULT_OPTIONS: SelfHealingOptions = {
  maxRetries: 3,
  enabled: true,
  autoFix: true,
  verbose: false,
};

// Common error patterns and their fix strategies
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  fixHint: string;
}> = [
  // Package/dependency errors
  {
    pattern: /Cannot find module '([^']+)'/i,
    category: 'missing-module',
    fixHint: 'Install missing module with npm/bun install',
  },
  {
    pattern: /Module not found: Error: Can't resolve '([^']+)'/i,
    category: 'missing-module',
    fixHint: 'Install missing dependency',
  },
  {
    pattern: /command not found: (\w+)/i,
    category: 'missing-command',
    fixHint: 'Install missing command or check PATH',
  },

  // TypeScript/compilation errors
  {
    pattern: /TS\d+: (.+)/,
    category: 'typescript-error',
    fixHint: 'Fix TypeScript type error',
  },
  {
    pattern: /error TS\d+/i,
    category: 'typescript-error',
    fixHint: 'Fix TypeScript compilation error',
  },

  // Syntax errors
  {
    pattern: /SyntaxError: (.+)/i,
    category: 'syntax-error',
    fixHint: 'Fix syntax error in code',
  },
  {
    pattern: /Unexpected token/i,
    category: 'syntax-error',
    fixHint: 'Fix unexpected token error',
  },

  // Permission errors
  {
    pattern: /EACCES: permission denied/i,
    category: 'permission-error',
    fixHint: 'Check file/folder permissions',
  },
  {
    pattern: /Permission denied/i,
    category: 'permission-error',
    fixHint: 'Run with appropriate permissions',
  },

  // File/path errors
  {
    pattern: /ENOENT: no such file or directory.*'([^']+)'/i,
    category: 'missing-file',
    fixHint: 'Create missing file or directory',
  },
  {
    pattern: /No such file or directory/i,
    category: 'missing-file',
    fixHint: 'Check if path exists',
  },

  // Network errors
  {
    pattern: /ECONNREFUSED/i,
    category: 'network-error',
    fixHint: 'Check if service is running',
  },
  {
    pattern: /getaddrinfo ENOTFOUND/i,
    category: 'network-error',
    fixHint: 'Check network connection and hostname',
  },

  // Build/test errors
  {
    pattern: /npm ERR!/i,
    category: 'npm-error',
    fixHint: 'Check npm configuration and package.json',
  },
  {
    pattern: /Error: Command failed/i,
    category: 'command-failed',
    fixHint: 'Check command arguments and environment',
  },

  // ESLint/linting errors
  {
    pattern: /\d+ problems? \(\d+ errors?/i,
    category: 'lint-error',
    fixHint: 'Fix linting errors or run with --fix',
  },

  // Jest/test errors
  {
    pattern: /FAIL/i,
    category: 'test-failure',
    fixHint: 'Fix failing tests',
  },
  {
    pattern: /Test suite failed/i,
    category: 'test-failure',
    fixHint: 'Investigate test failures',
  },

  // Git errors
  {
    pattern: /fatal: not a git repository/i,
    category: 'git-error',
    fixHint: 'Initialize git repository or check path',
  },
  {
    pattern: /error: failed to push/i,
    category: 'git-error',
    fixHint: 'Pull latest changes first or force push',
  },

  // Port/address errors
  {
    pattern: /EADDRINUSE/i,
    category: 'port-in-use',
    fixHint: 'Kill process using the port or use different port',
  },
];

/**
 * Self-Healing Engine - Automatically analyzes and fixes errors
 */
export class SelfHealingEngine {
  private options: SelfHealingOptions;
  private grokClient: GrokClient | null = null;
  private history: SelfHealingResult[] = [];

  constructor(options: Partial<SelfHealingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Set the Grok client for AI-powered fixes
   */
  setGrokClient(client: GrokClient): void {
    this.grokClient = client;
  }

  /**
   * Analyze an error and categorize it
   */
  analyzeError(error: string): {
    category: string;
    fixHint: string;
    matches: RegExpMatchArray | null;
  } | null {
    for (const pattern of ERROR_PATTERNS) {
      const matches = error.match(pattern.pattern);
      if (matches) {
        return {
          category: pattern.category,
          fixHint: pattern.fixHint,
          matches,
        };
      }
    }
    return null;
  }

  /**
   * Generate a fix command based on error analysis
   */
  async generateFix(
    originalCommand: string,
    error: string,
    context?: string
  ): Promise<string | null> {
    if (!this.grokClient) {
      return this.generateSimpleFix(originalCommand, error);
    }

    try {
      const prompt = `The following command failed with an error. Suggest a fix.

ORIGINAL COMMAND:
${originalCommand}

ERROR OUTPUT:
${error}

${context ? `CONTEXT:\n${context}` : ''}

Respond with ONLY the corrected command or a series of commands to fix the issue. No explanation, just the command(s).
If you need to run multiple commands, separate them with &&.
If the error cannot be fixed with commands, respond with "MANUAL_FIX_REQUIRED".`;

      const messages: GrokMessage[] = [
        { role: 'system', content: 'You are a command-line expert. You fix errors concisely.' },
        { role: 'user', content: prompt },
      ];

      const response = await this.grokClient.chat(messages, []);
      const fix = response.choices[0]?.message?.content?.trim();

      if (fix && !fix.includes('MANUAL_FIX_REQUIRED')) {
        return fix;
      }
    } catch (e) {
      // Fall back to simple fix
    }

    return this.generateSimpleFix(originalCommand, error);
  }

  /**
   * Generate a simple fix without AI
   */
  private generateSimpleFix(originalCommand: string, error: string): string | null {
    const analysis = this.analyzeError(error);
    if (!analysis) return null;

    switch (analysis.category) {
      case 'missing-module':
        const moduleName = analysis.matches?.[1];
        if (moduleName) {
          // Try to extract package name (e.g., 'lodash/fp' -> 'lodash')
          const packageName = moduleName.split('/')[0];
          return `bun add ${packageName} && ${originalCommand}`;
        }
        break;

      case 'missing-command':
        const cmdName = analysis.matches?.[1];
        if (cmdName) {
          return `which ${cmdName} || echo "Please install ${cmdName}" && ${originalCommand}`;
        }
        break;

      case 'missing-file':
        const filePath = analysis.matches?.[1];
        if (filePath) {
          const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : null;
          if (dir) {
            return `mkdir -p "${dir}" && ${originalCommand}`;
          }
        }
        break;

      case 'lint-error':
        if (originalCommand.includes('eslint') || originalCommand.includes('lint')) {
          return `${originalCommand} --fix`;
        }
        break;

      case 'npm-error':
        if (originalCommand.includes('npm')) {
          return `rm -rf node_modules && npm install && ${originalCommand}`;
        }
        break;

      case 'port-in-use':
        // Extract port number if possible
        const portMatch = error.match(/:(\d+)/);
        if (portMatch) {
          return `kill -9 $(lsof -t -i:${portMatch[1]}) 2>/dev/null || true && ${originalCommand}`;
        }
        break;
    }

    return null;
  }

  /**
   * Attempt to heal a failed command execution
   */
  async attemptHealing(
    originalCommand: string,
    error: string,
    executeCommand: (cmd: string) => Promise<ToolResult>,
    context?: string
  ): Promise<SelfHealingResult> {
    const result: SelfHealingResult = {
      success: false,
      originalError: error,
      attempts: [],
    };

    if (!this.options.enabled) {
      return result;
    }

    let currentError = error;
    let currentCommand = originalCommand;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      // Generate fix
      const fix = await this.generateFix(currentCommand, currentError, context);

      if (!fix) {
        // No fix available
        break;
      }

      const attemptResult: FixAttempt = {
        attemptNumber: attempt,
        originalError: currentError,
        fixApplied: fix,
        result: 'failure',
      };

      // Execute the fix
      try {
        const execResult = await executeCommand(fix);

        if (execResult.success) {
          attemptResult.result = 'success';
          result.success = true;
          result.finalResult = execResult;
          result.fixedCommand = fix;
          result.attempts.push(attemptResult);
          break;
        } else {
          // Fix didn't work, try again with new error
          attemptResult.result = 'failure';
          attemptResult.newError = execResult.error;
          currentError = execResult.error || 'Unknown error';
          currentCommand = fix;
        }
      } catch (e) {
        attemptResult.result = 'failure';
        attemptResult.newError = e instanceof Error ? e.message : String(e);
        currentError = attemptResult.newError;
      }

      result.attempts.push(attemptResult);
    }

    this.history.push(result);
    return result;
  }

  /**
   * Get healing history
   */
  getHistory(): SelfHealingResult[] {
    return [...this.history];
  }

  /**
   * Clear healing history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Format healing result for display
   */
  formatResult(result: SelfHealingResult): string {
    const lines: string[] = [];

    if (result.success) {
      lines.push('🔧 Self-Healing: SUCCESS');
      lines.push(`   Fixed after ${result.attempts.length} attempt(s)`);
      if (result.fixedCommand) {
        lines.push(`   Fix applied: ${result.fixedCommand}`);
      }
    } else {
      lines.push('🔧 Self-Healing: FAILED');
      lines.push(`   Tried ${result.attempts.length} fix(es)`);
      lines.push(`   Original error: ${result.originalError.slice(0, 100)}...`);
    }

    if (this.options.verbose) {
      lines.push('');
      lines.push('   Attempts:');
      for (const attempt of result.attempts) {
        lines.push(`   ${attempt.attemptNumber}. ${attempt.fixApplied}`);
        lines.push(`      Result: ${attempt.result}`);
        if (attempt.newError) {
          lines.push(`      New error: ${attempt.newError.slice(0, 50)}...`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAttempts: number;
    successfulHeals: number;
    failedHeals: number;
    successRate: string;
  } {
    const successful = this.history.filter(r => r.success).length;
    const total = this.history.length;

    return {
      totalAttempts: total,
      successfulHeals: successful,
      failedHeals: total - successful,
      successRate: total > 0 ? `${((successful / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<SelfHealingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): SelfHealingOptions {
    return { ...this.options };
  }
}

// Singleton instance
let selfHealingEngineInstance: SelfHealingEngine | null = null;

export function getSelfHealingEngine(): SelfHealingEngine {
  if (!selfHealingEngineInstance) {
    selfHealingEngineInstance = new SelfHealingEngine();
  }
  return selfHealingEngineInstance;
}

export function resetSelfHealingEngine(): void {
  selfHealingEngineInstance = null;
}
