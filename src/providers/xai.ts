import { createXai } from "@ai-sdk/xai";

import { getReasoningEffortForModel } from "../utils/settings";
import type { GrokProviderAdapter, HostedToolNamespace, ProviderCapabilities, ResolvedModelRuntime } from "./types";
import { DEFAULT_XAI_MODEL, getXaiEffectiveReasoningEffort, getXaiModelInfo, normalizeXaiModelId } from "./xai-models";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";

const XAI_CAPABILITIES: ProviderCapabilities = {
  responsesApi: true,
  hostedSearch: true,
  imageGeneration: true,
  videoGeneration: true,
  batchApi: true,
  reasoningEffort: true,
  audioStt: true,
};

/** Re-exported for legacy consumers that still type against the SDK shape. */
export type XaiSdkProvider = ReturnType<typeof createXai>;

export interface XaiAdapterOptions {
  apiKey: string;
  baseURL?: string;
}

class XaiProviderAdapter implements GrokProviderAdapter {
  readonly kind = "xai" as const;
  readonly capabilities = XAI_CAPABILITIES;
  readonly hostedTools: HostedToolNamespace;

  private readonly sdk: XaiSdkProvider;
  private readonly apiKey: string;

  constructor(options: XaiAdapterOptions) {
    this.apiKey = options.apiKey;
    this.sdk = createXai({
      apiKey: options.apiKey,
      baseURL: options.baseURL || process.env.GROK_BASE_URL || DEFAULT_XAI_BASE_URL,
    });
    this.hostedTools = {
      webSearch: () => this.sdk.tools.webSearch(),
      xSearch: () => this.sdk.tools.xSearch(),
    };
  }

  chatModel(modelId: string) {
    return this.sdk(modelId);
  }

  responsesModel(modelId: string) {
    return this.sdk.responses(modelId);
  }

  imageModel(modelId: string) {
    return this.sdk.image(modelId);
  }

  videoModel(modelId: string) {
    return this.sdk.video(modelId);
  }

  resolveRuntime(requestedModelId: string): ResolvedModelRuntime {
    const modelId = normalizeXaiModelId(requestedModelId);
    const modelInfo = getXaiModelInfo(modelId);
    const reasoningEffort = getXaiEffectiveReasoningEffort(modelId, getReasoningEffortForModel(modelId));

    return {
      model: modelInfo?.responsesOnly ? this.sdk.responses(modelId) : this.sdk(modelId),
      modelId,
      modelInfo,
      providerOptions: reasoningEffort ? { xai: { reasoningEffort } } : undefined,
    };
  }

  getBatchClientApiKey(): string {
    return this.apiKey;
  }
}

/** Constructs the native xAI adapter. */
export function createXaiAdapter(options: XaiAdapterOptions): GrokProviderAdapter {
  return new XaiProviderAdapter(options);
}

export const XAI_DEFAULT_MODEL = DEFAULT_XAI_MODEL;
