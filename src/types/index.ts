export interface FileDiff {
  filePath: string;
  additions: number;
  removals: number;
  patch: string;
  isNew: boolean;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  diff?: FileDiff;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatEntry {
  type: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface StreamChunk {
  type: "content" | "tool_calls" | "tool_result" | "done" | "error" | "reasoning";
  content?: string;
  toolCalls?: ToolCall[];
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  reasoning: boolean;
  description: string;
}

export type AgentMode = "agent" | "plan" | "ask";

export const MODES: { id: AgentMode; label: string; color: string }[] = [
  { id: "agent", label: "Agent", color: "#5c9cf5" },
  { id: "plan", label: "Plan", color: "#e5c07b" },
  { id: "ask", label: "Ask", color: "#22c55e" },
];
