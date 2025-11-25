/**
 * Core type definitions for Grok CLI
 * @module types
 */

/**
 * Result returned by all tool executions
 */
export interface ToolResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** Output message on success */
  output?: string;
  /** Error message on failure */
  error?: string;
  /** Additional structured data from the tool */
  data?: ToolResultData;
}

/**
 * Structured data that can be returned by tools
 */
export type ToolResultData =
  | string
  | number
  | boolean
  | null
  | ToolResultData[]
  | { [key: string]: ToolResultData };

/**
 * Generic tool arguments type
 */
export type ToolArgs = Record<string, string | number | boolean | string[] | undefined>;

/**
 * Base interface for all tools
 */
export interface Tool {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Execute the tool with given arguments */
  execute: (args: ToolArgs) => Promise<ToolResult>;
}

/**
 * Editor command types
 */
export type EditorCommandType = 'view' | 'str_replace' | 'create' | 'insert' | 'undo_edit';

/**
 * Editor command structure for tracking edit history
 */
export interface EditorCommand {
  /** Type of editor command */
  command: EditorCommandType;
  /** File path being edited */
  path?: string;
  /** Original string to replace (for str_replace) */
  old_str?: string;
  /** New string to insert (for str_replace) */
  new_str?: string;
  /** Content for file creation or insertion */
  content?: string;
  /** Line number for insertion */
  insert_line?: number;
  /** Range of lines to view [start, end] */
  view_range?: [number, number];
  /** Whether to replace all occurrences */
  replace_all?: boolean;
}

/**
 * State of the agent during execution
 */
export interface AgentState {
  /** Current working directory */
  currentDirectory: string;
  /** History of editor commands for undo support */
  editHistory: EditorCommand[];
  /** Available tools */
  tools: Tool[];
}

/**
 * State for confirmation dialogs
 */
export interface ConfirmationState {
  /** Whether to skip confirmations for this session */
  skipThisSession: boolean;
  /** Whether there's a pending confirmation */
  pendingOperation: boolean;
}

/**
 * Session flags for tracking user preferences
 */
export interface SessionFlags {
  /** Auto-approve file operations */
  fileOperations: boolean;
  /** Auto-approve bash commands */
  bashCommands: boolean;
  /** Auto-approve all operations */
  allOperations: boolean;
}

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Chat message structure
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Message content */
  content: string;
  /** Optional tool call ID for tool responses */
  tool_call_id?: string;
  /** Optional name for tool messages */
  name?: string;
  /** Timestamp of the message */
  timestamp?: number;
}

/**
 * Tool call structure from API
 */
export interface ToolCall {
  /** Unique ID for this tool call */
  id: string;
  /** Type is always 'function' for function calls */
  type: 'function';
  /** Function details */
  function: {
    /** Function name */
    name: string;
    /** JSON string of arguments */
    arguments: string;
  };
}

/**
 * Parsed tool call with typed arguments
 */
export interface ParsedToolCall {
  /** Unique ID for this tool call */
  id: string;
  /** Function name */
  name: string;
  /** Parsed arguments object */
  args: ToolArgs;
}

/**
 * Security mode levels
 */
export type SecurityMode = 'suggest' | 'auto-edit' | 'full-auto';

/**
 * Risk level for operations
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Operation requiring confirmation
 */
export interface ConfirmationRequest {
  /** Description of the operation */
  operation: string;
  /** Filename or target involved */
  filename: string;
  /** Whether to show VS Code open option */
  showVSCodeOpen: boolean;
  /** Content preview or description */
  content?: string;
  /** Risk level of the operation */
  riskLevel?: RiskLevel;
}

/**
 * Result of a confirmation request
 */
export interface ConfirmationResult {
  /** Whether the user confirmed */
  confirmed: boolean;
  /** Optional feedback from user */
  feedback?: string;
  /** Whether to skip future confirmations of this type */
  skipFuture?: boolean;
}

/**
 * File operation types
 */
export type FileOperation = 'read' | 'write' | 'delete' | 'create' | 'move' | 'copy';

/**
 * File info structure
 */
export interface FileInfo {
  /** File path */
  path: string;
  /** File name */
  name: string;
  /** Whether it's a directory */
  isDirectory: boolean;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedTime: number;
  /** File extension */
  extension: string;
}

/**
 * Search result from code search
 */
export interface CodeSearchResult {
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Matched text */
  text: string;
  /** The specific match */
  match: string;
}

/**
 * Project type detection
 */
export type ProjectType =
  | 'node'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'unknown';

/**
 * Project info
 */
export interface ProjectInfo {
  /** Detected project type */
  type: ProjectType;
  /** Project root directory */
  root: string;
  /** Package manager (npm, yarn, pnpm, pip, cargo, etc.) */
  packageManager?: string;
  /** Project name from config files */
  name?: string;
  /** Project version */
  version?: string;
}
