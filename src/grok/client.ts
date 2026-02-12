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

export interface GrokResponse {
  id?: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
}

/** Stateful continuation: previous_response_id + delta input only. */
export interface StatefulOptions {
  previousResponseId: string;
  deltaInput: Array<Record<string, unknown>>;
}

/** Whether to use xAI Responses API (true when base URL is xAI). */
function isXAIBaseURL(url: string): boolean {
  return url.includes("x.ai") || url.includes("api.x.ai");
}

/** Convert Chat Completions messages to Responses API input items. */
function messagesToResponsesInput(messages: GrokMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      const content = typeof msg.content === "string" ? msg.content : "";
      input.push({ role: "system", content });
      continue;
    }
    if (msg.role === "user") {
      const content = typeof msg.content === "string" ? msg.content : "";
      input.push({ role: "user", content });
      continue;
    }
    if (msg.role === "assistant") {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (content) input.push({ role: "assistant", content });
      const toolCalls = (msg as any).tool_calls;
      if (toolCalls?.length) {
        for (const tc of toolCalls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function?.name ?? "",
            arguments: tc.function?.arguments ?? "{}",
          });
        }
      }
      continue;
    }
    if (msg.role === "tool") {
      const toolMsg = msg as any;
      const callId = toolMsg.tool_call_id ?? toolMsg.tool_call?.id;
      const content = typeof toolMsg.content === "string" ? toolMsg.content : "";
      if (callId) input.push({ type: "function_call_output", call_id: callId, output: content });
    }
  }
  return input;
}

/** Convert GrokTool to Responses API FunctionTool format. */
function grokToolsToResponsesTools(tools: GrokTool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    name: t.function.name,
    description: t.function.description ?? "",
    parameters: t.function.parameters ?? { type: "object", properties: {}, required: [] },
    strict: false,
  }));
}

/** Native xAI tools (server-side). Add to tools array when using Responses API. */
const XAI_NATIVE_TOOLS: Array<Record<string, unknown>> = [
  { type: "web_search" },
  { type: "x_search" },
];

/** Parse Responses API output into GrokResponse-compatible format. */
function responsesOutputToGrokResponse(res: any): GrokResponse {
  const toolCalls: GrokToolCall[] = [];
  let content = res.output_text ?? "";

  for (const item of res.output ?? []) {
    if (item.type === "message" && item.content) {
      for (const c of Array.isArray(item.content) ? item.content : [item.content]) {
        if (c.type === "output_text" && c.text) content = (content ? content + "\n" : "") + c.text;
      }
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id ?? item.id ?? "",
        type: "function",
        function: { name: item.name ?? "", arguments: item.arguments ?? "{}" },
      });
    }
  }

  return {
    id: res.id,
    choices: [
      {
        message: {
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
        finish_reason: res.status === "completed" ? "stop" : "stop",
      },
    ],
  };
}

export class GrokClient {
  private client: OpenAI;
  private currentModel: string = "grok-code-fast-1";
  private defaultMaxTokens: number;
  private baseURL: string;
  private useResponsesApi: boolean;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    const url = baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    this.baseURL = url;
    this.useResponsesApi = isXAIBaseURL(url);
    this.client = new OpenAI({
      apiKey,
      baseURL: url,
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
    model?: string,
    stateful?: StatefulOptions
  ): Promise<GrokResponse> {
    if (this.useResponsesApi) {
      return this.responsesCreate(messages, tools, model, stateful);
    }
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
      };

      const response =
        await this.client.chat.completions.create(requestPayload);

      return response as GrokResponse;
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async responsesCreate(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    stateful?: StatefulOptions
  ): Promise<GrokResponse> {
    try {
      const input = stateful
        ? stateful.deltaInput
        : messagesToResponsesInput(messages);
      const functionTools = grokToolsToResponsesTools(tools ?? []);
      const allTools = [...XAI_NATIVE_TOOLS, ...functionTools];
      const body: Record<string, unknown> = {
        model: model || this.currentModel,
        input,
        max_output_tokens: this.defaultMaxTokens,
        temperature: 0.7,
        store: true,
      };
      if (stateful?.previousResponseId) {
        body.previous_response_id = stateful.previousResponseId;
      }
      if (allTools.length) {
        body.tools = allTools;
        body.tool_choice = "auto";
      }
      const response = (await this.client.responses.create(body as any)) as any;
      return responsesOutputToGrokResponse(response);
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    stateful?: StatefulOptions
  ): AsyncGenerator<any, void, unknown> {
    if (this.useResponsesApi) {
      yield* this.responsesStream(messages, tools, model, stateful);
      return;
    }
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

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async *responsesStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    stateful?: StatefulOptions
  ): AsyncGenerator<any, void, unknown> {
    try {
      const input = stateful
        ? stateful.deltaInput
        : messagesToResponsesInput(messages);
      const functionTools = grokToolsToResponsesTools(tools ?? []);
      const allTools = [...XAI_NATIVE_TOOLS, ...functionTools];
      const body: Record<string, unknown> = {
        model: model || this.currentModel,
        input,
        max_output_tokens: this.defaultMaxTokens,
        temperature: 0.7,
        store: true,
        stream: true,
      };
      if (stateful?.previousResponseId) {
        body.previous_response_id = stateful.previousResponseId;
      }
      if (allTools.length) {
        body.tools = allTools;
        body.tool_choice = "auto";
      }
      const stream = (await this.client.responses.create(body as any)) as unknown as AsyncIterable<any>;

      const toolCallsAccum: Record<string, { id: string; name: string; arguments: string }> = {};
      let toolCallsYielded = false;

      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          yield { choices: [{ delta: { content: event.delta } }] };
        }
        if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
          const item = event.item as { id?: string; call_id?: string; name?: string; arguments?: string };
          const key = item.id ?? item.call_id ?? `fc-${event.output_index}`;
          toolCallsAccum[key] = {
            id: item.call_id ?? item.id ?? `call_${key}`,
            name: item.name ?? "",
            arguments: item.arguments ?? "",
          };
        }
        if (event.type === "response.function_call_arguments.delta" && event.delta) {
          const key = event.item_id ?? `fc-${event.output_index}`;
          if (toolCallsAccum[key]) {
            toolCallsAccum[key].arguments += event.delta;
          }
        }
        if (event.type === "response.function_call_arguments.done") {
          const key = event.item_id ?? `fc-${event.output_index}`;
          if (!toolCallsAccum[key]) {
            toolCallsAccum[key] = {
              id: event.item_id ?? `call_${key}`,
              name: event.name ?? "",
              arguments: event.arguments ?? "",
            };
          } else {
            toolCallsAccum[key].name = event.name ?? toolCallsAccum[key].name;
            toolCallsAccum[key].arguments = event.arguments ?? toolCallsAccum[key].arguments;
          }
        }
        if (event.type === "response.completed") {
          if (!toolCallsYielded) {
            const toolCalls = Object.values(toolCallsAccum).filter((tc) => tc.name);
            if (toolCalls.length) {
              toolCallsYielded = true;
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function" as const,
                        function: { name: tc.name, arguments: tc.arguments },
                      })),
                    },
                  },
                ],
              };
            }
          }
          if (event.response?.id) {
            yield { responseId: event.response.id };
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async search(query: string): Promise<GrokResponse> {
    const searchMessage: GrokMessage = {
      role: "user",
      content: query,
    };

    return this.chat([searchMessage], [], undefined);
  }
}
