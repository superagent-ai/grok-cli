import { generateText } from "ai";
import { createProvider as createProviderAdapter, type ProviderAdapter, type ResolvedModelRuntime } from "../providers";
import type { ProviderKind } from "../types/index";

interface GeneratedTextResult {
  modelId: string;
  usage?: {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface GeneratedTitle extends GeneratedTextResult {
  title: string;
}

export interface GeneratedRecap extends GeneratedTextResult {
  recap: string;
}

export type XaiProvider = ProviderAdapter;
export type { ProviderAdapter, ResolvedModelRuntime } from "../providers";

export function createProvider(apiKey: string, baseURL?: string, kind: ProviderKind = "xai"): ProviderAdapter {
  return createProviderAdapter({ kind, apiKey, baseURL });
}

export function resolveModelRuntime(provider: ProviderAdapter, requestedModelId: string): ResolvedModelRuntime {
  return provider.resolveRuntime(requestedModelId);
}

export async function generateTitle(provider: ProviderAdapter, userMessage: string): Promise<GeneratedTitle> {
  const runtime = resolveModelRuntime(provider, provider.defaultTitleModelId);
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

export async function generateRecap(
  provider: ProviderAdapter,
  transcript: string,
  signal?: AbortSignal,
): Promise<GeneratedRecap> {
  const runtime = resolveModelRuntime(provider, provider.defaultRecapModelId);
  try {
    const { text, usage } = await generateText({
      model: runtime.model,
      abortSignal: signal,
      temperature: 0.3,
      ...(runtime.modelInfo?.supportsMaxOutputTokens === false ? {} : { maxOutputTokens: 120 }),
      ...(runtime.providerOptions ? { providerOptions: runtime.providerOptions } : {}),
      system: [
        "You write terse coding-session recaps.",
        "Output ONLY the recap text. No bullets, headings, labels, or preamble.",
        "Rules:",
        "- Maximum 3 sentences total",
        "- Focus on what changed, what remains, and the most useful next step",
        "- Preserve exact file paths, function names, errors, and technical terms when present",
        "- Avoid filler, hedging, and repetition",
        "- Never mention being an AI, assistant, or summarizer",
      ].join("\n"),
      prompt: transcript,
    });
    return {
      recap: normalizeRecap(text),
      modelId: runtime.modelId,
      usage,
    };
  } catch {
    return { recap: "", modelId: runtime.modelId };
  }
}

function normalizeRecap(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}
