import type { FetchFunction } from "@ai-sdk/provider-utils";
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModelInfo, normalizeModelId } from "../grok/models";
import { createMiniMaxAdapter, MINIMAX_ENDPOINTS, resolveMiniMaxBaseURL, resolveMiniMaxRegion } from "./minimax";

describe("MiniMax provider adapter", () => {
  beforeEach(() => {
    delete process.env.MINIMAX_REGION;
    delete process.env.MINIMAX_BASE_URL;
  });

  afterEach(() => {
    delete process.env.MINIMAX_REGION;
    delete process.env.MINIMAX_BASE_URL;
  });

  it("uses the documented regional endpoints and validates the region", () => {
    expect(MINIMAX_ENDPOINTS).toEqual({
      global_en: "https://api.minimax.io/v1",
      cn_zh: "https://api.minimaxi.com/v1",
    });
    expect(resolveMiniMaxRegion()).toBe("global_en");
    expect(resolveMiniMaxBaseURL(undefined, "cn_zh")).toBe("https://api.minimaxi.com/v1");
    expect(() => resolveMiniMaxRegion("unknown" as never)).toThrow(/MINIMAX_REGION/);
  });

  it("exposes the target model metadata and chat-only capabilities", () => {
    const adapter = createMiniMaxAdapter({ apiKey: "test-key", region: "global_en" });
    const m3 = getModelInfo("MiniMax-M3");
    const m27 = getModelInfo("MiniMax-M2.7");

    expect(adapter.kind).toBe("minimax");
    expect(adapter.capabilities).toEqual({
      responsesApi: false,
      hostedSearch: false,
      imageGeneration: false,
      videoGeneration: false,
      batchApi: false,
      reasoningEffort: false,
      audioStt: false,
    });
    expect(m3).toMatchObject({
      id: "MiniMax-M3",
      contextWindow: 1_000_000,
      inputPrice: 0.6,
      outputPrice: 2.4,
      cacheReadPrice: 0.12,
      cacheWritePrice: null,
      inputModalities: ["text", "image", "video"],
      thinking: ["adaptive", "disabled"],
    });
    expect(m27).toMatchObject({
      id: "MiniMax-M2.7",
      contextWindow: 204_800,
      inputPrice: 0.3,
      outputPrice: 1.2,
      cacheReadPrice: 0.06,
      cacheWritePrice: 0.375,
      inputModalities: ["text"],
      thinking: ["always_on"],
    });
    expect(normalizeModelId("minimax/MiniMax-M3")).toBe("MiniMax-M3");
    expect(adapter.resolveRuntime("MiniMax-M3").modelId).toBe("MiniMax-M3");
    expect(adapter.responsesModel).toBeUndefined();
    expect(adapter.getBatchClientApiKey).toBeUndefined();
  });

  it("sends the API key and selected endpoint through the OpenAI-compatible chat path", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => {
      return new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          model: "MiniMax-M3",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const adapter = createMiniMaxAdapter({
      apiKey: "test-key",
      region: "cn_zh",
      fetch: fetchMock as unknown as FetchFunction,
    });

    const result = await generateText({ model: adapter.chatModel("MiniMax-M3"), prompt: "Say ok" });

    expect(result.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(String(input)).toBe("https://api.minimaxi.com/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "MiniMax-M3" });
  });
});
