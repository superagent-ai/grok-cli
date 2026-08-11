import { createXai } from "@ai-sdk/xai";
import { getEffectiveReasoningEffort, getModelInfo, getModelProvider, normalizeModelId } from "../grok/models";
import { getReasoningEffortForModel } from "../utils/settings";
import type { HostedToolNamespace, ProviderAdapter, ProviderCapabilities, ResolvedModelRuntime } from "./types";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_XAI_MODEL = "grok-4.3";
const DEFAULT_XAI_AUXILIARY_MODEL = "grok-4.20-non-reasoning";

const XAI_CAPABILITIES: ProviderCapabilities = {
  responsesApi: true,
  hostedSearch: true,
  imageGeneration: true,
  videoGeneration: true,
  batchApi: true,
  reasoningEffort: true,
  audioStt: true,
};

type XaiSdkProvider = ReturnType<typeof createXai>;

export interface XaiAdapterOptions {
  apiKey: string;
  baseURL?: string;
}

class XaiProviderAdapter implements ProviderAdapter {
  readonly kind = "xai" as const;
  readonly capabilities = XAI_CAPABILITIES;
  readonly defaultModelId = DEFAULT_XAI_MODEL;
  readonly defaultTitleModelId = DEFAULT_XAI_AUXILIARY_MODEL;
  readonly defaultRecapModelId = DEFAULT_XAI_AUXILIARY_MODEL;
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
    const modelId = normalizeModelId(requestedModelId);
    const modelInfo = getModelInfo(modelId);
    if (modelInfo && getModelProvider(modelId) !== this.kind) {
      throw new Error(`Model ${modelId} is not available from the ${this.kind} provider.`);
    }
    const reasoningEffort = getEffectiveReasoningEffort(modelId, getReasoningEffortForModel(modelId));

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

export function createXaiAdapter(options: XaiAdapterOptions): ProviderAdapter {
  return new XaiProviderAdapter(options);
}
