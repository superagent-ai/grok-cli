import shellEscape from 'shell-escape';

/**
 * List of allowed shell commands for security
 * Only these commands can be executed through the bash tool
 */
const ALLOWED_COMMANDS = [
  // File operations
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'file',
  'find',
  'grep',
  'awk',
  'sed',
  'sort',
  'uniq',
  'diff',
  'tree',

  // Directory operations
  'cd',
  'pwd',
  'mkdir',
  'rmdir',

  // Git operations
  'git',

  // Package managers
  'npm',
  'yarn',
  'pnpm',
  'node',

  // Build tools
  'tsc',
  'eslint',
  'prettier',
  'webpack',
  'vite',
  'rollup',

  // Testing
  'jest',
  'vitest',
  'mocha',
  'pytest',

  // Other safe commands
  'echo',
  'date',
  'which',
  'whereis',
  'env',
  'printenv',
];

/**
 * Dangerous command patterns that should never be allowed
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, // rm -rf /
  /:\(\)\{/, // Fork bomb
  />\s*\/dev\/sda/, // Writing to disk
  /dd\s+if=/, // Disk operations
  /mkfs/, // Format disk
  /chmod\s+777/, // Dangerous permissions
  /curl.*\|\s*sh/, // Pipe to shell
  /wget.*\|\s*sh/, // Pipe to shell
  /eval/, // Eval execution
  /exec/, // Exec execution
];

/**
 * Configuration for command validation
 */
export interface CommandValidationConfig {
  /**
   * Whether to use whitelist validation (only allowed commands)
   * If false, only dangerous patterns are blocked
   */
  useWhitelist: boolean;

  /**
   * Additional commands to allow (on top of default list)
   */
  additionalAllowedCommands?: string[];

  /**
   * Maximum command length
   */
  maxCommandLength?: number;
}

const DEFAULT_CONFIG: CommandValidationConfig = {
  useWhitelist: false, // By default, allow all except dangerous
  maxCommandLength: 10000,
};

/**
 * Validates a shell command for security
 *
 * @param command - The command to validate
 * @param config - Validation configuration
 * @returns The validated command
 * @throws {Error} If command is not allowed or contains dangerous patterns
 *
 * @example
 * ```typescript
 * const safeCommand = validateCommand('ls -la', { useWhitelist: true });
 * // Returns: 'ls -la'
 *
 * validateCommand('rm -rf /', { useWhitelist: true });
 * // Throws: Error
 * ```
 */
export function validateCommand(
  command: string,
  config: Partial<CommandValidationConfig> = {}
): string {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Check command length
  if (finalConfig.maxCommandLength && command.length > finalConfig.maxCommandLength) {
    throw new Error(`Command exceeds maximum length of ${finalConfig.maxCommandLength} characters`);
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command contains dangerous pattern: ${pattern.source}`);
    }
  }

  // If whitelist is enabled, check if command is allowed
  if (finalConfig.useWhitelist) {
    const commandParts = command.trim().split(/\s+/);
    const baseCommand = commandParts[0];

    const allowedCommands = [...ALLOWED_COMMANDS, ...(finalConfig.additionalAllowedCommands || [])];

    if (!allowedCommands.includes(baseCommand)) {
      throw new Error(
        `Command "${baseCommand}" is not in the whitelist. Allowed commands: ${allowedCommands.join(', ')}`
      );
    }
  }

  return command;
}

/**
 * Sanitizes command arguments by escaping shell special characters
 *
 * @param args - Array of command arguments
 * @returns Escaped command string
 *
 * @example
 * ```typescript
 * const escaped = sanitizeCommandArgs(['ls', '-la', 'file name.txt']);
 * // Returns: "ls -la 'file name.txt'"
 * ```
 */
export function sanitizeCommandArgs(args: string[]): string {
  return shellEscape(args);
}

/**
 * Checks if a command is safe to execute (doesn't throw, returns boolean)
 *
 * @param command - The command to check
 * @param config - Validation configuration
 * @returns true if command is safe, false otherwise
 */
export function isCommandSafe(
  command: string,
  config: Partial<CommandValidationConfig> = {}
): boolean {
  try {
    validateCommand(command, config);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the base command from a command string
 *
 * @param command - The full command string
 * @returns The base command (first word)
 */
export function getBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0];
}
