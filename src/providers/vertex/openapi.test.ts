import { afterEach, describe, expect, it, vi } from "vitest";
import { getVertexAccessToken } from "./auth";
import {
  buildVertexModelUrl,
  convertMessagesToVertexContents,
  convertVertexGenerateResponseToOpenAI,
  convertVertexStreamResponseToOpenAIChunks,
  convertXaiChatRequestToVertex,
  createVertexFetch,
  createVertexSseStream,
  getVertexModelId,
  sanitizeVertexSchema,
} from "./openapi";

const getVertexAccessTokenMock = vi.mocked(getVertexAccessToken);

vi.mock("./auth", () => ({
  getVertexAccessToken: vi.fn(async () => "adc-token"),
}));

const originalEnv = {
  GROK_VERTEX_PROJECT_ID: process.env.GROK_VERTEX_PROJECT_ID,
  GROK_VERTEX_LOCATION: process.env.GROK_VERTEX_LOCATION,
  GROK_VERTEX_BASE_URL: process.env.GROK_VERTEX_BASE_URL,
  GROK_VERTEX_DISABLE_TOOLS: process.env.GROK_VERTEX_DISABLE_TOOLS,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GCP_REGION: process.env.GCP_REGION,
  GCP_VERTEX_LOCATION: process.env.GCP_VERTEX_LOCATION,
  GCP_VERTEX_BASE_URL: process.env.GCP_VERTEX_BASE_URL,
};

function restoreVertexEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("Vertex Grok adapter", () => {
  afterEach(() => {
    restoreVertexEnv();
    vi.clearAllMocks();
    getVertexAccessTokenMock.mockResolvedValue("adc-token");
  });

  it("uses the global Vertex host with the global location path", () => {
    expect(
      buildVertexModelUrl(
        {
          projectId: "project-1",
          location: "global",
          baseURL: "https://aiplatform.googleapis.com",
          authMode: "adc",
        },
        "grok-4-1-fast-reasoning",
        false,
      ),
    ).toBe(
      "https://aiplatform.googleapis.com/v1/projects/project-1/locations/global/publishers/xai/models/grok-4.1-fast-reasoning:generateContent",
    );
  });

  it("still allows explicit regional location paths", () => {
    expect(
      buildVertexModelUrl(
        {
          projectId: "project-1",
          location: "europe-west1",
          baseURL: "https://aiplatform.googleapis.com",
          authMode: "adc",
        },
        "grok-4-1-fast-reasoning",
        false,
      ),
    ).toBe(
      "https://aiplatform.googleapis.com/v1/projects/project-1/locations/europe-west1/publishers/xai/models/grok-4.1-fast-reasoning:generateContent",
    );
  });

  it("requests SSE output from Vertex streaming endpoints", () => {
    expect(
      buildVertexModelUrl(
        {
          projectId: "project-1",
          location: "europe-west1",
          baseURL: "https://aiplatform.googleapis.com/",
          authMode: "adc",
        },
        "grok-4-1-fast-reasoning",
        true,
      ),
    ).toBe(
      "https://aiplatform.googleapis.com/v1/projects/project-1/locations/europe-west1/publishers/xai/models/grok-4.1-fast-reasoning:streamGenerateContent?alt=sse",
    );
  });

  it("maps native xAI model IDs to Vertex xAI publisher IDs", () => {
    expect(getVertexModelId("grok-4-1-fast-reasoning")).toBe("grok-4.1-fast-reasoning");
    expect(getVertexModelId("grok-4-1-fast-non-reasoning")).toBe("grok-4.1-fast-non-reasoning");
    expect(getVertexModelId("grok-4.20-0309-reasoning")).toBe("grok-4.20-reasoning");
    expect(getVertexModelId("custom-model")).toBe("custom-model");
  });

  it("maps OpenAI-style chat messages to Vertex contents", () => {
    const contents = convertMessagesToVertexContents([
      { role: "system", content: "Follow policy." },
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content: "I can help.",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "lookup", arguments: '{"query":"docs"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: '{"ok":true}' },
    ]);

    expect(contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      {
        role: "model",
        parts: [{ text: "I can help." }, { functionCall: { name: "lookup", args: { query: "docs" } } }],
      },
      { role: "user", parts: [{ functionResponse: { name: "lookup", response: { ok: true } } }] },
    ]);
  });

  it("sends system prompts through Vertex systemInstruction", () => {
    const request = convertXaiChatRequestToVertex({
      model: "grok-4-1-fast-reasoning",
      messages: [
        { role: "system", content: "Follow policy." },
        { role: "user", content: "Hello" },
      ],
    });

    expect(request).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      systemInstruction: { parts: [{ text: "Follow policy." }] },
    });
  });

  it("maps and sanitizes function declarations by default", () => {
    const request = convertXaiChatRequestToVertex({
      model: "grok-4-1-fast-reasoning",
      messages: [{ role: "user", content: "Search docs" }],
      tools: [
        {
          type: "function",
          function: {
            name: "search",
            description: "Search docs",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                query: { type: "string", minLength: 1 },
                limit: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Result count" },
              },
              required: ["query"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "search" } },
    });

    expect(request.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "search",
            description: "Search docs",
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING" },
                limit: { type: "INTEGER", description: "Result count", nullable: true },
              },
              required: ["query"],
            },
          },
        ],
      },
    ]);
    expect(request.toolConfig).toEqual({
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["search"] },
    });
  });

  it("can omit function declarations with the emergency Vertex tool disable flag", () => {
    process.env.GROK_VERTEX_DISABLE_TOOLS = "1";
    const request = convertXaiChatRequestToVertex({
      model: "grok-4-1-fast-reasoning",
      messages: [{ role: "user", content: "Search docs" }],
      max_completion_tokens: 512,
      temperature: 0.2,
      top_p: 0.9,
      tools: [
        {
          type: "function",
          function: {
            name: "search",
            description: "Search docs",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "search" } },
    });

    expect(request.generationConfig).toEqual({ maxOutputTokens: 512, temperature: 0.2, topP: 0.9 });
    expect(request.tools).toBeUndefined();
    expect(request.toolConfig).toBeUndefined();
  });

  it("drops invalid function names instead of sending declarations Vertex will reject", () => {
    const request = convertXaiChatRequestToVertex({
      model: "grok-4-1-fast-reasoning",
      messages: [{ role: "user", content: "Search docs" }],
      tools: [
        {
          type: "function",
          function: {
            name: "not allowed",
            description: "Invalid Vertex function name",
            parameters: { type: "object" },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "not allowed" } },
    });

    expect(request.tools).toBeUndefined();
    expect(request.toolConfig).toBeUndefined();
  });

  it("converts JSON schema to Vertex's function schema subset", () => {
    expect(
      sanitizeVertexSchema({
        type: "object",
        $schema: "https://json-schema.org/draft/2020-12/schema",
        additionalProperties: false,
        properties: {
          path: { type: "string", title: "Path" },
          count: { type: ["integer", "null"], default: 10, nullable: true },
          mode: { enum: ["read", "write"] },
          tags: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["path"],
      }),
    ).toEqual({
      type: "OBJECT",
      properties: {
        path: { type: "STRING" },
        count: { type: "INTEGER", nullable: true },
        mode: { type: "STRING", enum: ["read", "write"] },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["path"],
    });
  });

  it("preserves nullable unions when sanitizing function schemas", () => {
    expect(
      sanitizeVertexSchema({
        type: "object",
        properties: {
          maybeText: { oneOf: [{ type: "null" }, { type: "string", description: "Optional text" }] },
          maybeCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
      }),
    ).toEqual({
      type: "OBJECT",
      properties: {
        maybeText: { type: "STRING", description: "Optional text", nullable: true },
        maybeCount: { type: "INTEGER", nullable: true },
      },
    });
  });

  it("maps Vertex generateContent responses back to OpenAI chat completions", () => {
    const converted = convertVertexGenerateResponseToOpenAI(
      {
        candidates: [
          {
            index: 0,
            finishReason: "STOP",
            content: {
              parts: [{ text: "done" }, { functionCall: { name: "save", args: { path: "file.txt" } } }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
      },
      { id: "chatcmpl-test", model: "grok-4-1-fast-reasoning", created: 123 },
    );

    expect(converted).toMatchObject({
      id: "chatcmpl-test",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "done",
            tool_calls: [
              {
                type: "function",
                function: { name: "save", arguments: '{"path":"file.txt"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    });
  });

  it("forwards Vertex generateContent error responses when status or code is present without a message", () => {
    const converted = convertVertexGenerateResponseToOpenAI(
      {
        error: {
          status: "RESOURCE_EXHAUSTED",
          code: 8,
        },
      },
      { id: "chatcmpl-error", model: "grok-4-1-fast-reasoning", created: 123 },
    );

    expect(converted).toEqual({
      error: {
        status: "RESOURCE_EXHAUSTED",
        code: 8,
      },
    });
  });

  it("wraps Vertex JSON stream chunks as OpenAI SSE events", async () => {
    const encoder = new TextEncoder();
    const vertexBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '[{"candidates":[{"content":{"parts":[{"text":"hel"}]}}]},{"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}]}]',
          ),
        );
        controller.close();
      },
    });

    const text = await new Response(
      createVertexSseStream(vertexBody, { id: "chatcmpl-stream", model: "grok-4-1-fast-reasoning", created: 123 }),
    ).text();

    expect(text).toContain('"object":"chat.completion.chunk"');
    expect(text).toContain('"content":"hel"');
    expect(text).toContain('"content":"lo"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
  });

  it("forwards Vertex streaming error chunks as OpenAI SSE error events", async () => {
    const encoder = new TextEncoder();
    const vertexBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('{"error":{"message":"quota exceeded","status":"RESOURCE_EXHAUSTED","code":8}}'),
        );
        controller.close();
      },
    });

    const text = await new Response(
      createVertexSseStream(vertexBody, { id: "chatcmpl-stream", model: "grok-4-1-fast-reasoning", created: 123 }),
    ).text();

    expect(text).toContain('"error":{"message":"quota exceeded","status":"RESOURCE_EXHAUSTED","code":8}');
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
  });

  it("includes OpenAI stream indexes for Vertex function-call chunks", () => {
    const chunks = convertVertexStreamResponseToOpenAIChunks(
      {
        candidates: [
          {
            index: 0,
            content: {
              parts: [{ functionCall: { name: "read_file", args: { path: "README.md" } } }],
            },
          },
        ],
      },
      { id: "chatcmpl-tool", model: "grok-4-1-fast-reasoning", created: 123 },
    );

    expect(chunks).toMatchObject([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_chatcmpl-tool_0_0",
                  type: "function",
                  function: { name: "read_file", arguments: '{"path":"README.md"}' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [{ finish_reason: "tool_calls" }],
      },
    ]);
  });

  it("numbers stream function calls by function-call order, not part position", () => {
    const chunks = convertVertexStreamResponseToOpenAIChunks(
      {
        candidates: [
          {
            index: 0,
            content: {
              parts: [
                { text: "I will use tools." },
                { functionCall: { name: "read_file", args: { path: "README.md" } } },
                { text: " Then another." },
                { functionCall: { name: "grep", args: { pattern: "Vertex" } } },
              ],
            },
          },
        ],
      },
      { id: "chatcmpl-tool-mixed", model: "grok-4-1-fast-reasoning", created: 123 },
    );

    const toolChunk = chunks.find((chunk) => {
      const record = chunk as { choices?: Array<{ delta?: { tool_calls?: unknown[] } }> };
      return Boolean(record.choices?.[0]?.delta?.tool_calls);
    }) as { choices: Array<{ delta: { tool_calls: Array<{ index: number; id: string }> } }> };

    expect(toolChunk.choices[0].delta.tool_calls).toMatchObject([
      { index: 0, id: "call_chatcmpl-tool-mixed_0_0" },
      { index: 1, id: "call_chatcmpl-tool-mixed_0_1" },
    ]);
  });

  it("fetches Vertex with ADC bearer auth and returns translated chat JSON", async () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";
    process.env.GROK_VERTEX_LOCATION = "europe-west1";

    const baseFetch = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        "https://aiplatform.googleapis.com/v1/projects/project-1/locations/europe-west1/publishers/xai/models/grok-4.1-fast-reasoning:generateContent",
      );
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer adc-token");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      });

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await createVertexFetch(baseFetch)("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
    });
  });

  it("returns an actionable Vertex auth response when ADC token refresh fails", async () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";
    getVertexAccessTokenMock.mockRejectedValueOnce(
      new Error(
        "Google Application Default Credentials need reauthentication.\n\nRun `gcloud auth application-default login`.",
      ),
    );
    const baseFetch = vi.fn<typeof fetch>();

    const response = await createVertexFetch(baseFetch)("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    expect(response.status).toBe(401);
    expect(baseFetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining("Google Application Default Credentials need reauthentication."),
        code: "vertex_auth_failed",
      },
    });
  });

  it("returns structured errors for unsupported xAI request shapes", async () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";
    const baseFetch = vi.fn<typeof fetch>();

    const response = await createVertexFetch(baseFetch)("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }],
      }),
    });

    expect(response.status).toBe(400);
    expect(baseFetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining("image_url message parts are not supported"),
        code: "vertex_request_invalid",
      },
    });
  });

  it("returns structured errors for empty Vertex conversations", async () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";
    const baseFetch = vi.fn<typeof fetch>();

    const response = await createVertexFetch(baseFetch)("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [],
      }),
    });

    expect(response.status).toBe(400);
    expect(baseFetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: "Cannot send an empty conversation to Vertex AI.",
        code: "vertex_request_invalid",
      },
    });
  });
});
