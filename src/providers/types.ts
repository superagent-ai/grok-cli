import type { Experimental_VideoModelV3 as VideoModel } from "@ai-sdk/provider";
import type { ImageModel, LanguageModel, Tool } from "ai";
import type { ModelInfo, ProviderKind, ReasoningEffort } from "../types/index";

export interface ProviderCapabilities {
  responsesApi: boolean;
  hostedSearch: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  batchApi: boolean;
  reasoningEffort: boolean;
  audioStt: boolean;
}

export type ProviderRequestOptions = {
  xai?: {
    reasoningEffort: ReasoningEffort;
  };
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

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  readonly defaultModelId: string;
  readonly defaultTitleModelId: string;
  readonly defaultRecapModelId: string;

  chatModel(modelId: string): LanguageModel;
  responsesModel?(modelId: string): LanguageModel;
  imageModel?(modelId: string): ImageModel;
  videoModel?(modelId: string): VideoModel;
  hostedTools?: HostedToolNamespace;
  resolveRuntime(requestedModelId: string): ResolvedModelRuntime;
  getBatchClientApiKey?(): string;
}

export interface ProviderFactoryConfig {
  kind: ProviderKind;
  apiKey: string;
  baseURL?: string;
  region?: "global_en" | "cn_zh";
}

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
