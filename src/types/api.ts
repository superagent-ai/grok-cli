/**
 * Type definitions for API interactions
 * Replaces loose 'any' types with proper interfaces
 */

/**
 * Tool function definition for function calling
 */
export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

/**
 * Parameter definition for tool functions
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

/**
 * Tool call made by the model
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Parsed tool call arguments
 */
export interface ParsedToolCall<T = Record<string, unknown>> {
  id: string;
  name: string;
  arguments: T;
}

/**
 * Message content for API requests
 */
export type MessageContent = string | MessageContentPart[];

/**
 * Content part for multimodal messages
 */
export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/**
 * Chat message for API requests
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * API request payload
 */
export interface ChatRequestPayload {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'none' | 'auto' | 'required' | ToolChoiceFunction;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  search_parameters?: SearchParameters;
}

/**
 * Tool definition for API
 */
export interface ToolDefinition {
  type: 'function';
  function: ToolFunction;
}

/**
 * Forced tool choice
 */
export interface ToolChoiceFunction {
  type: 'function';
  function: {
    name: string;
  };
}

/**
 * Search parameters for web search
 */
export interface SearchParameters {
  mode?: 'auto' | 'on' | 'off';
}

/**
 * API response choice
 */
export interface ResponseChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * Full API response
 */
export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Streaming chunk delta
 */
export interface StreamDelta {
  role?: 'assistant';
  content?: string;
  tool_calls?: Partial<ToolCall>[];
}

/**
 * Streaming chunk choice
 */
export interface StreamChoice {
  index: number;
  delta: StreamDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/**
 * Streaming response chunk
 */
export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamChoice[];
}

/**
 * Accumulated message during streaming
 */
export interface AccumulatedMessage {
  role?: 'assistant';
  content?: string;
  tool_calls?: ToolCall[];
}

/**
 * Type guard for checking if a value is a ToolCall
 */
export function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.type === 'function' &&
    typeof obj.function === 'object' &&
    obj.function !== null &&
    typeof (obj.function as Record<string, unknown>).name === 'string' &&
    typeof (obj.function as Record<string, unknown>).arguments === 'string'
  );
}

/**
 * Parse tool call arguments safely
 */
export function parseToolArguments<T = Record<string, unknown>>(
  toolCall: ToolCall
): ParsedToolCall<T> {
  try {
    const args = JSON.parse(toolCall.function.arguments) as T;
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
    };
  } catch (error) {
    throw new Error(`Failed to parse tool arguments: ${error}`);
  }
}

/**
 * Type guard for checking if finish reason indicates tool calls
 */
export function hasToolCalls(choice: ResponseChoice | StreamChoice): boolean {
  return choice.finish_reason === 'tool_calls';
}
