/**
 * Path validation utilities to prevent security issues
 * Protects against path traversal attacks and invalid file operations
 */

import * as path from 'path';
import { z } from 'zod';

/**
 * Path validation schema
 */
export const PathSchema = z.string().min(1).refine(
  (filePath) => {
    // Prevent path traversal attempts
    const normalized = path.normalize(filePath);

    // Check for suspicious patterns
    return (
      !normalized.includes('..') &&
      !normalized.startsWith('/etc') &&
      !normalized.startsWith('/sys') &&
      !normalized.startsWith('/proc')
    );
  },
  {
    message: 'Invalid or potentially dangerous file path',
  }
);

/**
 * Validate and resolve a file path safely
 * @throws Error if path is invalid or dangerous
 */
export function validatePath(filePath: string): string {
  const result = PathSchema.safeParse(filePath);

  if (!result.success) {
    throw new Error(`Invalid path: ${result.error.message}`);
  }

  return path.resolve(filePath);
}

/**
 * Check if a path is within a specific directory
 */
export function isPathWithin(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);

  return resolvedPath.startsWith(resolvedBase);
}

/**
 * Safely join paths with validation
 */
export function safeJoin(...paths: string[]): string {
  const joined = path.join(...paths);
  return validatePath(joined);
}

/**
 * Check if path is safe for file operations
 */
export function isPathSafe(filePath: string): boolean {
  try {
    validatePath(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get relative path safely
 */
export function safeRelative(from: string, to: string): string {
  const validFrom = validatePath(from);
  const validTo = validatePath(to);
  return path.relative(validFrom, validTo);
}
