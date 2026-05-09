import { beforeAll, describe, expect, it } from "vitest";

import { createProvider, type GrokProviderAdapter, ProviderCapabilityError } from "./index";

describe("provider contract", () => {
  describe("xai adapter", () => {
    let adapter: GrokProviderAdapter;

    beforeAll(() => {
      adapter = createProvider({ kind: "xai", apiKey: "test-key" });
    });

    it("identifies as xai", () => {
      expect(adapter.kind).toBe("xai");
    });

    it("declares the full xAI capability set", () => {
      expect(adapter.capabilities).toEqual({
        responsesApi: true,
        hostedSearch: true,
        imageGeneration: true,
        videoGeneration: true,
        batchApi: true,
        reasoningEffort: true,
        audioStt: true,
      });
    });

    it("returns a chat model object that the AI SDK can consume", () => {
      const model = adapter.chatModel("grok-4.3");
      expect(model).toBeDefined();
      // The AI SDK's LanguageModel objects always carry a modelId or similar.
      // We do not assert on the exact shape — that is the SDK's contract.
    });

    it("returns a Responses API model when capability is on", () => {
      expect(adapter.responsesModel).toBeDefined();
      const model = adapter.responsesModel?.("grok-4.20-multi-agent-0309");
      expect(model).toBeDefined();
    });

    it("exposes hosted tool factories when capability is on", () => {
      expect(adapter.hostedTools).toBeDefined();
      const webSearchTool = adapter.hostedTools?.webSearch();
      expect(webSearchTool).toBeDefined();
      const xSearchTool = adapter.hostedTools?.xSearch();
      expect(xSearchTool).toBeDefined();
    });

    it("returns image and video model factories when capabilities are on", () => {
      expect(adapter.imageModel).toBeDefined();
      expect(adapter.videoModel).toBeDefined();
      const imageModel = adapter.imageModel?.("grok-imagine-image");
      expect(imageModel).toBeDefined();
      const videoModel = adapter.videoModel?.("grok-imagine-video");
      expect(videoModel).toBeDefined();
    });

    it("resolves runtime metadata for known xAI models", () => {
      const runtime = adapter.resolveRuntime("grok-4.3");
      expect(runtime.modelId).toBe("grok-4.3");
      expect(runtime.modelInfo?.name).toBe("Grok 4.3");
      expect(runtime.model).toBeDefined();
    });

    it("normalizes shorthand aliases when resolving", () => {
      const runtime = adapter.resolveRuntime("grok-4-fast-reasoning");
      expect(runtime.modelId).toBe("grok-4.3");
    });

    it("returns the apiKey for batch usage", () => {
      expect(adapter.getBatchClientApiKey?.()).toBe("test-key");
    });
  });

  describe("createProvider factory", () => {
    it("constructs an xai adapter for kind: 'xai'", () => {
      const adapter = createProvider({ kind: "xai", apiKey: "k" });
      expect(adapter.kind).toBe("xai");
    });

    it("rejects vertex until the vertex backend is wired up in a follow-up commit", () => {
      expect(() => createProvider({ kind: "vertex" })).toThrow(/has not been wired up/);
    });
  });

  describe("ProviderCapabilityError", () => {
    it("carries the providerKind and capability fields", () => {
      const err = new ProviderCapabilityError("vertex", "batchApi", "Disable --use-batch-api or switch to xAI.");
      expect(err.providerKind).toBe("vertex");
      expect(err.capability).toBe("batchApi");
      expect(err.message).toContain("batchApi is not supported by the vertex provider");
      expect(err.message).toContain("Disable --use-batch-api");
    });
  });
});
