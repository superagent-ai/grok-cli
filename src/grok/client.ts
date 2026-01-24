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
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
      };

      const response = await this.client.chat.completions.create(requestPayload);
      return response as GrokResponse;
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
        stream: true,
      };

      const stream = (await this.client.chat.completions.create(requestPayload)) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
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
