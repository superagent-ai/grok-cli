import { generateText } from "ai";
import { resolveModelRuntime, type XaiProvider } from "../grok/client.js";
import { NO_SUGGESTION_TOKEN } from "./config.js";
import type { SuggestionResult } from "./types.js";

const SYSTEM_PROMPT = [
  "You predict the user's next coding-agent prompt.",
  "Output ONLY that next user message. Nothing else.",
  `If no plausible next message is clear, output exactly ${NO_SUGGESTION_TOKEN}.`,
].join("\n");

export async function generatePromptSuggestion(
  provider: XaiProvider,
  prompt: string,
  modelId: string,
  maxSuggestionChars: number,
  signal?: AbortSignal,
): Promise<SuggestionResult> {
  const runtime = resolveModelRuntime(provider, modelId);
  const maxOutputTokens = Math.min(64, Math.max(24, Math.ceil(maxSuggestionChars / 3) + 8));

  try {
    const { text, usage } = await generateText({
      model: runtime.model,
      abortSignal: signal,
      temperature: 0,
      ...(runtime.modelInfo?.supportsMaxOutputTokens === false ? {} : { maxOutputTokens }),
      system: SYSTEM_PROMPT,
      prompt,
    });

    return {
      kind: "suggestion",
      text: text ?? "",
      modelId: runtime.modelId,
      usage: {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
      },
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { kind: "no_suggestion", text: NO_SUGGESTION_TOKEN, modelId: runtime.modelId };
    }
    return { kind: "no_suggestion", text: NO_SUGGESTION_TOKEN, modelId: runtime.modelId };
  }
}
