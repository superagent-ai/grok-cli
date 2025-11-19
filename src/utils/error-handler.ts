/**
 * Centralized error handling utilities
 * Provides consistent error messages and logging
 */

import { ToolResult } from '../types/index.js';

/**
 * Standard error categories
 */
export enum ErrorCategory {
  FILE_OPERATION = 'File Operation',
  BASH_COMMAND = 'Bash Command',
  MCP_CONNECTION = 'MCP Connection',
  TOOL_EXECUTION = 'Tool Execution',
  VALIDATION = 'Validation',
  NETWORK = 'Network',
  CONFIGURATION = 'Configuration',
}

/**
 * Create a standardized error message
 */
export function createErrorMessage(
  category: ErrorCategory,
  operation: string,
  error: unknown
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `[${category}] ${operation} failed: ${errorMessage}`;
}

/**
 * Create a standardized ToolResult error
 */
export function createToolError(
  category: ErrorCategory,
  operation: string,
  error: unknown
): ToolResult {
  return {
    success: false,
    error: createErrorMessage(category, operation, error),
  };
}

/**
 * Create a standardized ToolResult success
 */
export function createToolSuccess(output: string): ToolResult {
  return {
    success: true,
    output,
  };
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T>(
  json: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(json) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

/**
 * Wrap async operation with consistent error handling
 */
export async function wrapToolOperation<T>(
  category: ErrorCategory,
  operation: string,
  fn: () => Promise<T>
): Promise<ToolResult> {
  try {
    const result = await fn();
    return createToolSuccess(
      typeof result === 'string' ? result : JSON.stringify(result)
    );
  } catch (error) {
    return createToolError(category, operation, error);
  }
}
