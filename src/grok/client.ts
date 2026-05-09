import { generateText } from "ai";

import {
  createProvider as createProviderInternal,
  type GrokProviderAdapter,
  type ResolvedModelRuntime,
} from "../providers";

const DEFAULT_TITLE_MODEL = "grok-4.20-non-reasoning";
const DEFAULT_RECAP_MODEL = "grok-4.20-non-reasoning";

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

/**
 * Backward-compatible re-exports. Prefer importing GrokProviderAdapter and
 * ResolvedModelRuntime from "../providers" directly in new code.
 */
export type { GrokProviderAdapter, ResolvedModelRuntime } from "../providers";

/**
 * @deprecated Alias retained so existing imports keep compiling. New code
 * should reference GrokProviderAdapter from "../providers".
 */
export type XaiProvider = GrokProviderAdapter;

/**
 * Constructs the default (xAI) provider adapter.
 *
 * Kept on the legacy `(apiKey, baseURL?)` signature so the provider
 * abstraction migration stays a single self-contained refactor. New code
 * should call `createProvider({ kind, ... })` from "../providers" directly.
 */
export function createProvider(apiKey: string, baseURL?: string): GrokProviderAdapter {
  return createProviderInternal({ kind: "xai", apiKey, baseURL });
}

/** Delegates to provider.resolveRuntime. Retained for legacy import paths. */
export function resolveModelRuntime(provider: GrokProviderAdapter, requestedModelId: string): ResolvedModelRuntime {
  return provider.resolveRuntime(requestedModelId);
}

export async function generateTitle(provider: GrokProviderAdapter, userMessage: string): Promise<GeneratedTitle> {
  const runtime = provider.resolveRuntime(DEFAULT_TITLE_MODEL);
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
  provider: GrokProviderAdapter,
  transcript: string,
  signal?: AbortSignal,
): Promise<GeneratedRecap> {
  const runtime = provider.resolveRuntime(DEFAULT_RECAP_MODEL);
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
