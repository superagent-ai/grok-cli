import type { FetchFunction } from "@ai-sdk/provider-utils";
import { generateText } from "ai";
import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultModel,
  getModelIds,
  getModelInfo,
  getSupportedReasoningEfforts,
  normalizeModelId,
} from "../grok/models";
import type { ReasoningEffort } from "../types/index";
import * as settings from "../utils/settings";
import { createMiniMaxAdapter, MINIMAX_ENDPOINTS, resolveMiniMaxBaseURL, resolveMiniMaxRegion } from "./minimax";

vi.mock("fs", () => ({ existsSync: vi.fn(() => false), readFileSync: vi.fn() }));

describe("MiniMax provider adapter", () => {
  beforeEach(() => {
    vi.spyOn(settings, "getReasoningEffortForModel").mockReturnValue(undefined);
    delete process.env.MINIMAX_REGION;
    delete process.env.MINIMAX_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(fs.existsSync).mockReturnValue(false);
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
      reasoningEffort: true,
      audioStt: false,
    });
    expect(m3).toMatchObject({
      id: "MiniMax-M3",
      contextWindow: 1_000_000,
      inputPrice: 0.3,
      outputPrice: 1.2,
      cacheReadPrice: 0.06,
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

  it("defaults to Flash while preserving explicit, legacy, and non-MiniMax choices", () => {
    const adapter = createMiniMaxAdapter({ apiKey: "test-key" });
    expect(getModelIds("minimax")).toEqual(["MiniMax-M3.1-Flash", "MiniMax-M3"]);
    expect(getDefaultModel("minimax")).toBe("MiniMax-M3.1-Flash");
    expect(adapter.defaultModelId).toBe("MiniMax-M3.1-Flash");
    expect(adapter.defaultTitleModelId).toBe("MiniMax-M3.1-Flash");
    expect(adapter.defaultRecapModelId).toBe("MiniMax-M3.1-Flash");
    expect(getDefaultModel("xai")).toBe("grok-4.3");
    expect(getSupportedReasoningEfforts("grok-3-mini")).toEqual(["low", "high"]);
    expect(getModelInfo("minimax/minimax-m3.1-flash")).toMatchObject({
      contextWindow: 1_000_000,
      maxOutputTokens: 524_288,
      inputPrice: 0.15,
      outputPrice: 0.6,
      cacheReadPrice: 0.015,
      cacheWritePrice: null,
      inputModalities: ["text", "image", "video"],
      thinking: ["adaptive"],
      defaultReasoningEffort: "max",
    });
    expect(getSupportedReasoningEfforts(adapter.defaultModelId)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    for (const model of ["MiniMax-M3", "MiniMax-M2.7", "my-custom-model"]) {
      expect(adapter.resolveRuntime(model)).toMatchObject({ modelId: model, providerOptions: undefined });
      vi.stubEnv("GROK_MODEL", model);
      expect(settings.getCurrentModel(undefined, "minimax")).toBe(model);
      vi.stubEnv("GROK_MODEL", "");
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ defaultModel: model }));
      expect(settings.getCurrentModel(undefined, "minimax")).toBe(model);
    }
    expect(
      settings.parseSubAgentsRawList(
        [{ name: "legacy", model: "MiniMax-M2.7", instruction: "Keep this model" }],
        "minimax",
      ),
    ).toEqual([{ name: "legacy", model: "MiniMax-M2.7", instruction: "Keep this model" }]);
  });

  it.each([
    ["global_en", undefined, "max"],
    ["cn_zh", "low", "low"],
    ["global_en", "medium", "medium"],
    ["cn_zh", "high", "high"],
    ["global_en", "max", "max"],
    ["cn_zh", "xhigh", "xhigh"],
  ] as const)("serializes Flash effort at the SDK HTTP boundary (%s, %s)", async (region, override, expected) => {
    vi.mocked(settings.getReasoningEffortForModel).mockReturnValue(override as ReasoningEffort | undefined);
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: unknown) =>
        new Response(
          JSON.stringify({
            id: "chatcmpl-flash",
            model: "MiniMax-M3.1-Flash",
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const adapter = createMiniMaxAdapter({ apiKey: "test-key", region, fetch: fetchMock as FetchFunction });
    const runtime = adapter.resolveRuntime(adapter.defaultModelId);
    const result = await generateText({
      model: runtime.model,
      providerOptions: runtime.providerOptions,
      prompt: "Say ok",
    });
    expect(result.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(String(input)).toBe(`${MINIMAX_ENDPOINTS[region]}/chat/completions`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "MiniMax-M3.1-Flash", reasoning_effort: expected });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("service_tier");
    expect(body).not.toHaveProperty("xai");
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
