import type { Experimental_VideoModelV3 as VideoModel } from "@ai-sdk/provider";
import type { ImageModel, LanguageModel, Tool } from "ai";

import type { ModelInfo, ReasoningEffort } from "../types/index";

export type ProviderKind = "xai" | "vertex";

export interface ProviderCapabilities {
  /** xAI's `/responses` endpoint (Grok 4.20 Multi-Agent and similar). */
  responsesApi: boolean;
  /** Provider-hosted web/X search tools (e.g. xAI's webSearch, xSearch). */
  hostedSearch: boolean;
  /** Provider-hosted image generation (e.g. xAI's grok-2-image). */
  imageGeneration: boolean;
  /** Provider-hosted video generation. */
  videoGeneration: boolean;
  /** xAI's `/batches` endpoint. */
  batchApi: boolean;
  /** Per-request `reasoning_effort` parameter (xAI). Vertex selects via SKU. */
  reasoningEffort: boolean;
  /** Speech-to-text transcription used by the Telegram audio bridge. */
  audioStt: boolean;
}

export type ProviderRequestOptions = {
  xai?: { reasoningEffort: ReasoningEffort };
};

export interface ResolvedModelRuntime {
  model: LanguageModel;
  modelId: string;
  modelInfo?: ModelInfo;
  providerOptions?: ProviderRequestOptions;
}

export interface HostedToolNamespace {
  webSearch(): Tool;
  xSearch(): Tool;
}

export interface GrokProviderAdapter {
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;

  /** Returns the chat-completions LanguageModel for the given model id. */
  chatModel(modelId: string): LanguageModel;

  /**
   * Returns the Responses API LanguageModel for the given model id.
   * Only present when capabilities.responsesApi is true.
   */
  responsesModel?(modelId: string): LanguageModel;

  /**
   * Returns the image-generation model.
   * Only present when capabilities.imageGeneration is true.
   */
  imageModel?(modelId: string): ImageModel;

  /**
   * Returns the video-generation model.
   * Only present when capabilities.videoGeneration is true.
   */
  videoModel?(modelId: string): VideoModel;

  /**
   * Hosted tool definitions (e.g. provider-native web search).
   * Only present when capabilities.hostedSearch is true.
   */
  hostedTools?: HostedToolNamespace;

  /** Resolves a requested model id into runtime configuration. */
  resolveRuntime(requestedModelId: string): ResolvedModelRuntime;

  /**
   * Returns the API key required by the batch client.
   * Only present when capabilities.batchApi is true.
   */
  getBatchClientApiKey?(): string;
}

/**
 * Thrown when consumer code tries to use a capability that the active provider
 * does not support. Carries a typed payload so call sites can render
 * provider-aware error messages.
 */
export class ProviderCapabilityError extends Error {
  readonly providerKind: ProviderKind;
  readonly capability: keyof ProviderCapabilities;

  constructor(providerKind: ProviderKind, capability: keyof ProviderCapabilities, suggestion?: string) {
    const base = `${capability} is not supported by the ${providerKind} provider.`;
    super(suggestion ? `${base} ${suggestion}` : base);
    this.name = "ProviderCapabilityError";
    this.providerKind = providerKind;
    this.capability = capability;
  }
}

/** Configuration accepted by the createProvider factory. */
export interface ProviderFactoryConfig {
  kind: ProviderKind;
  apiKey?: string;
  baseURL?: string;
}
