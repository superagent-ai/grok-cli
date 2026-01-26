import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

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

export interface GrokToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// Agent Tools API (/v1/responses) - replaces deprecated Live Search API (Jan 2026)
// Tools run server-side on xAI infrastructure

export interface WebSearchTool {
  type: "web_search";
  filters?: {
    allowed_domains?: string[];  // max 5, exclusive with excluded_domains
    excluded_domains?: string[];
    enable_image_understanding?: boolean;
  };
}

export interface XSearchTool {
  type: "x_search";
  allowed_x_handles?: string[];  // max 10, exclusive with excluded_x_handles
  excluded_x_handles?: string[];
  from_date?: string;  // YYYY-MM-DD
  to_date?: string;
  enable_image_understanding?: boolean;
  enable_video_understanding?: boolean;
}

export interface CodeInterpreterTool {
  type: "code_interpreter";  // sandboxed Python with NumPy, Pandas, Matplotlib, SciPy
}

export interface CollectionsSearchTool {
  type: "collections_search";
  collection_ids?: string[];
}

export type AgentTool = WebSearchTool | XSearchTool | CodeInterpreterTool | CollectionsSearchTool;

export const AgentTools = {
  webSearch(options?: WebSearchTool["filters"]): WebSearchTool {
    return options ? { type: "web_search", filters: options } : { type: "web_search" };
  },

  xSearch(options?: Omit<XSearchTool, "type">): XSearchTool {
    return { type: "x_search", ...options };
  },

  codeInterpreter(): CodeInterpreterTool {
    return { type: "code_interpreter" };
  },

  collectionsSearch(collectionIds?: string[]): CollectionsSearchTool {
    return collectionIds
      ? { type: "collections_search", collection_ids: collectionIds }
      : { type: "collections_search" };
  },

  codingAssistant(): AgentTool[] {
    return [{ type: "web_search" }, { type: "code_interpreter" }];
  },

  fullSearch(): AgentTool[] {
    return [{ type: "web_search" }, { type: "x_search" }];
  },

  all(): AgentTool[] {
    return [
      { type: "web_search" },
      { type: "x_search" },
      { type: "code_interpreter" },
      { type: "collections_search" },
    ];
  },
};

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
  private client: OpenAI;
  private currentModel: string = "grok-code-fast-1";
  private defaultMaxTokens: number;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
      timeout: 360000,
    });
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
    tools?: GrokTool[],
    model?: string
  ): Promise<GrokResponse> {
    try {
      // Use Responses API (/v1/responses) - the new endpoint replacing deprecated chat completions
      const baseURL = this.client.baseURL || "https://api.x.ai/v1";
      const apiKey = (this.client as any).apiKey;

      // Convert messages to input format for Responses API
      const input = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        ...(msg.role === 'assistant' && (msg as any).tool_calls ? { tool_calls: (msg as any).tool_calls } : {}),
        ...(msg.role === 'tool' ? { tool_call_id: (msg as any).tool_call_id } : {}),
      }));

      const requestPayload: Record<string, any> = {
        model: model || this.currentModel,
        input,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
      };

      // Add function tools if provided (client-side tools)
      // Convert from OpenAI format to xAI Responses API format
      if (tools && tools.length > 0) {
        requestPayload.tools = tools.map(tool => ({
          type: "function",
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        }));
        requestPayload.tool_choice = "auto";
      }

      const response = await fetch(`${baseURL}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Debug: log the raw response structure (uncomment for debugging)
      // console.error("Raw API response:", JSON.stringify(data, null, 2));

      // Convert Responses API format back to chat completions format for compatibility
      return this.convertResponseToGrokResponse(data);
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  private convertResponseToGrokResponse(data: any): GrokResponse {
    // Extract message content and tool calls from Responses API output
    let content = "";
    let toolCalls: GrokToolCall[] = [];

    if (data.output) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          // Content is an array of content blocks
          for (const block of item.content) {
            if (block.type === "output_text" && block.text) {
              content += block.text;
            } else if (typeof block === "string") {
              content += block;
            }
          }
        } else if (item.type === "function_call") {
          // Handle function calls from xAI format
          toolCalls.push({
            id: item.call_id || item.id || `call_${Date.now()}`,
            type: "function",
            function: {
              name: item.name,
              arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments),
            },
          });
        }
      }
    }

    // Also check for tool_calls at the top level or in choices
    if (data.choices?.[0]?.message) {
      // Already in GrokResponse format
      return data as GrokResponse;
    }

    // Check for tool_calls in the response (top-level)
    if (data.tool_calls) {
      for (const tc of data.tool_calls) {
        toolCalls.push({
          id: tc.id || tc.call_id || `call_${Date.now()}`,
          type: "function",
          function: {
            name: tc.function?.name || tc.name,
            arguments: tc.function?.arguments || (typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments)),
          },
        });
      }
    }

    return {
      choices: [{
        message: {
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: data.status === "completed" ? "stop" : (data.finish_reason || "stop"),
      }],
    };
  }

  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    try {
      // Use Responses API with streaming
      const baseURL = this.client.baseURL || "https://api.x.ai/v1";
      const apiKey = (this.client as any).apiKey;

      // Convert messages to input format for Responses API
      const input = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        ...(msg.role === 'assistant' && (msg as any).tool_calls ? { tool_calls: (msg as any).tool_calls } : {}),
        ...(msg.role === 'tool' ? { tool_call_id: (msg as any).tool_call_id } : {}),
      }));

      const requestPayload: Record<string, any> = {
        model: model || this.currentModel,
        input,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
        stream: true,
      };

      // Add function tools if provided (client-side tools)
      // Convert from OpenAI format to xAI Responses API format
      if (tools && tools.length > 0) {
        requestPayload.tools = tools.map(tool => ({
          type: "function",
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        }));
        requestPayload.tool_choice = "auto";
      }

      const response = await fetch(`${baseURL}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Parse SSE format: "event: <type>" followed by "data: <json>"
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const chunk = this.convertStreamChunk(data, currentEvent);
              if (chunk) {
                yield chunk;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  private convertStreamChunk(data: any, eventType: string): any {
    // Convert xAI Responses API streaming format to chat completions format
    const chunk: any = {
      choices: [{
        delta: {},
        index: 0,
      }],
    };

    // Handle different event types from xAI streaming API
    switch (eventType) {
      case "response.output_text.delta":
        // Main content streaming
        if (data.delta) {
          chunk.choices[0].delta.content = data.delta;
          return chunk;
        }
        break;

      case "response.content_part.delta":
        // Alternative content streaming format
        if (data.delta?.text) {
          chunk.choices[0].delta.content = data.delta.text;
          return chunk;
        }
        break;

      case "response.function_call_arguments.delta":
        // Function call arguments streaming
        // Note: Tool calls need special handling - accumulate across chunks
        break;

      case "response.output_item.added":
        // New output item (message, function_call, etc)
        if (data.item?.type === "function_call") {
          chunk.choices[0].delta.tool_calls = [{
            index: 0,
            id: data.item.call_id || data.item.id,
            type: "function",
            function: {
              name: data.item.name,
              arguments: "",
            },
          }];
          return chunk;
        } else if (data.item?.type === "message") {
          chunk.choices[0].delta.role = "assistant";
          return chunk;
        }
        break;

      case "response.output_item.done":
        // Output item completed
        if (data.item?.type === "function_call") {
          chunk.choices[0].delta.tool_calls = [{
            index: 0,
            id: data.item.call_id || data.item.id,
            type: "function",
            function: {
              name: data.item.name,
              arguments: typeof data.item.arguments === "string"
                ? data.item.arguments
                : JSON.stringify(data.item.arguments || {}),
            },
          }];
          return chunk;
        }
        break;

      case "response.completed":
      case "response.done":
        // Response finished
        chunk.choices[0].finish_reason = "stop";
        return chunk;
    }

    // Fallback: try to extract content from any delta field
    if (data.delta && typeof data.delta === "string") {
      chunk.choices[0].delta.content = data.delta;
      return chunk;
    }

    return null; // Skip unrecognized events
  }

  /**
   * Execute query using Agent Tools API (POST /v1/responses).
   * Server-side execution of web_search, x_search, code_interpreter, collections_search.
   */
  async agentQuery(
    query: string,
    agentTools?: AgentTool[],
    options?: {
      inline_citations?: boolean;
      model?: string;
      previousResponseId?: string;
    }
  ): Promise<AgentSearchResponse> {
    const baseURL = this.client.baseURL || "https://api.x.ai";
    const apiKey = (this.client as any).apiKey;

    const tools = agentTools || AgentTools.codingAssistant();
    const requestPayload: Record<string, any> = {
      model: options?.model || this.currentModel,
      input: [
        {
          role: "user",
          content: query,
        },
      ],
      tools: tools,
    };

    if (options?.inline_citations) {
      requestPayload.inline_citations = true;
    }
    if (options?.previousResponseId) {
      requestPayload.previous_response_id = options.previousResponseId;
    }

    try {
      const response = await fetch(`${baseURL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data as AgentSearchResponse;
    } catch (error: any) {
      throw new Error(`Grok Agent Tools API error: ${error.message}`);
    }
  }

  // Alias for backward compatibility
  async agentSearch(
    query: string,
    agentTools?: AgentTool[],
    model?: string
  ): Promise<AgentSearchResponse> {
    return this.agentQuery(query, agentTools, { model });
  }
}

export interface AgentSearchResponse {
  id: string;
  object: string;
  model: string;
  output: AgentOutputItem[];
  citations?: string[];
  inline_citations?: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

export interface AgentOutputItem {
  type: "message" | "tool_use" | "tool_result" | string;
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_result?: string;
}

export function extractAgentResponseText(response: AgentSearchResponse): string {
  return response.output
    .filter(item => item.type === "message" && item.content)
    .map(item => item.content)
    .join("\n");
}

export function extractAgentCitations(response: AgentSearchResponse): string[] {
  return response.citations || [];
}
