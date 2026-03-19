import type { ModelInfo } from "../types/index";

export const MODELS: ModelInfo[] = [
  {
    id: "grok-4-0709",
    name: "Grok 4",
    contextWindow: 256_000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    reasoning: true,
    description: "Flagship reasoning model",
  },
  {
    id: "grok-4.20-beta-0309",
    name: "Grok 4.20 Beta",
    contextWindow: 2_000_000,
    inputPrice: 2.0,
    outputPrice: 6.0,
    reasoning: true,
    description: "Multi-agent reasoning beta with 2M context",
  },
  {
    id: "grok-4-fast",
    name: "Grok 4 Fast",
    contextWindow: 2_000_000,
    inputPrice: 0.2,
    outputPrice: 0.5,
    reasoning: true,
    description: "Fast reasoning with 2M context",
  },
  {
    id: "grok-4-1-fast",
    name: "Grok 4.1 Fast",
    contextWindow: 2_000_000,
    inputPrice: 0.2,
    outputPrice: 0.5,
    reasoning: true,
    description: "Latest fast model with 2M context",
  },
  {
    id: "grok-code-fast-1",
    name: "Grok Code Fast",
    contextWindow: 256_000,
    inputPrice: 0.2,
    outputPrice: 1.5,
    reasoning: false,
    description: "Optimized for code generation",
  },
  {
    id: "grok-3",
    name: "Grok 3",
    contextWindow: 131_000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    reasoning: false,
    description: "Grok 3 flagship",
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    contextWindow: 131_000,
    inputPrice: 0.3,
    outputPrice: 0.5,
    reasoning: false,
    description: "Budget-friendly compact model",
  },
];

export const DEFAULT_MODEL = "grok-4-1-fast";

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

export function getModelIds(): string[] {
  return MODELS.map((m) => m.id);
}
