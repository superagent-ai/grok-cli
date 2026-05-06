import type { ModelInfo, ReasoningEffort } from "../types/index";

export const MODELS: ModelInfo[] = [
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

for (const model of MODELS) {
  aliasMap.set(model.id.toLowerCase(), model.id);
  for (const alias of model.aliases ?? []) {
    aliasMap.set(alias.toLowerCase(), model.id);
  }
}

export const DEFAULT_MODEL = MODELS.find((model) => model.id === "grok-4.3")?.id ?? MODELS[0]?.id ?? "grok-4.3";

export function normalizeModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;

  const withoutProviderPrefix = trimmed.replace(PROVIDER_PREFIX_RE, "");
  return aliasMap.get(withoutProviderPrefix.toLowerCase()) ?? withoutProviderPrefix;
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  const normalized = normalizeModelId(modelId);
  return MODELS.find((m) => m.id === normalized);
}

export function getModelIds(): string[] {
  return MODELS.map((m) => m.id);
}

export function isKnownModelId(modelId: string): boolean {
  return !!getModelInfo(modelId);
}

export function getSupportedReasoningEfforts(modelId: string): ReasoningEffort[] {
  const modelInfo = getModelInfo(modelId);
  if (!modelInfo?.supportsReasoningEffort) return [];
  // Currently only grok-3-mini supports reasoning_effort per xAI docs
  // It supports "low" and "high" efforts
  return ["low", "high"];
}

export function getEffectiveReasoningEffort(modelId: string, override?: ReasoningEffort): ReasoningEffort | undefined {
  const supported = getSupportedReasoningEfforts(modelId);
  if (supported.length === 0) return undefined;
  if (override && supported.includes(override)) return override;
  const defaultEffort = getModelInfo(modelId)?.defaultReasoningEffort;
  return defaultEffort && supported.includes(defaultEffort) ? defaultEffort : undefined;
}
