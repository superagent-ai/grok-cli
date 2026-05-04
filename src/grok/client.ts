import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import type { ModelInfo, ReasoningEffort } from "../types/index";
import { getReasoningEffortForModel, isVertexModeEnabled, VERTEX_API_KEY_PLACEHOLDER } from "../utils/settings";
import { getEffectiveReasoningEffort, getModelInfo, normalizeModelId } from "./models";
import { createVertexFetch } from "./vertex-adapter";

export type XaiProvider = ReturnType<typeof createXai>;
export type XaiChatModel = ReturnType<XaiProvider>;
export type XaiResponsesModel = ReturnType<XaiProvider["responses"]>;
export type GrokRuntimeModel = XaiChatModel | XaiResponsesModel;

const DEFAULT_TITLE_MODEL = "grok-4-1-fast-non-reasoning";

export interface GeneratedTitle {
  title: string;
  modelId: string;
  usage?: {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ResolvedModelRuntime {
  model: GrokRuntimeModel;
  modelId: string;
  modelInfo?: ModelInfo;
  providerOptions?: {
    xai: {
      reasoningEffort: ReasoningEffort;
    };
  };
}

export function createProvider(apiKey: string, baseURL?: string): XaiProvider {
  if (isVertexModeEnabled()) {
    return createXai({
      apiKey: apiKey || VERTEX_API_KEY_PLACEHOLDER,
      baseURL: "https://api.x.ai/v1",
      fetch: createVertexFetch(),
    });
  }

  return createXai({
    apiKey,
    baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
  });
}

export function resolveModelRuntime(provider: XaiProvider, requestedModelId: string): ResolvedModelRuntime {
  const modelId = normalizeModelId(requestedModelId);
  const modelInfo = getModelInfo(modelId);
  const reasoningEffort = getEffectiveReasoningEffort(modelId, getReasoningEffortForModel(modelId));

  return {
    model: !isVertexModeEnabled() && modelInfo?.responsesOnly ? provider.responses(modelId) : provider(modelId),
    modelId,
    modelInfo,
    providerOptions: reasoningEffort
      ? {
          xai: {
            reasoningEffort,
          },
        }
      : undefined,
  };
}

export async function generateTitle(provider: XaiProvider, userMessage: string): Promise<GeneratedTitle> {
  const runtime = resolveModelRuntime(provider, DEFAULT_TITLE_MODEL);
  try {
    const { text, usage } = await generateText({
      model: runtime.model,
      temperature: 0.5,
      ...(runtime.modelInfo?.supportsMaxOutputTokens === false ? {} : { maxOutputTokens: 60 }),
      ...(runtime.providerOptions ? { providerOptions: runtime.providerOptions } : {}),
      system: [
        "You are a title generator. Output ONLY a short title. Nothing else.",
        "Rules:",
        "- Single line, ≤50 characters",
        "- Use the same language as the user message",
        "- Focus on the main topic or intent",
        "- Keep technical terms, filenames, numbers exact",
        "- Remove filler words (the, this, my, a, an)",
        "- Never use tools or explain anything",
        "- If the message is a greeting, output something like 'Quick chat'",
      ].join("\n"),
      prompt: userMessage,
    });
    return {
      title: text?.trim().replace(/^["']|["']$/g, "") || "New session",
      modelId: runtime.modelId,
      usage,
    };
  } catch {
    return { title: "New session", modelId: runtime.modelId };
  }
}
