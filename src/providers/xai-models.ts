import type { ModelInfo, ReasoningEffort } from "../types/index";

/**
 * The native xAI model catalog. Each entry is the canonical id used internally;
 * `aliases` accept legacy or shorthand names. When new providers (e.g. Vertex)
 * ship their own catalogs, those live alongside this one rather than mixing in.
 */
export const XAI_MODELS: ModelInfo[] = [
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    contextWindow: 1_000_000,
    inputPrice: 1.25,
    outputPrice: 2.5,
    reasoning: true,
    description: "Recommended flagship reasoning model",
    aliases: [
      "grok-4-1-fast-reasoning",
      "grok-4-1-fast",
      "grok-4-fast-reasoning",
      "grok-4-fast",
      "grok-4-0709",
      "grok-code-fast-1",
      "grok-code-fast",
    ],
  },
  {
    id: "grok-4.20-multi-agent-0309",
    name: "Grok 4.20 Multi-Agent",
    contextWindow: 2_000_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: true,
    description: "Realtime multi-agent research model",
    aliases: ["grok-4.20-multi-agent", "grok-4.20-multi-agent-beta"],
    responsesOnly: true,
    multiAgent: true,
    supportsClientTools: false,
    supportsMaxOutputTokens: false,
    defaultReasoningEffort: "low",
  },
  {
    id: "grok-4.20-0309-reasoning",
    name: "Grok 4.20 Reasoning",
    contextWindow: 2_000_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: true,
    description: "Grok 4.20 reasoning release",
    aliases: ["grok-4.20-beta-0309", "grok-4.20-beta", "grok-beta"],
  },
  {
    id: "grok-4.20-non-reasoning",
    name: "Grok 4.20 Non-Reasoning",
    contextWindow: 2_000_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: false,
    description: "Recommended non-reasoning model",
    aliases: ["grok-4.20-0309-non-reasoning", "grok-4-1-fast-non-reasoning", "grok-4-fast-non-reasoning", "grok-3"],
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    contextWindow: 131_072,
    inputPrice: 0.3,
    outputPrice: 0.5,
    reasoning: false,
    description: "Budget-friendly compact model",
    aliases: ["grok-3-mini-fast"],
    supportsReasoningEffort: true,
  },
];

const PROVIDER_PREFIX_RE = /^(x-ai|xai)\//i;
const aliasMap = new Map<string, string>();

for (const model of XAI_MODELS) {
  aliasMap.set(model.id.toLowerCase(), model.id);
  for (const alias of model.aliases ?? []) {
    aliasMap.set(alias.toLowerCase(), model.id);
  }
}

export const DEFAULT_XAI_MODEL =
  XAI_MODELS.find((model) => model.id === "grok-4.3")?.id ?? XAI_MODELS[0]?.id ?? "grok-4.3";

export function normalizeXaiModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;

  const withoutProviderPrefix = trimmed.replace(PROVIDER_PREFIX_RE, "");
  return aliasMap.get(withoutProviderPrefix.toLowerCase()) ?? withoutProviderPrefix;
}

export function getXaiModelInfo(modelId: string): ModelInfo | undefined {
  const normalized = normalizeXaiModelId(modelId);
  return XAI_MODELS.find((m) => m.id === normalized);
}

export function getXaiModelIds(): string[] {
  return XAI_MODELS.map((m) => m.id);
}

export function isKnownXaiModelId(modelId: string): boolean {
  return !!getXaiModelInfo(modelId);
}

export function getXaiSupportedReasoningEfforts(modelId: string): ReasoningEffort[] {
  const modelInfo = getXaiModelInfo(modelId);
  if (!modelInfo?.supportsReasoningEffort) return [];
  // Currently only grok-3-mini supports reasoning_effort per xAI docs.
  // It supports "low" and "high" efforts.
  return ["low", "high"];
}

export function getXaiEffectiveReasoningEffort(
  modelId: string,
  override?: ReasoningEffort,
): ReasoningEffort | undefined {
  const supported = getXaiSupportedReasoningEfforts(modelId);
  if (supported.length === 0) return undefined;
  if (override && supported.includes(override)) return override;
  const defaultEffort = getXaiModelInfo(modelId)?.defaultReasoningEffort;
  return defaultEffort && supported.includes(defaultEffort) ? defaultEffort : undefined;
}
