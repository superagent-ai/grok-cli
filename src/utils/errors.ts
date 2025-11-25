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
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry,
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

      // Notify about retry if callback provided
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Error thrown when security validation fails
 */
export class SecurityError extends GrokError {
  constructor(message: string, public operation?: string) {
    super(message, 'SECURITY_ERROR', { operation });
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends GrokError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', { retryAfter });
  }
}

/**
 * Error thrown when permission is denied
 */
export class PermissionError extends GrokError {
  constructor(message: string, public resource?: string) {
    super(message, 'PERMISSION_ERROR', { resource });
  }
}

/**
 * Error thrown when a feature is not supported
 */
export class NotSupportedError extends GrokError {
  constructor(message: string, public feature?: string) {
    super(message, 'NOT_SUPPORTED_ERROR', { feature });
  }
}

/**
 * Error thrown when operation is cancelled
 */
export class CancellationError extends GrokError {
  constructor(message: string = 'Operation cancelled') {
    super(message, 'CANCELLATION_ERROR');
  }
}

/**
 * Wraps an async function to catch and transform errors
 */
export function wrapAsync<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  errorTransformer?: (error: unknown) => Error
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorTransformer) {
        throw errorTransformer(error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Creates a formatted error message with context
 */
export function formatErrorWithContext(
  error: unknown,
  context: Record<string, unknown>
): string {
  const message = getErrorMessage(error);
  const contextStr = Object.entries(context)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');
  return `${message} [${contextStr}]`;
}

/**
 * Extracts error code from various error types
 */
export function getErrorCode(error: unknown): string {
  if (isGrokError(error) && error.code) {
    return error.code;
  }
  if (error instanceof Error && 'code' in error) {
    return String((error as Error & { code: unknown }).code);
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Creates a user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isGrokError(error)) {
    switch (error.code) {
      case 'API_KEY_ERROR':
        return 'Please set your API key using GROK_API_KEY environment variable or run `grok init`';
      case 'API_ERROR':
        return 'The API request failed. Please check your connection and try again.';
      case 'NETWORK_ERROR':
        return 'Network connection failed. Please check your internet connection.';
      case 'TIMEOUT_ERROR':
        return 'The operation took too long. Please try again.';
      case 'FILE_NOT_FOUND':
        return `File not found: ${(error as FileNotFoundError).filePath}`;
      case 'INVALID_COMMAND':
        return 'This command is blocked for security reasons.';
      case 'SECURITY_ERROR':
        return 'This operation was blocked for security reasons.';
      case 'RATE_LIMIT_ERROR':
        return 'Rate limit exceeded. Please wait a moment before trying again.';
      case 'PERMISSION_ERROR':
        return 'Permission denied. You may not have access to this resource.';
      default:
        return error.message;
    }
  }
  return getErrorMessage(error);
}

/**
 * Determines if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof TimeoutError) {
    return true;
  }
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof APIError) {
    // Retry on 5xx errors and 429
    const status = error.statusCode;
    return status !== undefined && (status >= 500 || status === 429);
  }
  return false;
}

/**
 * Safely runs a function and returns a result object
 */
export async function safeExecute<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(getErrorMessage(error)),
    };
  }
}

/**
 * Asserts a condition and throws a GrokError if false
 */
export function assertCondition(
  condition: boolean,
  message: string,
  ErrorClass: typeof GrokError = GrokError
): asserts condition {
  if (!condition) {
    throw new ErrorClass(message);
  }
}

/**
 * Creates an error boundary for async operations
 */
export function createErrorBoundary<T>(
  operation: string,
  handler?: (error: unknown) => T | Promise<T>
): (fn: () => Promise<T>) => Promise<T> {
  return async (fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (handler) {
        return handler(error);
      }
      throw new GrokError(
        `Error in ${operation}: ${getErrorMessage(error)}`,
        'OPERATION_ERROR',
        { operation, originalError: error }
      );
    }
  };
}
