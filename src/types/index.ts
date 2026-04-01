import type { ModelMessage } from "ai";

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

export type BuiltinSubagentId = "general" | "explore" | "vision" | "verify" | "verify-detect" | "computer";

export interface TaskRequest {
  agent: BuiltinSubagentId | string;
  description: string;
  prompt: string;
}

export interface TaskRun {
  agent: string;
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
  agent: string;
  description: string;
  detail: string;
}

export interface BackgroundProcessInfo {
  id: number;
  pid: number;
  command: string;
}

export interface MediaAsset {
  kind: "image" | "video";
  path: string;
  url?: string;
  mediaType?: string;
  prompt?: string;
  sourcePath?: string;
  sourceUrl?: string;
  durationSeconds?: number;
  modelId?: string;
}

export interface ComputerToolMetadata {
  action: string;
  path?: string;
  hint?: string;
  ref?: string;
  app?: string;
  windowId?: string;
}

export interface VerifyRecipe {
  ecosystem: string;
  appKind: string;
  appLabel: string;
  shellInitCommands: string[];
  bootstrapCommands: string[];
  installCommands: string[];
  buildCommands: string[];
  testCommands: string[];
  startCommand?: string;
  startPort?: string;
  smokeKind: "http" | "cli" | "none";
  smokeTarget?: string;
  evidence: string[];
  notes: string[];
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
  media?: MediaAsset[];
  computer?: ComputerToolMetadata;
  verifyRecipe?: VerifyRecipe;
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
  remoteKey?: string;
  sourceLabel?: string;
  queued?: boolean;
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

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  reasoning: boolean;
  description: string;
  aliases?: string[];
  responsesOnly?: boolean;
  multiAgent?: boolean;
  supportsClientTools?: boolean;
  supportsMaxOutputTokens?: boolean;
  defaultReasoningEffort?: ReasoningEffort;
  supportsReasoningEffort?: boolean;
}

export type AgentMode = "agent" | "plan" | "ask";
export type SessionStatus = "active" | "archived";
export type UsageSource = "message" | "title" | "task" | "delegation" | "other";

export interface WorkspaceInfo {
  id: string;
  scopeKey: string;
  canonicalPath: string;
  gitRoot: string | null;
  displayName: string;
  lastSeenAt: Date;
}

export interface SessionInfo {
  id: string;
  workspaceId: string;
  title: string | null;
  model: string;
  mode: AgentMode;
  cwdAtStart: string;
  cwdLast: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageEvent {
  id: number;
  sessionId: string;
  messageSeq: number | null;
  source: UsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: number;
  createdAt: Date;
}

export interface SessionSnapshot {
  workspace: WorkspaceInfo;
  session: SessionInfo;
  messages: ModelMessage[];
  entries: ChatEntry[];
  totalTokens: number;
}

export const MODES: { id: AgentMode; label: string; color: string }[] = [
  { id: "agent", label: "Agent", color: "#5c9cf5" },
  { id: "plan", label: "Plan", color: "#e5c07b" },
  { id: "ask", label: "Ask", color: "#22c55e" },
];
