import fetch from 'node-fetch';
import type { ReadableStream } from 'node:stream/web'; // For Node.js ReadableStream typing
import type { ChatCompletionMessageParam } from "openai/resources/chat";
import { debugLog } from "../agent/grok-agent.js";


export type GrokMessage = ChatCompletionMessageParam;

export interface GrokTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}


export type BuiltInGrokTool = GrokTool;  // same as custom tools
export type AnyGrokTool = GrokTool | BuiltInGrokTool;

export interface GrokToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface GrokResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
}

export class GrokClient {
  private apiKey: string;
  private baseURL: string;
  private currentModel: string = "grok-code-fast-1";
  private defaultMaxTokens: number;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.defaultMaxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 1536;
    if (model) {
      this.currentModel = model;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async chat(
    messages: GrokMessage[],
    tools?: AnyGrokTool[],
    model?: string
  ): Promise<GrokResponse> {
    try {
        const requestPayload: any = {
          model: model || this.currentModel,
          messages,  // Flat: messages at top level
          temperature: 0.7,
          max_tokens: this.defaultMaxTokens,
        };

        if (tools && tools.length > 0) {
          requestPayload.tools = tools;
          requestPayload.tool_choice = "auto";
          requestPayload.max_turns = 5;  // Optional: limit agent loops
          requestPayload.include = ["inline_citations"];  // Optional: source links
        }

      debugLog('Sending API payload:', requestPayload);

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });
      debugLog('Response status:', response.status);

      if (!response.ok) {
        const err = await response.text();
          debugLog('error:', err);
        throw new Error(`Grok API error: ${response.status} "${err}"`);
      }

      const data = await response.json();
      debugLog('Response data:', data);
      return data as GrokResponse;
    } catch (error: any) {
      debugLog('error:', error);
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async *chatStream(
      messages: GrokMessage[],
      tools?: AnyGrokTool[],
      model?: string
    ): AsyncGenerator<any, void, unknown> {
      try {
        const requestPayload: any = {
          model: model || this.currentModel,
          messages,
          temperature: 0.7,
          max_tokens: this.defaultMaxTokens,
          stream: true,
        };

        if (tools && tools.length > 0) {
          requestPayload.tools = tools;
          requestPayload.tool_choice = "auto";
          requestPayload.max_turns = 5;
          requestPayload.include = ["inline_citations"];
        }

        debugLog('Sending streaming payload:', JSON.stringify(requestPayload, null, 2));

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestPayload),
        });

        debugLog('Response status:', response.status);

        if (!response.ok) {
          const err = await response.text();
          debugLog('API Error Response:', err);
          throw new Error(`Grok API error: ${response.status} "${err}"`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // ───────────────────────────────────────────────
        //   Node.js style event-based streaming (very reliable)
        // ───────────────────────────────────────────────
        const stream = response.body;
        const decoder = new TextDecoder();
        let buffer = '';

        const chunks: any[] = []; // queue for yielded values

        // Push parsed chunks into queue
        stream.on('data', (chunk: Buffer) => {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line

          for (const line of lines) {
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              debugLog('Received SSE line:', line);

              if (data === '[DONE]') {
                debugLog('Stream [DONE] received');
                return;
              }

              try {
                const parsed = JSON.parse(data);
                debugLog('Parsed chunk:', parsed);
                chunks.push(parsed); // ← we push here
              } catch (e) {
                debugLog('JSON parse error on line:', line, e);
              }
            }
          }
        });

        stream.on('end', () => {
          debugLog('Stream ended naturally');
        });

        stream.on('error', (err) => {
          debugLog('Stream error:', err);
          throw err;
        });

        // ───────────────────────────────────────────────
        //          Yield everything from the queue
        // ───────────────────────────────────────────────
        while (true) {
          if (chunks.length > 0) {
            const nextChunk = chunks.shift();
            yield nextChunk;
            continue;
          }

          // Wait a tiny bit if queue is empty
          await new Promise((resolve) => setTimeout(resolve, 30));

          // If stream ended and queue is empty → we're done
          if (!stream.readable && chunks.length === 0) {
            debugLog('Stream finished - no more data');
            break;
          }
        }

        debugLog('chatStream generator completed');
      } catch (error: any) {
        debugLog('chatStream ERROR:', error.message, error.stack);
        throw new Error(`Grok API error: ${error.message}`);
      }
    }

  async search(
    query: string
  ): Promise<GrokResponse> {
    const searchMessage: GrokMessage = {
      role: "user",
      content: query,
    };
  
    // Use the same full format as in grok-agent.ts
    const searchTools: AnyGrokTool[] = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for real-time information, news, facts, current events, or browse pages for details.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
              num_results: { type: "integer", description: "Number of results (max 30)", default: 10 }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "x_search",
          description: "Search X (Twitter) for recent posts, trends, discussions, or user content.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
              limit: { type: "integer", description: "Number of posts to return", default: 10 },
              mode: { type: "string", enum: ["Top", "Latest"], default: "Latest" }
            },
            required: ["query"]
          }
        }
      }
    ];
  
    return this.chat([searchMessage], searchTools);
  }
}
