import { describe, expect, it } from "vitest";
import { resolveModelRuntime } from "./client";
import { createXai } from "@ai-sdk/xai";

describe("client", () => {
  const mockProvider = createXai({
    apiKey: "test-key",
    baseURL: "https://api.x.ai/v1",
  });

  describe("resolveModelRuntime", () => {
    it("includes providerOptions with reasoningEffort for grok-3-mini", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-3-mini");
      expect(runtime.modelId).toBe("grok-3-mini");
      expect(runtime.providerOptions).toBeUndefined();
    });

    it("does not include providerOptions for grok-4-0709 even though it has reasoning flag", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-4-0709");
      expect(runtime.modelId).toBe("grok-4-0709");
      expect(runtime.providerOptions).toBeUndefined();
    });

    it("does not include providerOptions for grok-code-fast-1", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-code-fast-1");
      expect(runtime.modelId).toBe("grok-code-fast-1");
      expect(runtime.providerOptions).toBeUndefined();
    });

    it("does not include providerOptions for grok-4-1-fast-reasoning", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-4-1-fast-reasoning");
      expect(runtime.modelId).toBe("grok-4-1-fast-reasoning");
      expect(runtime.providerOptions).toBeUndefined();
    });

    it("does not include providerOptions for grok-4.20-multi-agent", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-4.20-multi-agent");
      expect(runtime.modelId).toBe("grok-4.20-multi-agent-0309");
      expect(runtime.providerOptions).toBeUndefined();
    });

    it("does not include providerOptions for grok-3", () => {
      const runtime = resolveModelRuntime(mockProvider, "grok-3");
      expect(runtime.modelId).toBe("grok-3");
      expect(runtime.providerOptions).toBeUndefined();
    });
  });
});
