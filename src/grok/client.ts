import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";
import { safeValidateGrokResponse } from "../schemas/api-schemas.js";
import { ErrorCategory, createErrorMessage } from "../utils/error-handler.js";
import { GLM_MODELS, DEFAULT_MODEL, type SupportedModel } from "../constants.js";
import type {
  ChatOptions,
  ThinkingConfig,
  GLM46StreamChunk,
} from "./types.js";

export type GrokMessage = ChatCompletionMessageParam;

export interface GrokTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface GrokToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface SearchParameters {
  mode?: "auto" | "on" | "off";
  // sources removed - let API use default sources to avoid format issues
}

export interface SearchOptions {
  search_parameters?: SearchParameters;
}

export interface GrokResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string;  // GLM-4.6 support
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;  // GLM-4.6 support
  };
}

/**
 * GrokClient - Enhanced client for GLM-4.6 API
 *
 * Supports advanced features including:
 * - Thinking/reasoning mode
 * - Configurable temperature (0.6-1.0 for GLM-4.6)
 * - Extended context windows (up to 200K tokens)
 * - Multiple model support
 */
export class GrokClient {
  private client: OpenAI;
  private currentModel: SupportedModel;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
      timeout: 360000,
    });

    // Set model with validation
    this.currentModel = this.validateModel(model || DEFAULT_MODEL);

    // Get model configuration
    const modelConfig = GLM_MODELS[this.currentModel];

    // Set defaults from environment or model config
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.defaultMaxTokens = Number.isFinite(envMax) && envMax > 0
      ? Math.min(envMax, modelConfig.maxOutputTokens)
      : modelConfig.defaultMaxTokens;

    const envTemp = Number(process.env.GROK_TEMPERATURE);
    this.defaultTemperature = Number.isFinite(envTemp) &&
      envTemp >= modelConfig.temperatureRange.min &&
      envTemp <= modelConfig.temperatureRange.max
      ? envTemp
      : modelConfig.defaultTemperature;
  }

  /**
   * Validate and normalize model name
   */
  private validateModel(model: string): SupportedModel {
    if (model in GLM_MODELS) {
      return model as SupportedModel;
    }
    console.warn(`Unknown model "${model}", using default: ${DEFAULT_MODEL}`);
    return DEFAULT_MODEL;
  }

  /**
   * Validate temperature for current model
   */
  private validateTemperature(temperature: number, model: SupportedModel): void {
    const config = GLM_MODELS[model];
    const { min, max } = config.temperatureRange;

    if (temperature < min || temperature > max) {
      throw new Error(
        `Temperature ${temperature} is out of range for model ${model}. ` +
        `Valid range: ${min} - ${max}`
      );
    }
  }

  /**
   * Validate max tokens for current model
   */
  private validateMaxTokens(maxTokens: number, model: SupportedModel): void {
    const config = GLM_MODELS[model];

    if (maxTokens > config.maxOutputTokens) {
      throw new Error(
        `Max tokens ${maxTokens} exceeds limit for model ${model}. ` +
        `Maximum: ${config.maxOutputTokens}`
      );
    }

    if (maxTokens < 1) {
      throw new Error(`Max tokens must be at least 1, got ${maxTokens}`);
    }
  }

  /**
   * Validate thinking configuration for current model
   */
  private validateThinking(thinking: ThinkingConfig | undefined, model: SupportedModel): void {
    if (thinking && thinking.type === "enabled") {
      const config = GLM_MODELS[model];
      if (!config.supportsThinking) {
        throw new Error(
          `Thinking mode is not supported by model ${model}. ` +
          `Use glm-4.6 for thinking capabilities.`
        );
      }
    }
  }

  setModel(model: string): void {
    this.currentModel = this.validateModel(model);
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  getModelConfig() {
    return GLM_MODELS[this.currentModel];
  }

  /**
   * Chat completion with GLM-4.6 support
   *
   * @param messages - Conversation messages
   * @param tools - Available tools/functions
   * @param options - Chat options including temperature, thinking mode, etc.
   * @returns Promise<GrokResponse>
   *
   * @example
   * ```typescript
   * const response = await client.chat(messages, tools, {
   *   model: 'glm-4.6',
   *   temperature: 0.7,
   *   thinking: { type: 'enabled' },
   *   maxTokens: 8192
   * });
   * ```
   */
  async chat(
    messages: GrokMessage[],
    tools?: GrokTool[],
    options?: ChatOptions
  ): Promise<GrokResponse> {
    try {
      // Merge options with defaults
      const model = this.validateModel(options?.model || this.currentModel);
      const temperature = options?.temperature ?? this.defaultTemperature;
      const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
      const thinking = options?.thinking;
      const searchOptions = options?.searchOptions;

      // Validate parameters
      this.validateTemperature(temperature, model);
      this.validateMaxTokens(maxTokens, model);
      this.validateThinking(thinking, model);

      const requestPayload: any = {
        model,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature,
        max_tokens: maxTokens,
      };

      // Add GLM-4.6 thinking parameter if specified
      if (thinking) {
        requestPayload.thinking = thinking;
      }

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const response =
        await this.client.chat.completions.create(requestPayload);

      // Validate response structure
      const validationResult = safeValidateGrokResponse(response);
      if (!validationResult.success) {
        console.warn(
          createErrorMessage(
            ErrorCategory.VALIDATION,
            'Grok API response validation',
            validationResult.error || 'Invalid response structure'
          )
        );
        // Return response anyway for backward compatibility, but log warning
      }

      return response as GrokResponse;
    } catch (error: any) {
      // Enhance error message with context
      const modelInfo = options?.model || this.currentModel;
      throw new Error(`Grok API error (model: ${modelInfo}): ${error.message}`);
    }
  }

  /**
   * Streaming chat completion with GLM-4.6 support
   *
   * Yields chunks including reasoning_content when thinking is enabled
   *
   * @param messages - Conversation messages
   * @param tools - Available tools/functions
   * @param options - Chat options including temperature, thinking mode, etc.
   * @returns AsyncGenerator yielding GLM46StreamChunk
   *
   * @example
   * ```typescript
   * const stream = client.chatStream(messages, tools, {
   *   thinking: { type: 'enabled' }
   * });
   *
   * for await (const chunk of stream) {
   *   if (chunk.choices[0]?.delta?.reasoning_content) {
   *     console.log('Reasoning:', chunk.choices[0].delta.reasoning_content);
   *   }
   *   if (chunk.choices[0]?.delta?.content) {
   *     console.log('Content:', chunk.choices[0].delta.content);
   *   }
   * }
   * ```
   */
  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    options?: ChatOptions
  ): AsyncGenerator<GLM46StreamChunk, void, unknown> {
    try {
      // Merge options with defaults
      const model = this.validateModel(options?.model || this.currentModel);
      const temperature = options?.temperature ?? this.defaultTemperature;
      const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
      const thinking = options?.thinking;
      const searchOptions = options?.searchOptions;

      // Validate parameters
      this.validateTemperature(temperature, model);
      this.validateMaxTokens(maxTokens, model);
      this.validateThinking(thinking, model);

      const requestPayload: any = {
        model,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };

      // Add GLM-4.6 thinking parameter if specified
      if (thinking) {
        requestPayload.thinking = thinking;
      }

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk as GLM46StreamChunk;
      }
    } catch (error: any) {
      const modelInfo = options?.model || this.currentModel;
      throw new Error(`Grok API streaming error (model: ${modelInfo}): ${error.message}`);
    }
  }

  /**
   * Search with web context (deprecated - use chat with searchOptions)
   * @deprecated Use chat() with searchOptions parameter instead
   */
  async search(
    query: string,
    searchParameters?: SearchParameters
  ): Promise<GrokResponse> {
    const searchMessage: GrokMessage = {
      role: "user",
      content: query,
    };

    const searchOptions: SearchOptions = {
      search_parameters: searchParameters || { mode: "on" },
    };

    return this.chat([searchMessage], [], { searchOptions });
  }
}
