import { createOpenAICompatible, type OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
  getModelInfo,
  getModelProvider,
  MINIMAX_BASE_URLS,
  type MiniMaxRegion,
  normalizeModelId,
} from "../grok/models";
import type { ProviderAdapter, ProviderCapabilities, ResolvedModelRuntime } from "./types";

export const MINIMAX_ENDPOINTS = MINIMAX_BASE_URLS;

const MINIMAX_CAPABILITIES: ProviderCapabilities = {
  responsesApi: false,
  hostedSearch: false,
  imageGeneration: false,
  videoGeneration: false,
  batchApi: false,
  reasoningEffort: false,
  audioStt: false,
};

const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";

export interface MiniMaxAdapterOptions {
  apiKey: string;
  baseURL?: string;
  region?: MiniMaxRegion;
  fetch?: FetchFunction;
}

export function resolveMiniMaxRegion(value = process.env.MINIMAX_REGION): MiniMaxRegion {
  if (!value) return "global_en";
  if (value === "global_en" || value === "cn_zh") return value;
  throw new Error('MINIMAX_REGION must be either "global_en" or "cn_zh".');
}

export function resolveMiniMaxBaseURL(baseURL?: string, region = resolveMiniMaxRegion()): string {
  return (baseURL?.trim() || process.env.MINIMAX_BASE_URL?.trim() || MINIMAX_ENDPOINTS[region]).replace(/\/+$/, "");
}

class MiniMaxProviderAdapter implements ProviderAdapter {
  readonly kind = "minimax" as const;
  readonly capabilities = MINIMAX_CAPABILITIES;
  readonly defaultModelId = DEFAULT_MINIMAX_MODEL;
  readonly defaultTitleModelId = DEFAULT_MINIMAX_MODEL;
  readonly defaultRecapModelId = DEFAULT_MINIMAX_MODEL;

  private readonly sdk: OpenAICompatibleProvider;

  constructor(options: MiniMaxAdapterOptions) {
    this.sdk = createOpenAICompatible({
      name: "minimax",
      apiKey: options.apiKey,
      baseURL: resolveMiniMaxBaseURL(options.baseURL, options.region ?? resolveMiniMaxRegion()),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  chatModel(modelId: string) {
    return this.sdk.chatModel(modelId);
  }

  resolveRuntime(requestedModelId: string): ResolvedModelRuntime {
    const modelId = normalizeModelId(requestedModelId);
    const modelInfo = getModelInfo(modelId);
    if (modelInfo && getModelProvider(modelId) !== this.kind) {
      throw new Error(`Model ${modelId} is not available from the ${this.kind} provider.`);
    }

    return {
      model: this.sdk.chatModel(modelId),
      modelId,
      modelInfo,
    };
  }
}

export function createMiniMaxAdapter(options: MiniMaxAdapterOptions): ProviderAdapter {
  return new MiniMaxProviderAdapter(options);
}
