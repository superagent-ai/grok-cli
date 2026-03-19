import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";

export type XaiProvider = ReturnType<typeof createXai>;

export function createProvider(apiKey: string, baseURL?: string): XaiProvider {
  return createXai({
    apiKey,
    baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
  });
}

export async function generateTitle(
  provider: XaiProvider,
  userMessage: string,
): Promise<string> {
  try {
    const { text } = await generateText({
      model: provider("grok-3-mini-fast"),
      temperature: 0.5,
      maxOutputTokens: 60,
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
    return text?.trim().replace(/^["']|["']$/g, "") || "New session";
  } catch {
    return "New session";
  }
}
