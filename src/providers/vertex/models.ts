import type { ModelInfo } from "../../types/index";

/**
 * The authoritative Vertex AI Grok catalog. Mirrors the four SKUs documented
 * on https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-grok
 * as of the integration cut-off.
 *
 * Important divergences from the native xAI catalog:
 *   - Vertex publishes separate reasoning vs non-reasoning SKUs rather than
 *     a single model with a `reasoning_effort` knob. Consequently
 *     supportsReasoningEffort is `false` on all Vertex SKUs and the agent
 *     selects reasoning behavior by picking the right SKU.
 *   - Smaller context windows than the xAI flagship: 200K for grok-4.20-*,
 *     128K for grok-4.1-fast-*.
 *   - Batch predictions are NOT supported for any Vertex Grok SKU.
 *   - Pricing fields below mirror current xAI public pricing for the same
 *     model family. Actual billing on Vertex flows through the customer's
 *     Google Cloud contract and may differ; treat these as estimates for
 *     in-CLI cost surfacing only.
 */
export const VERTEX_MODELS: ModelInfo[] = [
  {
    id: "grok-4.20-reasoning",
    name: "Grok 4.20 Reasoning (Vertex)",
    contextWindow: 200_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: true,
    description: "Flagship reasoning model on Vertex AI",
    aliases: ["grok-4.20-0309-reasoning"],
    supportsClientTools: true,
    supportsMaxOutputTokens: true,
    supportsReasoningEffort: false,
  },
  {
    id: "grok-4.20-non-reasoning",
    name: "Grok 4.20 Non-Reasoning (Vertex)",
    contextWindow: 200_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: false,
    description: "Flagship non-reasoning model on Vertex AI",
    aliases: ["grok-4.20-0309-non-reasoning"],
    supportsClientTools: true,
    supportsMaxOutputTokens: true,
    supportsReasoningEffort: false,
  },
  {
    id: "grok-4.1-fast-reasoning",
    name: "Grok 4.1 Fast Reasoning (Vertex)",
    contextWindow: 128_000,
    inputPrice: 1.25,
    outputPrice: 2.5,
    reasoning: true,
    description: "Cost-efficient reasoning model on Vertex AI",
    aliases: ["grok-4-1-fast-reasoning", "grok-4-fast-reasoning"],
    supportsClientTools: true,
    supportsMaxOutputTokens: true,
    supportsReasoningEffort: false,
  },
  {
    id: "grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast Non-Reasoning (Vertex)",
    contextWindow: 128_000,
    inputPrice: 1.25,
    outputPrice: 2.5,
    reasoning: false,
    description: "Cost-efficient non-reasoning model on Vertex AI",
    aliases: ["grok-4-1-fast-non-reasoning", "grok-4-fast-non-reasoning"],
    supportsClientTools: true,
    supportsMaxOutputTokens: true,
    supportsReasoningEffort: false,
  },
];

const VERTEX_PUBLISHER_PREFIX = "xai/";
const VERTEX_REQUEST_PREFIX_RE = /^xai\//i;
const PROVIDER_PREFIX_RE = /^(x-ai|xai)\//i;

const aliasMap = new Map<string, string>();
for (const model of VERTEX_MODELS) {
  aliasMap.set(model.id.toLowerCase(), model.id);
  for (const alias of model.aliases ?? []) {
    aliasMap.set(alias.toLowerCase(), model.id);
  }
}

/** Default Vertex chat model selected when the user has not chosen one. */
export const DEFAULT_VERTEX_MODEL: string =
  VERTEX_MODELS.find((model) => model.id === "grok-4.20-reasoning")?.id ??
  VERTEX_MODELS[0]?.id ??
  "grok-4.20-reasoning";

/** Default Vertex model used for short helper generations (titles, recaps). */
export const DEFAULT_VERTEX_TITLE_MODEL: string =
  VERTEX_MODELS.find((model) => model.id === "grok-4.1-fast-non-reasoning")?.id ?? DEFAULT_VERTEX_MODEL;

/**
 * Normalizes a requested model id into a canonical Vertex SKU. Accepts the
 * canonical id, declared aliases, or the on-the-wire `xai/<id>` form. Returns
 * the input trimmed if no match is found, so callers can still surface the
 * original string in error messages.
 */
export function normalizeVertexModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  const withoutProviderPrefix = trimmed.replace(PROVIDER_PREFIX_RE, "");
  return aliasMap.get(withoutProviderPrefix.toLowerCase()) ?? withoutProviderPrefix;
}

export function getVertexModelInfo(modelId: string): ModelInfo | undefined {
  const normalized = normalizeVertexModelId(modelId);
  return VERTEX_MODELS.find((m) => m.id === normalized);
}

export function getVertexModelIds(): string[] {
  return VERTEX_MODELS.map((m) => m.id);
}

export function isKnownVertexModelId(modelId: string): boolean {
  return !!getVertexModelInfo(modelId);
}

/**
 * Returns the on-the-wire model string used in Vertex OpenAPI chat-completions
 * requests. The Vertex partner-model endpoint expects the publisher prefix
 * (e.g. `xai/grok-4.20-reasoning`) even though the model cards and overview
 * pages list the bare ids.
 */
export function getVertexRequestModelId(modelId: string): string {
  const normalized = normalizeVertexModelId(modelId);
  if (VERTEX_REQUEST_PREFIX_RE.test(normalized)) return normalized;
  return `${VERTEX_PUBLISHER_PREFIX}${normalized}`;
}
