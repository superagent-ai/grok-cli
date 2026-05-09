import type { GrokProviderAdapter, ProviderFactoryConfig, ProviderKind } from "./types";
import { createVertexAdapter } from "./vertex";
import { createXaiAdapter } from "./xai";

export type {
  GrokProviderAdapter,
  HostedToolNamespace,
  ProviderCapabilities,
  ProviderFactoryConfig,
  ProviderKind,
  ProviderRequestOptions,
  ResolvedModelRuntime,
} from "./types";
export { ProviderCapabilityError } from "./types";
export { createVertexAdapter, VERTEX_DEFAULT_MODEL, VERTEX_DEFAULT_TITLE_MODEL } from "./vertex";
export { createXaiAdapter, XAI_DEFAULT_MODEL } from "./xai";

/**
 * Constructs a provider adapter for the requested backend.
 *
 * The adapter exposes a backend-agnostic surface (chatModel, capabilities,
 * resolveRuntime, ...). Consumer code should depend on the GrokProviderAdapter
 * interface, never on a concrete provider type.
 */
export function createProvider(config: ProviderFactoryConfig): GrokProviderAdapter {
  switch (config.kind) {
    case "xai":
      return createXaiAdapter({
        apiKey: config.apiKey ?? "",
        baseURL: config.baseURL,
      });
    case "vertex":
      return createVertexAdapter();
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`Unknown provider kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Convenience for callers that have an apiKey/baseURL pair and want the
 * default xAI behavior. Mirrors the legacy createProvider(apiKey, baseURL?)
 * signature so the migration to the adapter-aware API can land in one PR
 * without rewriting every call site at once.
 */
export function createDefaultProvider(apiKey: string, baseURL?: string): GrokProviderAdapter {
  return createProvider({ kind: "xai" as ProviderKind, apiKey, baseURL });
}
