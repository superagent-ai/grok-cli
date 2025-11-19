/**
 * Application-wide constants
 * Centralized configuration values to avoid magic numbers/strings
 */

// Agent Configuration
export const AGENT_CONFIG = {
  MAX_TOOL_ROUNDS: 400,
  DEFAULT_TIMEOUT: 360000, // 6 minutes
  DEFAULT_MAX_TOKENS: 1536,
} as const;

// File Operations
export const FILE_CONFIG = {
  MAX_FILE_SIZE: 1024 * 1024, // 1MB
  MAX_BUFFER_SIZE: 1024 * 1024, // 1MB for bash commands
  DIFF_CONTEXT_LINES: 3,
} as const;

// History Configuration
export const HISTORY_CONFIG = {
  MAX_HISTORY_SIZE: 1000,
} as const;

// MCP Configuration
export const MCP_CONFIG = {
  CLIENT_NAME: 'ax-cli',
  CLIENT_VERSION: '1.0.0',
  DEFAULT_TIMEOUT: 30000, // 30 seconds
} as const;

// UI Configuration
export const UI_CONFIG = {
  STATUS_UPDATE_INTERVAL: 2000, // 2 seconds
  PROCESSING_TIMER_INTERVAL: 1000, // 1 second
} as const;

// Token Counting
export const TOKEN_CONFIG = {
  TOKENS_PER_MESSAGE: 3,
  TOKENS_FOR_REPLY_PRIMING: 3,
  DEFAULT_MODEL: 'gpt-4',
  DEFAULT_ENCODING: 'cl100k_base',
} as const;

// Tool Names
export const TOOL_NAMES = {
  BASH: 'execute_bash',
  TEXT_EDITOR: 'str_replace_editor',
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_to_file',
  LIST_FILES: 'list_files',
  SEARCH: 'search_files',
  CREATE_TODO: 'create_todo_list',
  UPDATE_TODO: 'update_todo_list',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  API_KEY_REQUIRED: 'API key required. Set GROK_API_KEY environment variable, use --api-key flag, or save to ~/.grok/user-settings.json',
  TRANSPORT_CONFIG_REQUIRED: 'Transport configuration is required',
  TOOL_NOT_FOUND: (toolName: string) => `Tool ${toolName} not found`,
  SERVER_NOT_CONNECTED: (serverName: string) => `Server ${serverName} not connected`,
  FILE_NOT_FOUND: (filePath: string) => `File not found: ${filePath}`,
  DIRECTORY_NOT_FOUND: (dirPath: string) => `Directory not found: ${dirPath}`,
} as const;
