import type { MiniMaxRegion } from "../grok/models";
import { createMiniMaxAdapter } from "./minimax";
import type { ProviderAdapter, ProviderFactoryConfig } from "./types";
import { createXaiAdapter } from "./xai";

export type { MiniMaxRegion } from "../grok/models";
export { createMiniMaxAdapter, MINIMAX_ENDPOINTS, resolveMiniMaxBaseURL, resolveMiniMaxRegion } from "./minimax";
export type {
  HostedToolNamespace,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderFactoryConfig,
  ProviderRequestOptions,
  ResolvedModelRuntime,
} from "./types";
export { ProviderCapabilityError } from "./types";
export { createXaiAdapter } from "./xai";

export function createProvider(config: ProviderFactoryConfig): ProviderAdapter {
  switch (config.kind) {
    case "xai":
      return createXaiAdapter({ apiKey: config.apiKey, baseURL: config.baseURL });
    case "minimax":
      return createMiniMaxAdapter({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        region: config.region as MiniMaxRegion | undefined,
      });
  }
}
