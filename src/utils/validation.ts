/**
 * Input validation utilities for Grok CLI
 * Provides security-focused validation for user inputs and tool arguments
 * @module utils/validation
 */

import * as path from 'path';
import * as os from 'os';

/**
 * Validation result with optional error message
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

/**
 * Paths that are blocked for security reasons
 */
const BLOCKED_PATHS = [
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.gnupg'),
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.config/gcloud'),
  path.join(os.homedir(), '.kube'),
  path.join(os.homedir(), '.npmrc'),
  path.join(os.homedir(), '.docker'),
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/hosts',
  '/private/etc',
  '/System',
  '/Library/Keychains',
];

/**
 * File extensions that are potentially dangerous
 */
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf',
  '.msc', '.msi', '.msp', '.reg', '.inf', '.scf',
  '.lnk', '.dll', '.so', '.dylib',
];

/**
 * Patterns that indicate path traversal attempts
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\/g,
  /\.\.$/,
  /%2e%2e/gi,
  /%252e%252e/gi,
  /\.\./,
];

/**
 * Validate a file path for security issues
 */
export function validateFilePath(filePath: string, basePath?: string): ValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required and must be a string' };
  }

  // Check for null bytes
  if (filePath.includes('\0')) {
    return { valid: false, error: 'File path contains null bytes' };
  }

  // Check for path traversal attempts
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(filePath)) {
      return { valid: false, error: 'Path traversal attempt detected' };
    }
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(filePath);

  // Check if path is within blocked directories
  for (const blockedPath of BLOCKED_PATHS) {
    if (resolvedPath.startsWith(blockedPath)) {
      return { valid: false, error: `Access to protected path blocked: ${blockedPath}` };
    }
  }

  // If base path is provided, ensure resolved path is within it
  if (basePath) {
    const resolvedBase = path.resolve(basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return { valid: false, error: 'Path is outside allowed directory' };
    }
  }

  return { valid: true, sanitized: resolvedPath };
}

/**
 * Validate a file path for write operations (stricter)
 */
export function validateWritePath(filePath: string, basePath?: string): ValidationResult {
  const baseValidation = validateFilePath(filePath, basePath);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  const resolvedPath = baseValidation.sanitized!;
  const ext = path.extname(resolvedPath).toLowerCase();

  // Check for dangerous file extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Writing to files with extension ${ext} is blocked for security`
    };
  }

  // Check for hidden system files
  const basename = path.basename(resolvedPath);
  if (basename.startsWith('.') && basename.length > 1) {
    const hiddenBlocked = ['.bashrc', '.bash_profile', '.zshrc', '.profile', '.gitconfig'];
    if (hiddenBlocked.includes(basename)) {
      return { valid: false, error: `Modifying ${basename} is blocked for security` };
    }
  }

  return { valid: true, sanitized: resolvedPath };
}

/**
 * Sanitize a string for safe shell usage
 */
export function sanitizeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = arg.replace(/\0/g, '');

  // Escape dangerous shell characters
  sanitized = sanitized
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g, '\\!')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return sanitized;
}

/**
 * Validate a bash command for security issues
 */
export function validateBashCommand(command: string): ValidationResult {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required and must be a string' };
  }

  // Check for null bytes
  if (command.includes('\0')) {
    return { valid: false, error: 'Command contains null bytes' };
  }

  // Dangerous command patterns
  const dangerousPatterns = [
    { pattern: /rm\s+(-rf?|--recursive)\s+[\/~]/i, name: 'rm -rf /' },
    { pattern: /rm\s+.*\/\s*$/i, name: 'rm directory/' },
    { pattern: />\s*\/dev\/sd[a-z]/i, name: 'write to disk device' },
    { pattern: /dd\s+.*if=.*of=\/dev/i, name: 'dd to device' },
    { pattern: /mkfs/i, name: 'format filesystem' },
    { pattern: /:()\s*{\s*:\|:&\s*};:/i, name: 'fork bomb' },
    { pattern: /chmod\s+-R\s+777\s+\//i, name: 'chmod 777 /' },
    { pattern: /wget.*\|\s*(ba)?sh/i, name: 'wget | sh' },
    { pattern: /curl.*\|\s*(ba)?sh/i, name: 'curl | sh' },
    { pattern: /sudo\s+(rm|dd|mkfs)/i, name: 'sudo with dangerous command' },
    { pattern: />\s*\/etc\//i, name: 'write to /etc/' },
    { pattern: /:\(\)\s*\{/i, name: 'function bomb variant' },
    { pattern: /\beval\s+['"]?\$\(/i, name: 'eval with command substitution' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(command)) {
      return { valid: false, error: `Dangerous command pattern detected: ${name}` };
    }
  }

  // Check for access to blocked paths
  for (const blockedPath of BLOCKED_PATHS) {
    if (command.includes(blockedPath)) {
      return { valid: false, error: `Access to protected path blocked: ${blockedPath}` };
    }
  }

  return { valid: true };
}

/**
 * Validate URL for safe fetching
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Block localhost and internal IPs
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedHosts.includes(host)) {
      return { valid: false, error: 'Requests to localhost are blocked' };
    }

    // Block internal IP ranges
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return { valid: false, error: 'Requests to internal IP addresses are blocked' };
    }

    return { valid: true, sanitized: parsed.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate JSON string
 */
export function validateJson(jsonString: string): ValidationResult {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, error: 'JSON string is required' };
  }

  try {
    JSON.parse(jsonString);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`
    };
  }
}

/**
 * Validate tool arguments against expected schema
 */
export function validateToolArgs(
  args: Record<string, unknown>,
  schema: {
    required?: string[];
    types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
  }
): ValidationResult {
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (args[field] === undefined || args[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  }

  // Check types
  if (schema.types) {
    for (const [field, expectedType] of Object.entries(schema.types)) {
      if (args[field] !== undefined) {
        const actualType = Array.isArray(args[field]) ? 'array' : typeof args[field];
        if (actualType !== expectedType) {
          return {
            valid: false,
            error: `Field ${field} must be ${expectedType}, got ${actualType}`
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Check if a string contains potential injection patterns
 */
export function containsInjectionPatterns(input: string): boolean {
  const injectionPatterns = [
    /['"`].*OR.*['"`]/i,  // SQL injection
    /<script[^>]*>/i,      // XSS
    /javascript:/i,        // JavaScript protocol
    /on\w+\s*=/i,         // Event handlers
    /\$\{.*\}/,           // Template injection
    /\{\{.*\}\}/,         // Template injection
  ];

  return injectionPatterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize user input for display
 */
export function sanitizeForDisplay(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate and sanitize a search query
 */
export function validateSearchQuery(query: string): ValidationResult {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Search query is required' };
  }

  if (query.length > 1000) {
    return { valid: false, error: 'Search query is too long (max 1000 characters)' };
  }

  // Remove potentially dangerous regex metacharacters if not using regex mode
  const sanitized = query.replace(/[\[\]{}()*+?.,\\^$|#]/g, '\\$&');

  return { valid: true, sanitized };
}
