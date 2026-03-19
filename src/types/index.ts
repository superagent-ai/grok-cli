export interface FileDiff {
  filePath: string;
  additions: number;
  removals: number;
  patch: string;
  isNew: boolean;
}

export interface PlanStep {
  title: string;
  description: string;
  filePaths?: string[];
}

export interface PlanQuestion {
  id: string;
  question: string;
  header?: string;
  type: "select" | "multiselect" | "text";
  options?: { id: string; label: string }[];
}

export interface Plan {
  title: string;
  summary: string;
  steps: PlanStep[];
  questions?: PlanQuestion[];
}

export interface TaskRequest {
  agent: "general" | "explore";
  description: string;
  prompt: string;
}

export interface TaskRun {
  agent: "general" | "explore";
  description: string;
  summary: string;
  activity?: string;
}

export type DelegationStatus = "running" | "complete" | "error";

export interface DelegationRun {
  id: string;
  agent: "explore";
  description: string;
  summary: string;
  status: DelegationStatus;
}

export interface SubagentStatus {
  agent: "general" | "explore";
  description: string;
  detail: string;
}

export interface BackgroundProcessInfo {
  id: number;
  pid: number;
  command: string;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  diff?: FileDiff;
  plan?: Plan;
  task?: TaskRun;
  delegation?: DelegationRun;
  backgroundProcess?: BackgroundProcessInfo;
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
  modeColor?: string;
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

export interface Skill {
  id: string;
  title: string;
  description: string;
  executable?: boolean;
}

export type AgentMode = "agent" | "plan" | "ask";

export const MODES: { id: AgentMode; label: string; color: string }[] = [
  { id: "agent", label: "Agent", color: "#5c9cf5" },
  { id: "plan", label: "Plan", color: "#e5c07b" },
  { id: "ask", label: "Ask", color: "#22c55e" },
];
