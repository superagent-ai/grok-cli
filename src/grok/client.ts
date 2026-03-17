import OpenAI from "openai";
import type { ToolDefinition, ToolCall, Message } from "../types/index.js";
import { DEFAULT_MODEL } from "./models.js";

export interface StreamDelta {
  content?: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  finishReason?: string | null;
}

export class GrokClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
      timeout: 360_000,
    });
    this.model = model || DEFAULT_MODEL;
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.maxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 16_384;
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async *chatStream(
    messages: Message[],
    tools: ToolDefinition[],
  ): AsyncGenerator<StreamDelta, void, unknown> {
    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: this.maxTokens,
      stream: true,
    };

    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const stream = (await this.client.chat.completions.create(
      payload as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

    const accToolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta: StreamDelta = { finishReason: choice.finish_reason };

      if (choice.delta?.content) {
        delta.content = choice.delta.content;
      }

      if ((choice.delta as Record<string, unknown>)?.reasoning) {
        delta.reasoning = (choice.delta as Record<string, unknown>).reasoning as string;
      }

      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!accToolCalls[idx]) {
            accToolCalls[idx] = { id: tc.id || "", name: "", arguments: "" };
          }
          if (tc.id) accToolCalls[idx].id = tc.id;
          if (tc.function?.name) accToolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) accToolCalls[idx].arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
        const calls = Object.values(accToolCalls);
        if (calls.length > 0) {
          delta.toolCalls = calls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: c.arguments },
          }));
        }
      }

      yield delta;
    }
  }

  async searchWeb(query: string): Promise<string> {
    return this.search(query, "web_search");
  }

  async searchX(query: string): Promise<string> {
    return this.search(query, "x_search");
  }

  private async search(query: string, toolType: "web_search" | "x_search"): Promise<string> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [{ role: "user", content: query }],
        tools: [{ type: toolType } as unknown as OpenAI.Responses.Tool],
      });

      const parts: string[] = [];
      for (const item of response.output) {
        if (item.type === "message") {
          for (const content of item.content) {
            if (content.type === "output_text") {
              parts.push(content.text);
            }
          }
        }
      }
      return parts.join("\n") || "No results found.";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Search failed: ${msg}`;
    }
  }
}
