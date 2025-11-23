/**
 * Custom error classes for Grok CLI
 */

/**
 * Base error class for all Grok CLI errors
 */
export class GrokError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Error thrown when API key is missing or invalid
 */
export class APIKeyError extends GrokError {
  constructor(message: string = 'No API key found') {
    super(message, 'API_KEY_ERROR');
  }
}

/**
 * Error thrown when API request fails
 */
export class APIError extends GrokError {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message, 'API_ERROR', { statusCode, response });
  }
}

/**
 * Error thrown when network request fails
 */
export class NetworkError extends GrokError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'NETWORK_ERROR', originalError);
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends GrokError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT_ERROR', { timeoutMs });
  }
}

/**
 * Error thrown when file operation fails
 */
export class FileError extends GrokError {
  constructor(
    message: string,
    public filePath: string,
    public operation: 'read' | 'write' | 'delete' | 'create'
  ) {
    super(message, 'FILE_ERROR', { filePath, operation });
  }
}

/**
 * Error thrown when file is not found
 */
export class FileNotFoundError extends FileError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, filePath, 'read');
    this.code = 'FILE_NOT_FOUND';
  }
}

/**
 * Error thrown when tool execution fails
 */
export class ToolExecutionError extends GrokError {
  constructor(
    message: string,
    public toolName: string,
    public toolArgs?: unknown
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', { toolName, toolArgs });
  }
}

/**
 * Error thrown when bash command is invalid or dangerous
 */
export class InvalidCommandError extends GrokError {
  constructor(message: string, public command: string) {
    super(message, 'INVALID_COMMAND', { command });
  }
}

/**
 * Error thrown when bash command execution fails
 */
export class CommandExecutionError extends GrokError {
  constructor(
    message: string,
    public command: string,
    public exitCode?: number,
    public stderr?: string
  ) {
    super(message, 'COMMAND_EXECUTION_ERROR', { command, exitCode, stderr });
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends GrokError {
  constructor(message: string, public field?: string, public value?: unknown) {
    super(message, 'VALIDATION_ERROR', { field, value });
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends GrokError {
  constructor(message: string, public configKey?: string) {
    super(message, 'CONFIGURATION_ERROR', { configKey });
  }
}

/**
 * Checks if an error is a GrokError or subclass
 */
export function isGrokError(error: unknown): error is GrokError {
  return error instanceof GrokError;
}

/**
 * Safely extracts error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Wraps a promise with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Retries a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}
