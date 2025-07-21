export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: any;
}

export interface Tool {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<ToolResult>;
}

export interface EditorCommand {
  command: 'view' | 'str_replace' | 'create' | 'insert' | 'undo_edit';
  path?: string;
  old_str?: string;
  new_str?: string;
  content?: string;
  insert_line?: number;
  view_range?: [number, number];
}

export interface AgentState {
  currentDirectory: string;
  editHistory: EditorCommand[];
  tools: Tool[];
}

export interface ConfirmationState {
  skipThisSession: boolean;
  pendingOperation: boolean;
}

// Context Management Types
export interface AgentWorkItem {
  type: 'assistant_message' | 'tool_call' | 'tool_result';
  message: any; // GrokMessage type - keeping flexible for now
  toolCall?: any; // GrokToolCall type
  toolResult?: ToolResult;
  timestamp: Date;
}

export interface ConversationTurn {
  id: string;
  userMessage: any; // GrokMessage type
  agentWorkSession: AgentWorkItem[];
  isComplete: boolean;
  tokenCount: number;
  timestamp: Date;
  activeFiles?: string[]; // Files that were modified/viewed in this turn
}

export interface ContextWindowConfig {
  maxTokens: number;
  bufferTokens: number;
  systemPromptTokens: number;
  minRecentTurns: number;
}