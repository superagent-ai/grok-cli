export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ChatEntry {
  type: "user" | "assistant" | "tool_call" | "tool_result" | "search_result";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  isStreaming?: boolean;
}

export interface StreamChunk {
  type: "content" | "tool_calls" | "tool_result" | "search_result" | "done" | "error" | "reasoning";
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
  { id: "agent", label: "Agent", color: "#ffffff" },
  { id: "plan", label: "Plan", color: "#808080" },
  { id: "ask", label: "Ask", color: "#808080" },
];
