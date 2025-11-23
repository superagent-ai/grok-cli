/**
 * Centralized configuration constants for Grok CLI
 */

export const AGENT_CONFIG = {
  /** Maximum number of tool execution rounds before stopping */
  MAX_TOOL_ROUNDS: 30,
  /** Default temperature for model generation */
  DEFAULT_TEMPERATURE: 0.7,
  /** Timeout for agent operations (ms) */
  AGENT_TIMEOUT: 300000, // 5 minutes
} as const;

export const SEARCH_CONFIG = {
  /** Maximum depth for directory traversal */
  MAX_DEPTH: 10,
  /** Number of context lines to show before match */
  CONTEXT_BEFORE: 3,
  /** Number of context lines to show after match */
  CONTEXT_AFTER: 3,
  /** Maximum number of search results to display */
  MAX_RESULTS: 100,
  /** Cache TTL for search results (ms) */
  CACHE_TTL: 60000, // 1 minute
} as const;

export const TEXT_EDITOR_CONFIG = {
  /** Similarity threshold for fuzzy matching (0-1) */
  SIMILARITY_THRESHOLD: 0.8,
  /** Maximum file size to edit (bytes) */
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  /** Default encoding for text files */
  DEFAULT_ENCODING: 'utf-8',
} as const;

export const BASH_CONFIG = {
  /** Timeout for bash command execution (ms) */
  COMMAND_TIMEOUT: 30000, // 30 seconds
  /** Maximum output size to capture (bytes) */
  MAX_OUTPUT_SIZE: 1024 * 1024, // 1MB
  /** Dangerous commands that require confirmation */
  DANGEROUS_COMMANDS: [
    'rm',
    'rmdir',
    'del',
    'format',
    'mkfs',
    'dd',
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init',
  ],
  /** Blocked commands that are never allowed */
  BLOCKED_COMMANDS: [
    'fork',
    ':(){ :|:& };:',  // fork bomb
  ],
} as const;

export const UI_CONFIG = {
  /** Maximum lines to display in confirmation dialog */
  MAX_PREVIEW_LINES: 500,
  /** Refresh rate for streaming updates (ms) */
  STREAM_REFRESH_RATE: 100,
  /** Token count update interval (ms) */
  TOKEN_UPDATE_INTERVAL: 500,
} as const;

export const API_CONFIG = {
  /** Default base URL for Grok API */
  DEFAULT_BASE_URL: 'https://api.x.ai/v1',
  /** Default model */
  DEFAULT_MODEL: 'grok-beta',
  /** Request timeout (ms) */
  REQUEST_TIMEOUT: 60000, // 1 minute
  /** Maximum retries for failed requests */
  MAX_RETRIES: 3,
  /** Retry delay (ms) */
  RETRY_DELAY: 1000,
} as const;

export const PATHS = {
  /** User settings directory */
  SETTINGS_DIR: '.grok',
  /** User settings file name */
  SETTINGS_FILE: 'user-settings.json',
  /** Custom instructions file name */
  CUSTOM_INSTRUCTIONS_FILE: 'GROK.md',
  /** Cache directory name */
  CACHE_DIR: '.cache',
} as const;

export const SUPPORTED_MODELS = {
  // Grok models
  'grok-beta': { maxTokens: 131072, provider: 'xai' },
  'grok-2-1212': { maxTokens: 32768, provider: 'xai' },
  'grok-vision-beta': { maxTokens: 8192, provider: 'xai' },
  'grok-3-latest': { maxTokens: 131072, provider: 'xai' },
  'grok-3-fast': { maxTokens: 131072, provider: 'xai' },
  'grok-4-latest': { maxTokens: 131072, provider: 'xai' },
  // Claude models (when using custom base URL)
  'claude-sonnet-4-20250514': { maxTokens: 200000, provider: 'anthropic' },
  'claude-opus-4-20250514': { maxTokens: 200000, provider: 'anthropic' },
  // Gemini models (when using custom base URL)
  'gemini-2.5-pro': { maxTokens: 1000000, provider: 'google' },
  'gemini-2.5-flash': { maxTokens: 1000000, provider: 'google' },
} as const;

export const TOKEN_LIMITS = {
  /** Token limit for grok-beta */
  'grok-beta': 131072,
  /** Token limit for grok-2-1212 */
  'grok-2-1212': 32768,
  /** Token limit for grok-vision-beta */
  'grok-vision-beta': 8192,
  /** Token limit for other models */
  'default': 8192,
} as const;

export const ERROR_MESSAGES = {
  NO_API_KEY: 'No API key found. Please set XAI_API_KEY environment variable or provide --api-key flag.',
  TOOL_EXECUTION_FAILED: 'Tool execution failed',
  FILE_NOT_FOUND: 'File not found',
  INVALID_COMMAND: 'Invalid or dangerous command',
  NETWORK_ERROR: 'Network error occurred',
  TIMEOUT_ERROR: 'Operation timed out',
} as const;

export const SUCCESS_MESSAGES = {
  FILE_CREATED: 'File created successfully',
  FILE_UPDATED: 'File updated successfully',
  FILE_DELETED: 'File deleted successfully',
  COMMAND_EXECUTED: 'Command executed successfully',
} as const;
