export type TurnStatus = "success" | "error" | "aborted";

export type GhostAcceptKey = "space" | "right";

export interface SuggesterSettings {
  enabled?: boolean;
  model?: string;
  seederModel?: string;
  maxSuggestionChars?: number;
  ghostAcceptKeys?: GhostAcceptKey[];
  fastPathContinueOnError?: boolean;
  autoAccept?: boolean;
  customInstruction?: string;
  reseedEnabled?: boolean;
  reseedTurnInterval?: number;
}

export interface ResolvedSuggesterSettings {
  enabled: boolean;
  model: string;
  seederModel: string;
  maxSuggestionChars: number;
  ghostAcceptKeys: GhostAcceptKey[];
  fastPathContinueOnError: boolean;
  autoAccept: boolean;
  customInstruction: string;
  reseedEnabled: boolean;
  reseedTurnInterval: number;
}

export interface SuggestionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  modelId?: string;
}

export interface LastSuggestion {
  text: string;
  shownAt: string;
  turnStatus: TurnStatus;
}

export type SteeringClassification = "accepted_exact" | "accepted_edited" | "changed_course";

export interface SteeringEvent {
  classification: SteeringClassification;
  suggestedPrompt: string;
  actualUserPrompt: string;
  similarity: number;
  at: string;
}

export interface SuggesterSessionState {
  lastSuggestion?: LastSuggestion;
  lastUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    modelId: string;
  };
  suggestionUsage: SuggestionUsage;
  seederUsage: SuggestionUsage;
  steeringHistory: SteeringEvent[];
  turnsSinceLastStalenessCheck: number;
}

export interface SuggestionPromptContext {
  turnStatus: TurnStatus;
  abortContextNote?: string;
  latestAssistantTurn: string;
  recentUserPrompts: string[];
  toolSignals: string[];
  touchedFiles: string[];
  unresolvedQuestions: string[];
  recentChanged: Array<{ suggestedPrompt: string; actualUserPrompt: string }>;
  customInstruction: string;
  intentSeed: string;
  maxSuggestionChars: number;
  noSuggestionToken: string;
}

export interface SuggestionTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface SuggestionResult {
  kind: "suggestion" | "no_suggestion";
  text: string;
  usage?: SuggestionTokenUsage;
  modelId?: string;
}
