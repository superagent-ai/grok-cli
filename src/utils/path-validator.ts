import path from 'path';
import fs from 'fs-extra';

/**
 * List of sensitive files that should not be accessed
 */
const SENSITIVE_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'credentials.json',
  'secrets.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '.ssh',
  'private.key',
  'private.pem',
  '.npmrc',
  '.yarnrc',
  '.gitconfig',
];

/**
 * Validates a file path to prevent path traversal attacks and access to sensitive files
 *
 * @param inputPath - The path to validate (can be relative or absolute)
 * @param workingDir - The base working directory
 * @returns The resolved absolute path if valid
 * @throws {Error} If path traversal is detected or access to sensitive file is attempted
 *
 * @example
 * ```typescript
 * const safePath = validatePath('../config.json', '/home/user/project');
 * // Returns: '/home/user/project/config.json'
 * ```
 */
export function validatePath(inputPath: string, workingDir: string): string {
  // Resolve the path to absolute
  const resolvedPath = path.resolve(workingDir, inputPath);

  // Check if resolved path is within working directory (prevent path traversal)
  if (!resolvedPath.startsWith(workingDir)) {
    throw new Error(`Path traversal detected: "${inputPath}" resolves outside working directory`);
  }

  // Check if it's in .ssh directory (check first before filename)
  const dirname = path.basename(path.dirname(resolvedPath));
  if (dirname === '.ssh' || resolvedPath.includes('/.ssh/')) {
    throw new Error(`Access to .ssh directory is not allowed`);
  }

  // Check for sensitive files
  const basename = path.basename(resolvedPath);
  if (SENSITIVE_FILES.includes(basename)) {
    throw new Error(`Access to sensitive file "${basename}" is not allowed`);
  }

  return resolvedPath;
}

/**
 * Validates a directory path for safe operations
 *
 * @param inputPath - The directory path to validate
 * @param workingDir - The base working directory
 * @returns The resolved absolute directory path if valid
 * @throws {Error} If validation fails
 */
export async function validateDirectoryPath(
  inputPath: string,
  workingDir: string
): Promise<string> {
  const resolvedPath = validatePath(inputPath, workingDir);

  // Check if path exists and is a directory
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path "${inputPath}" is not a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Directory doesn't exist yet - this might be okay for create operations
      return resolvedPath;
    }
    throw error;
  }

  return resolvedPath;
}

/**
 * Validates a file path for safe file operations
 *
 * @param inputPath - The file path to validate
 * @param workingDir - The base working directory
 * @param mustExist - Whether the file must already exist
 * @returns The resolved absolute file path if valid
 * @throws {Error} If validation fails
 */
export async function validateFilePath(
  inputPath: string,
  workingDir: string,
  mustExist = false
): Promise<string> {
  const resolvedPath = validatePath(inputPath, workingDir);

  if (mustExist) {
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Path "${inputPath}" is not a file`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File "${inputPath}" does not exist`);
      }
      throw error;
    }
  }

  return resolvedPath;
}

/**
 * Checks if a path is safe to access (doesn't throw, returns boolean)
 *
 * @param inputPath - The path to check
 * @param workingDir - The base working directory
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(inputPath: string, workingDir: string): boolean {
  try {
    validatePath(inputPath, workingDir);
    return true;
  } catch {
    return false;
  }
}
