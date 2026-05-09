import { requireVertexSettings, type VertexSettings } from "../../utils/settings";
import { getVertexAccessToken } from "./auth";

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes" || lower === "on";
}

type JsonRecord = Record<string, unknown>;

interface XaiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface XaiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: unknown;
  tool_calls?: XaiToolCall[];
  tool_call_id?: string;
}

interface XaiChatRequest {
  model: string;
  messages?: XaiMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  seed?: number;
  max_completion_tokens?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: unknown;
    };
  }>;
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | {
        type: "function";
        function: {
          name: string;
        };
      };
}

interface VertexPart {
  text?: string;
  functionCall?: {
    name: string;
    args?: JsonRecord;
  };
  functionResponse?: {
    name: string;
    response: JsonRecord;
  };
}

interface VertexContent {
  role: "user" | "model";
  parts: VertexPart[];
}

interface VertexRequest {
  contents: VertexContent[];
  systemInstruction?: {
    parts: VertexPart[];
  };
  generationConfig?: JsonRecord;
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: unknown;
    }>;
  }>;
  toolConfig?: JsonRecord;
}

interface VertexCandidate {
  index?: number;
  content?: {
    role?: string;
    parts?: VertexPart[];
  };
  finishReason?: string;
}

interface VertexResponse {
  candidates?: VertexCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
    status?: string;
    code?: number;
  };
}

interface OpenAIContext {
  id: string;
  model: string;
  created: number;
}

const VERTEX_MODEL_IDS: Record<string, string> = {
  "grok-4-1-fast-reasoning": "grok-4.1-fast-reasoning",
  "grok-4-1-fast-non-reasoning": "grok-4.1-fast-non-reasoning",
  "grok-4.20-0309-reasoning": "grok-4.20-reasoning",
  "grok-4.20-0309-non-reasoning": "grok-4.20-non-reasoning",
};

const VERTEX_FUNCTION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const VERTEX_SCHEMA_TYPES = new Set(["STRING", "INTEGER", "BOOLEAN", "NUMBER", "ARRAY", "OBJECT"]);
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "$defs",
  "$id",
  "$schema",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contains",
  "default",
  "definitions",
  "dependencies",
  "dependentRequired",
  "dependentSchemas",
  "else",
  "examples",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "if",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "prefixItems",
  "propertyNames",
  "readOnly",
  "strict",
  "then",
  "title",
  "unevaluatedProperties",
  "uniqueItems",
  "writeOnly",
]);

export function createVertexFetch(baseFetch: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const url = getRequestUrl(input);

    if (!url.pathname.endsWith("/chat/completions")) {
      return unsupportedVertexEndpointResponse(url);
    }

    let xaiRequest: XaiChatRequest;
    let vertexSettings: VertexSettings;
    let vertexRequest: VertexRequest;
    try {
      xaiRequest = (await readJsonRequest(input, init)) as XaiChatRequest;
      vertexSettings = requireVertexSettings();
      vertexRequest = convertXaiChatRequestToVertex(xaiRequest);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return vertexErrorResponse(message, 400, "vertex_request_invalid");
    }

    const isStreaming = xaiRequest.stream === true;
    let accessToken: string;
    try {
      accessToken = await getVertexAccessToken({ mode: vertexSettings.authMode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return vertexErrorResponse(message, 401, "vertex_auth_failed");
    }
    const vertexUrl = buildVertexModelUrl(vertexSettings, xaiRequest.model, isStreaming);
    const response = await baseFetch(vertexUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vertexRequest),
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
    });

    if (!response.ok) {
      return translateVertexError(response, vertexUrl);
    }

    const context = createOpenAIContext(xaiRequest.model);
    if (isStreaming) {
      if (!response.body) {
        return vertexErrorResponse("Vertex AI returned a streaming response without a readable body.", 502);
      }
      return new Response(createVertexSseStream(response.body, context), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const payload = await response.json();
    return new Response(JSON.stringify(convertVertexGenerateResponseToOpenAI(payload, context)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };
}

export function buildVertexModelUrl(settings: VertexSettings, modelId: string, isStreaming: boolean): string {
  const method = isStreaming ? "streamGenerateContent" : "generateContent";
  const baseURL = settings.baseURL.replace(/\/+$/, "");
  const vertexModelId = getVertexModelId(modelId);
  const url = `${baseURL}/v1/projects/${encodeURIComponent(settings.projectId)}/locations/${encodeURIComponent(
    settings.location,
  )}/publishers/xai/models/${encodeURIComponent(vertexModelId)}:${method}`;
  return isStreaming ? `${url}?alt=sse` : url;
}

export function getVertexModelId(modelId: string): string {
  return VERTEX_MODEL_IDS[modelId] ?? modelId;
}

export function convertXaiChatRequestToVertex(request: XaiChatRequest): VertexRequest {
  const conversation = convertMessagesToVertexConversation(request.messages ?? []);
  const generationConfig = removeUndefined({
    maxOutputTokens: request.max_completion_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    seed: request.seed,
  });
  const functionDeclarations = shouldForwardVertexTools()
    ? (request.tools ?? [])
        .filter((tool) => tool.type === "function" && isValidVertexFunctionName(tool.function.name))
        .map((tool) =>
          removeUndefined({
            name: tool.function.name,
            description: tool.function.description,
            parameters: sanitizeVertexSchema(tool.function.parameters),
          }),
        )
    : [];

  return removeUndefined({
    contents: conversation.contents,
    systemInstruction: conversation.systemInstruction,
    generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
    tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    toolConfig:
      functionDeclarations.length > 0
        ? convertToolChoiceToVertexToolConfig(
            request.tool_choice,
            new Set(functionDeclarations.map((declaration) => declaration.name)),
          )
        : undefined,
  }) as VertexRequest;
}

function shouldForwardVertexTools(): boolean {
  return !isTruthyEnv(process.env.GROK_VERTEX_DISABLE_TOOLS);
}

function isValidVertexFunctionName(name: string): boolean {
  return VERTEX_FUNCTION_NAME_PATTERN.test(name);
}

export function sanitizeVertexSchema(schema: unknown): unknown {
  const normalized = sanitizeVertexSchemaValue(schema);
  if (!isRecord(normalized)) {
    return { type: "OBJECT", properties: {} };
  }
  if (!normalized.type) {
    if (isRecord(normalized.properties)) {
      normalized.type = "OBJECT";
    } else if (normalized.items !== undefined) {
      normalized.type = "ARRAY";
    } else {
      normalized.type = "OBJECT";
    }
  }
  if (normalized.type === "OBJECT" && !isRecord(normalized.properties)) {
    normalized.properties = {};
  }
  return normalized;
}

function sanitizeVertexSchemaValue(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeVertexSchemaValue(item));
  }

  if (!isRecord(schema)) {
    return undefined;
  }

  const unionSchema = pickUnionSchema(schema);
  if (unionSchema && unionSchema !== schema) {
    const unionResult = sanitizeVertexSchemaValue(unionSchema);
    if (isRecord(unionResult)) {
      return copySchemaMetadata(schema, unionResult);
    }
  }

  const result: JsonRecord = {};
  const type = normalizeVertexSchemaType(schema.type);
  if (type) {
    result.type = type;
  }
  if (schemaAllowsNull(schema.type)) {
    result.nullable = true;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" || UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;

    switch (key) {
      case "description":
        if (typeof value === "string" && value.trim()) {
          result.description = value;
        }
        break;
      case "nullable":
        if (typeof value === "boolean") {
          result.nullable = value;
        }
        break;
      case "enum": {
        const enumValues = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [];
        if (enumValues.length > 0) {
          result.enum = enumValues;
        }
        break;
      }
      case "required": {
        const required = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [];
        if (required.length > 0) {
          result.required = required;
        }
        break;
      }
      case "properties": {
        if (!isRecord(value)) break;
        const properties = Object.fromEntries(
          Object.entries(value)
            .map(([propertyName, propertySchema]) => [propertyName, sanitizeVertexSchemaValue(propertySchema)])
            .filter((entry): entry is [string, unknown] => entry[1] !== undefined),
        );
        result.properties = properties;
        if (!result.type) {
          result.type = "OBJECT";
        }
        break;
      }
      case "items": {
        if (Array.isArray(value)) {
          const firstItem = value.find((item) => item !== undefined);
          const itemSchema = sanitizeVertexSchemaValue(firstItem);
          if (itemSchema !== undefined) {
            result.items = itemSchema;
          }
        } else {
          const itemSchema = sanitizeVertexSchemaValue(value);
          if (itemSchema !== undefined) {
            result.items = itemSchema;
          }
        }
        if (!result.type) {
          result.type = "ARRAY";
        }
        break;
      }
    }
  }

  if (!result.type && result.enum) {
    result.type = "STRING";
  }
  if (result.type === "OBJECT" && !isRecord(result.properties)) {
    result.properties = {};
  }
  if (Array.isArray(result.required) && isRecord(result.properties)) {
    const propertyNames = new Set(Object.keys(result.properties));
    const required = result.required.filter(
      (entry): entry is string => typeof entry === "string" && propertyNames.has(entry),
    );
    if (required.length > 0) {
      result.required = required;
    } else {
      delete result.required;
    }
  }
  if (result.type === "ARRAY" && result.items === undefined) {
    result.items = { type: "STRING" };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function pickUnionSchema(schema: JsonRecord): unknown {
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const variants = schema[key];
    if (!Array.isArray(variants)) continue;
    const nonNull = variants.find((variant) => !isNullSchema(variant));
    if (nonNull !== undefined) {
      const picked = isRecord(nonNull) ? { ...nonNull } : nonNull;
      if (isRecord(picked) && variants.some((variant) => isNullSchema(variant))) {
        picked.nullable = true;
      }
      return picked;
    }
  }
  return undefined;
}

function copySchemaMetadata(source: JsonRecord, target: JsonRecord): JsonRecord {
  if (typeof source.description === "string" && !target.description) {
    target.description = source.description;
  }
  if (source.nullable === true && target.nullable === undefined) {
    target.nullable = true;
  }
  return target;
}

function normalizeVertexSchemaType(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    return VERTEX_SCHEMA_TYPES.has(normalized) ? normalized : undefined;
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.toUpperCase() !== "NULL");
    return normalizeVertexSchemaType(first);
  }
  return undefined;
}

function schemaAllowsNull(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.toUpperCase() === "NULL");
}

function isNullSchema(value: unknown): boolean {
  return isRecord(value) && typeof value.type === "string" && value.type.toUpperCase() === "NULL";
}

export function convertMessagesToVertexContents(messages: XaiMessage[]): VertexContent[] {
  return convertMessagesToVertexConversation(messages).contents;
}

function convertMessagesToVertexConversation(messages: XaiMessage[]): {
  contents: VertexContent[];
  systemInstruction?: { parts: VertexPart[] };
} {
  const contents: VertexContent[] = [];
  const toolNamesById = new Map<string, string>();
  const systemParts = messages
    .filter((message) => message.role === "system")
    .flatMap((message) => textPartsFromContent(message.content));

  const append = (role: VertexContent["role"], parts: VertexPart[]) => {
    const cleanParts = parts.filter((part) => hasVertexPartValue(part));
    if (cleanParts.length === 0) return;

    const last = contents[contents.length - 1];
    if (last?.role === role) {
      last.parts.push(...cleanParts);
      return;
    }

    contents.push({ role, parts: cleanParts });
  };

  for (const message of messages) {
    switch (message.role) {
      case "system":
        break;
      case "user":
        append("user", textPartsFromContent(message.content));
        break;
      case "assistant": {
        const parts = textPartsFromContent(message.content);
        for (const toolCall of message.tool_calls ?? []) {
          toolNamesById.set(toolCall.id, toolCall.function.name);
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: parseJsonObject(toolCall.function.arguments),
            },
          });
        }
        append("model", parts);
        break;
      }
      case "tool": {
        const toolName = (message.tool_call_id ? toolNamesById.get(message.tool_call_id) : undefined) ?? "tool_result";
        append("user", [
          {
            functionResponse: {
              name: toolName,
              response: responseObjectFromToolContent(message.content),
            },
          },
        ]);
        break;
      }
    }
  }

  if (contents.length === 0) {
    if (systemParts.length === 0) {
      throw new Error("Cannot send an empty conversation to Vertex AI.");
    }
    contents.push({ role: "user", parts: [{ text: "Continue." }] });
  }

  if (contents[0]?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "Continue." }] });
  }

  return removeUndefined({
    contents,
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
  }) as {
    contents: VertexContent[];
    systemInstruction?: { parts: VertexPart[] };
  };
}

export function convertVertexGenerateResponseToOpenAI(payload: unknown, context: OpenAIContext) {
  const response = normalizeVertexResponse(payload);
  if (hasVertexError(response)) {
    return {
      error: response.error,
    };
  }

  const candidates = response.candidates?.length ? response.candidates : [{}];
  return {
    id: context.id,
    object: "chat.completion",
    created: context.created,
    model: context.model,
    choices: candidates.map((candidate, index) => {
      const toolCalls = extractFunctionCalls(candidate, context.id, index, false);
      const content = extractTextFromVertexCandidate(candidate);
      return {
        index: candidate.index ?? index,
        message: {
          role: "assistant",
          content: content || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : mapVertexFinishReason(candidate.finishReason),
      };
    }),
    usage: convertVertexUsage(response.usageMetadata),
  };
}

export function createVertexSseStream(
  vertexBody: ReadableStream<Uint8Array>,
  context: OpenAIContext,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let currentObject = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  const enqueueSse = (controller: TransformStreamDefaultController<Uint8Array>, value: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
  };

  const processText = (text: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    for (const char of text) {
      if (depth === 0) {
        if (char === "{") {
          currentObject = char;
          depth = 1;
          inString = false;
          escaped = false;
        }
        continue;
      }

      currentObject += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (inString && char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const parsed = JSON.parse(currentObject) as VertexResponse;
          currentObject = "";
          for (const chunk of convertVertexStreamResponseToOpenAIChunks(parsed, context)) {
            enqueueSse(controller, chunk);
          }
        }
      }
    }
  };

  return vertexBody.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        processText(decoder.decode(chunk, { stream: true }), controller);
      },
      flush(controller) {
        const tail = decoder.decode();
        if (tail) {
          processText(tail, controller);
        }
        if (depth !== 0) {
          throw new Error("Vertex AI returned an incomplete JSON stream.");
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    }),
  );
}

export function convertVertexStreamResponseToOpenAIChunks(payload: unknown, context: OpenAIContext): JsonRecord[] {
  const response = normalizeVertexResponse(payload);
  if (hasVertexError(response)) {
    return [{ error: response.error }];
  }

  const usage = convertVertexUsage(response.usageMetadata);
  const chunks: JsonRecord[] = [];

  for (const candidate of response.candidates ?? []) {
    const index = candidate.index ?? 0;
    const text = extractTextFromVertexCandidate(candidate);
    const toolCalls = extractFunctionCalls(candidate, context.id, index, true);
    const finishReason = toolCalls.length > 0 ? "tool_calls" : mapVertexFinishReason(candidate.finishReason);

    if (text) {
      chunks.push({
        id: context.id,
        object: "chat.completion.chunk",
        created: context.created,
        model: context.model,
        choices: [{ index, delta: { content: text }, finish_reason: null }],
      });
    }

    if (toolCalls.length > 0) {
      chunks.push({
        id: context.id,
        object: "chat.completion.chunk",
        created: context.created,
        model: context.model,
        choices: [{ index, delta: { tool_calls: toolCalls }, finish_reason: null }],
      });
    }

    if (finishReason) {
      chunks.push({
        id: context.id,
        object: "chat.completion.chunk",
        created: context.created,
        model: context.model,
        choices: [{ index, delta: {}, finish_reason: finishReason }],
        ...(usage ? { usage } : {}),
      });
    }
  }

  if (chunks.length === 0 && usage) {
    chunks.push({
      id: context.id,
      object: "chat.completion.chunk",
      created: context.created,
      model: context.model,
      choices: [{ index: 0, delta: {}, finish_reason: null }],
      usage,
    });
  }

  return chunks;
}

function createOpenAIContext(model: string): OpenAIContext {
  return {
    id: `chatcmpl-vertex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    model,
    created: Math.floor(Date.now() / 1000),
  };
}

function getRequestUrl(input: Request | URL | string): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

async function readJsonRequest(input: Request | URL | string, init: RequestInit | undefined): Promise<unknown> {
  if (init?.body !== undefined && init.body !== null) {
    return JSON.parse(await readBodyAsText(init.body));
  }

  if (input instanceof Request) {
    return input.json();
  }

  throw new Error("Vertex adapter received a chat request without a JSON body.");
}

async function readBodyAsText(body: NonNullable<RequestInit["body"]>): Promise<string> {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return body.text();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  if (body instanceof ReadableStream) {
    const response = new Response(body);
    return response.text();
  }

  throw new Error("Vertex adapter expected a JSON request body.");
}

function unsupportedVertexEndpointResponse(url: URL): Response {
  return vertexErrorResponse(
    `The Vertex AI provider supports chat completions only. The xAI endpoint "${url.pathname}" is not available on Vertex; native xAI-only features (Responses API search, image/video generation, STT, Batch API) require switching back to the xAI provider — unset GROK_PROVIDER (or pass --provider xai) and configure GROK_API_KEY.`,
    400,
    "vertex_unsupported_endpoint",
  );
}

async function translateVertexError(response: Response, vertexUrl: string): Promise<Response> {
  const body = await response.text();
  const detail = extractVertexErrorMessage(body) || response.statusText || `HTTP ${response.status}`;
  return vertexErrorResponse(
    `Vertex AI request failed (${response.status}) for ${vertexUrl}: ${detail}`,
    response.status,
  );
}

function vertexErrorResponse(message: string, status: number, code = "vertex_request_failed"): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: "vertex_ai_error",
        code,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function extractVertexErrorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    return parsed.error?.message || parsed.error?.status;
  } catch {
    return body.trim() || undefined;
  }
}

function hasVertexError(response: VertexResponse): boolean {
  return Boolean(response.error?.message || response.error?.status || response.error?.code !== undefined);
}

function normalizeVertexResponse(payload: unknown): VertexResponse {
  if (Array.isArray(payload)) {
    return (payload[payload.length - 1] ?? {}) as VertexResponse;
  }
  return (payload ?? {}) as VertexResponse;
}

function convertToolChoiceToVertexToolConfig(
  toolChoice: XaiChatRequest["tool_choice"],
  availableFunctionNames: Set<unknown>,
): JsonRecord | undefined {
  if (!toolChoice || toolChoice === "auto") {
    return { functionCallingConfig: { mode: "AUTO" } };
  }
  if (toolChoice === "none") {
    return { functionCallingConfig: { mode: "NONE" } };
  }
  if (toolChoice === "required") {
    return { functionCallingConfig: { mode: "ANY" } };
  }
  if (toolChoice.type === "function" && availableFunctionNames.has(toolChoice.function.name)) {
    return {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [toolChoice.function.name],
      },
    };
  }
  return { functionCallingConfig: { mode: "AUTO" } };
}

function textPartsFromContent(content: unknown): VertexPart[] {
  const text = extractTextContent(content);
  return text ? [{ text }] : [];
}

function extractTextContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const record = part as JsonRecord;
    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
      continue;
    }
    if (record.type === "image_url") {
      throw new Error(
        "Vertex Grok adapter supports text chat and tool payloads; image_url message parts are not supported.",
      );
    }
  }
  return parts.join("\n");
}

function hasVertexPartValue(part: VertexPart): boolean {
  return Boolean(part.text || part.functionCall || part.functionResponse);
}

function parseJsonObject(value: string): JsonRecord {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { value };
  }
}

function responseObjectFromToolContent(content: unknown): JsonRecord {
  const text = extractTextContent(content);
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : { result: parsed };
  } catch {
    return { result: text };
  }
}

function extractTextFromVertexCandidate(candidate: VertexCandidate): string {
  return (candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
}

function extractFunctionCalls(
  candidate: VertexCandidate,
  responseId: string,
  candidateIndex: number,
  includeDeltaIndex: boolean,
) {
  const toolCalls = [];
  let toolCallIndex = 0;

  for (const part of candidate.content?.parts ?? []) {
    if (!part.functionCall) continue;
    const index = toolCallIndex++;
    toolCalls.push({
      ...(includeDeltaIndex ? { index } : {}),
      id: `call_${responseId}_${candidateIndex}_${index}`,
      type: "function",
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args ?? {}),
      },
    });
  }

  return toolCalls;
}

function mapVertexFinishReason(reason: string | undefined): string | null {
  switch (reason) {
    case undefined:
    case "":
      return null;
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "MALFORMED_FUNCTION_CALL":
      return "tool_calls";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content_filter";
    default:
      return "stop";
  }
}

function convertVertexUsage(usage: VertexResponse["usageMetadata"]) {
  if (!usage) return undefined;
  const promptTokens = usage.promptTokenCount ?? 0;
  const completionTokens = usage.candidatesTokenCount ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage.totalTokenCount ?? promptTokens + completionTokens,
  };
}

function removeUndefined<T extends JsonRecord>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)) as T;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
