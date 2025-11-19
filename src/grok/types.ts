/**
 * GLM-4.6 API Type Definitions
 *
 * This file contains comprehensive type definitions for GLM-4.6 API features,
 * including advanced reasoning mode, configurable parameters, and enhanced
 * response structures.
 *
 * @see https://docs.z.ai/guides/llm/glm-4.6
 */

import type { GrokTool, GrokToolCall, SearchOptions } from "./client.js";

/**
 * Thinking/Reasoning configuration for GLM-4.6
 *
 * When enabled, the model will include reasoning_content in responses,
 * showing the step-by-step thought process before generating the final answer.
 *
 * @example
 * ```typescript
 * const thinking: ThinkingConfig = { type: "enabled" };
 * const response = await client.chat(messages, [], { thinking });
 * ```
 */
export interface ThinkingConfig {
  /**
   * Enable or disable thinking mode
   * - "enabled": Include reasoning process in responses
   * - "disabled": Standard response without reasoning
   */
  type: "enabled" | "disabled";
}

/**
 * Comprehensive options for GLM-4.6 chat requests
 *
 * Consolidates all available parameters for chat completions,
 * providing type-safe configuration for GLM-4.6 features.
 */
export interface ChatOptions {
  /**
   * Model identifier
   * @default "glm-4.6"
   * @example "glm-4.6", "grok-code-fast-1"
   */
  model?: string;

  /**
   * Temperature controls randomness in responses
   *
   * - Lower values (0.6): More focused and deterministic
   * - Higher values (1.0): More creative and diverse
   *
   * @default 0.7
   * @minimum 0.6
   * @maximum 1.0
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate
   *
   * GLM-4.6 supports up to 128,000 output tokens
   *
   * @default 8192
   * @maximum 128000
   */
  maxTokens?: number;

  /**
   * Enable/disable advanced reasoning mode
   *
   * When enabled, responses include reasoning_content showing
   * the model's step-by-step thought process.
   */
  thinking?: ThinkingConfig;

  /**
   * Search parameters for web-enabled queries
   */
  searchOptions?: SearchOptions;

  /**
   * Tools/functions available for the model to call
   */
  tools?: GrokTool[];

  /**
   * Enable streaming responses
   * @default false
   */
  stream?: boolean;
}

/**
 * GLM-4.6 enhanced response structure
 *
 * Extends the standard response with reasoning content and
 * enhanced usage metrics.
 */
export interface GLM46Response {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      /**
       * Reasoning process (only present when thinking is enabled)
       * Contains the step-by-step thought process before the final answer
       */
      reasoning_content?: string;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
  /**
   * Token usage statistics
   */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /**
     * Tokens used for reasoning (only when thinking is enabled)
     */
    reasoning_tokens?: number;
  };
}

/**
 * GLM-4.6 streaming response chunk
 *
 * Individual chunks received during streaming responses,
 * including support for reasoning content.
 */
export interface GLM46StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      /**
       * Incremental content from the final response
       */
      content?: string;
      /**
       * Incremental reasoning content (when thinking is enabled)
       * Shows the model's thought process as it develops
       */
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * Type guard to check if a response is a GLM-4.6 response
 */
export function isGLM46Response(response: unknown): response is GLM46Response {
  return (
    typeof response === 'object' &&
    response !== null &&
    'choices' in response &&
    Array.isArray((response as any).choices)
  );
}

/**
 * Type guard to check if a chunk has reasoning content
 */
export function hasReasoningContent(
  chunk: GLM46StreamChunk
): chunk is GLM46StreamChunk & {
  choices: Array<{ delta: { reasoning_content: string } }>;
} {
  return (
    chunk.choices.length > 0 &&
    typeof chunk.choices[0]?.delta?.reasoning_content === 'string' &&
    chunk.choices[0].delta.reasoning_content.length > 0
  );
}

/**
 * GLM-4.6 model configurations
 *
 * Defines capabilities and limits for supported models
 */
export const GLM_MODELS = {
  "glm-4.6": {
    contextWindow: 200000,      // 200K tokens
    maxOutputTokens: 128000,    // 128K max output
    supportsThinking: true,
    defaultTemperature: 0.7,
    temperatureRange: { min: 0.6, max: 1.0 },
    tokenEfficiency: 1.3,       // 30% more efficient
  },
  "grok-code-fast-1": {
    contextWindow: 128000,      // 128K tokens
    maxOutputTokens: 4096,
    supportsThinking: false,
    defaultTemperature: 0.7,
    temperatureRange: { min: 0.0, max: 2.0 },
    tokenEfficiency: 1.0,
  },
  "glm-4-air": {
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsThinking: false,
    defaultTemperature: 0.7,
    temperatureRange: { min: 0.6, max: 1.0 },
    tokenEfficiency: 1.15,
  },
  "glm-4-airx": {
    contextWindow: 8192,
    maxOutputTokens: 8192,
    supportsThinking: false,
    defaultTemperature: 0.7,
    temperatureRange: { min: 0.6, max: 1.0 },
    tokenEfficiency: 1.1,
  },
} as const;

export type SupportedModel = keyof typeof GLM_MODELS;

/**
 * Get model configuration by name
 */
export function getModelConfig(model: string) {
  return GLM_MODELS[model as SupportedModel] || GLM_MODELS["glm-4.6"];
}

/**
 * Validate temperature for a given model
 *
 * @throws Error if temperature is out of valid range
 */
export function validateTemperature(temperature: number, model: string): void {
  const config = getModelConfig(model);
  const { min, max } = config.temperatureRange;

  if (temperature < min || temperature > max) {
    throw new Error(
      `Temperature ${temperature} is out of range for model ${model}. ` +
      `Valid range: ${min} - ${max}`
    );
  }
}

/**
 * Validate max tokens for a given model
 *
 * @throws Error if maxTokens exceeds model limit
 */
export function validateMaxTokens(maxTokens: number, model: string): void {
  const config = getModelConfig(model);

  if (maxTokens > config.maxOutputTokens) {
    throw new Error(
      `Max tokens ${maxTokens} exceeds model limit for ${model}. ` +
      `Maximum: ${config.maxOutputTokens}`
    );
  }

  if (maxTokens < 1) {
    throw new Error(`Max tokens must be at least 1, got ${maxTokens}`);
  }
}

/**
 * Validate thinking configuration for a given model
 *
 * @throws Error if thinking is not supported by the model
 */
export function validateThinking(
  thinking: ThinkingConfig | undefined,
  model: string
): void {
  if (thinking && thinking.type === "enabled") {
    const config = getModelConfig(model);
    if (!config.supportsThinking) {
      throw new Error(
        `Thinking mode is not supported by model ${model}. ` +
        `Use glm-4.6 for thinking capabilities.`
      );
    }
  }
}

/**
 * Create default chat options with sensible defaults
 */
export function createDefaultChatOptions(model?: string): Required<Omit<ChatOptions, 'thinking' | 'searchOptions' | 'tools'>> {
  const modelName = model || "glm-4.6";
  const config = getModelConfig(modelName);

  return {
    model: modelName,
    temperature: config.defaultTemperature,
    maxTokens: Math.min(8192, config.maxOutputTokens), // Conservative default
    stream: false,
  };
}
