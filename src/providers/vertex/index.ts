import { createXai } from "@ai-sdk/xai";

import { getReasoningEffortForModel, requireVertexSettings, type VertexSettings } from "../../utils/settings";
import type { GrokProviderAdapter, ProviderCapabilities, ResolvedModelRuntime } from "../types";
import { ProviderCapabilityError } from "../types";
import { DEFAULT_VERTEX_MODEL, DEFAULT_VERTEX_TITLE_MODEL, getVertexModelInfo, normalizeVertexModelId } from "./models";
import { createVertexFetch } from "./openapi";

/**
 * Capabilities advertised by the Vertex AI Grok backend, derived from the
 * official Vertex Grok model cards. Hosted search, image generation, video
 * generation, and the xAI batch API are not part of Vertex's documented
 * surface for Grok and are deliberately turned off — capability gating
 * (commit 9) translates these into typed errors at the call site.
 */
const VERTEX_CAPABILITIES: ProviderCapabilities = {
  responsesApi: false,
  hostedSearch: false,
  imageGeneration: false,
  videoGeneration: false,
  batchApi: false,
  reasoningEffort: false,
  audioStt: false,
};

export interface VertexAdapterOptions {
  /**
   * Pre-resolved Vertex settings. When omitted, settings are read from
   * env + user-settings.json via requireVertexSettings(). Tests can pass
   * a fully-formed object.
   */
  settings?: VertexSettings;
  /**
   * Optional fetch override. Used by tests to inject a canned transport;
   * production callers should leave this undefined so the default
   * createVertexFetch wraps globalThis.fetch.
   */
  fetch?: typeof fetch;
}

/**
 * Sentinel API key used as the placeholder when constructing the underlying
 * @ai-sdk/xai client for Vertex mode. The real authorization happens inside
 * createVertexFetch via Google ADC; the SDK never sees this string on the
 * wire because the fetch shim rewrites the Authorization header.
 */
const VERTEX_SDK_PLACEHOLDER_KEY = "vertex-adc-placeholder";

const VERTEX_DEFAULT_BASE_URL = "https://api.x.ai/v1";

class VertexProviderAdapter implements GrokProviderAdapter {
  readonly kind = "vertex" as const;
  readonly capabilities = VERTEX_CAPABILITIES;

  private readonly settings: VertexSettings;
  private readonly sdk: ReturnType<typeof createXai>;

  constructor(options: VertexAdapterOptions = {}) {
    this.settings = options.settings ?? requireVertexSettings();
    this.sdk = createXai({
      apiKey: VERTEX_SDK_PLACEHOLDER_KEY,
      baseURL: VERTEX_DEFAULT_BASE_URL,
      fetch: createVertexFetch(options.fetch),
    });
  }

  chatModel(modelId: string) {
    return this.sdk(normalizeVertexModelId(modelId));
  }

  resolveRuntime(requestedModelId: string): ResolvedModelRuntime {
    const modelId = normalizeVertexModelId(requestedModelId);
    const modelInfo = getVertexModelInfo(modelId);
    // Vertex selects reasoning by SKU, not via per-request reasoning_effort,
    // so providerOptions.xai.reasoningEffort is intentionally omitted. We
    // still consult the saved per-model setting to preserve ergonomics for
    // cross-provider tooling that round-trips the value.
    const requestedEffort = getReasoningEffortForModel(modelId);
    return {
      model: this.sdk(modelId),
      modelId,
      modelInfo,
      providerOptions: requestedEffort ? { xai: { reasoningEffort: requestedEffort } } : undefined,
    };
  }

  /**
   * Vertex Grok does not support the batch API. Calling this throws a
   * typed error rather than returning a placeholder string so capability
   * gating fails loudly at the right boundary.
   */
  getBatchClientApiKey(): never {
    throw new ProviderCapabilityError("vertex", "batchApi", "Use streaming/headless mode or switch provider to xai.");
  }
}

export function createVertexAdapter(options: VertexAdapterOptions = {}): GrokProviderAdapter {
  return new VertexProviderAdapter(options);
}

export const VERTEX_DEFAULT_MODEL = DEFAULT_VERTEX_MODEL;
export const VERTEX_DEFAULT_TITLE_MODEL = DEFAULT_VERTEX_TITLE_MODEL;
