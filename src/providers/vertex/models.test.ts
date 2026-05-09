import { describe, expect, it } from "vitest";

import {
  DEFAULT_VERTEX_MODEL,
  DEFAULT_VERTEX_TITLE_MODEL,
  getVertexModelIds,
  getVertexModelInfo,
  getVertexRequestModelId,
  isKnownVertexModelId,
  normalizeVertexModelId,
  VERTEX_MODELS,
} from "./models";

describe("Vertex Grok catalog", () => {
  it("exposes exactly the 4 documented Vertex Grok SKUs", () => {
    expect(getVertexModelIds()).toEqual([
      "grok-4.20-reasoning",
      "grok-4.20-non-reasoning",
      "grok-4.1-fast-reasoning",
      "grok-4.1-fast-non-reasoning",
    ]);
  });

  it("publishes the documented context windows per Vertex model card", () => {
    expect(getVertexModelInfo("grok-4.20-reasoning")?.contextWindow).toBe(200_000);
    expect(getVertexModelInfo("grok-4.20-non-reasoning")?.contextWindow).toBe(200_000);
    expect(getVertexModelInfo("grok-4.1-fast-reasoning")?.contextWindow).toBe(128_000);
    expect(getVertexModelInfo("grok-4.1-fast-non-reasoning")?.contextWindow).toBe(128_000);
  });

  it("flags reasoning vs non-reasoning correctly", () => {
    expect(getVertexModelInfo("grok-4.20-reasoning")?.reasoning).toBe(true);
    expect(getVertexModelInfo("grok-4.20-non-reasoning")?.reasoning).toBe(false);
    expect(getVertexModelInfo("grok-4.1-fast-reasoning")?.reasoning).toBe(true);
    expect(getVertexModelInfo("grok-4.1-fast-non-reasoning")?.reasoning).toBe(false);
  });

  it("does not advertise reasoning-effort support (Vertex selects via SKU)", () => {
    for (const model of VERTEX_MODELS) {
      expect(model.supportsReasoningEffort).toBe(false);
    }
  });

  it("supports client-side function calling on every SKU", () => {
    for (const model of VERTEX_MODELS) {
      expect(model.supportsClientTools).toBe(true);
    }
  });

  it("chooses grok-4.20-reasoning as the default chat model", () => {
    expect(DEFAULT_VERTEX_MODEL).toBe("grok-4.20-reasoning");
  });

  it("chooses grok-4.1-fast-non-reasoning as the default title/recap model", () => {
    expect(DEFAULT_VERTEX_TITLE_MODEL).toBe("grok-4.1-fast-non-reasoning");
  });
});

describe("normalizeVertexModelId", () => {
  it("returns the canonical id unchanged", () => {
    expect(normalizeVertexModelId("grok-4.20-reasoning")).toBe("grok-4.20-reasoning");
  });

  it("strips xai/ publisher prefix", () => {
    expect(normalizeVertexModelId("xai/grok-4.20-reasoning")).toBe("grok-4.20-reasoning");
  });

  it("strips x-ai/ publisher prefix variant", () => {
    expect(normalizeVertexModelId("x-ai/grok-4.20-reasoning")).toBe("grok-4.20-reasoning");
  });

  it("resolves declared aliases to their canonical id", () => {
    expect(normalizeVertexModelId("grok-4-1-fast-reasoning")).toBe("grok-4.1-fast-reasoning");
    expect(normalizeVertexModelId("grok-4-fast-reasoning")).toBe("grok-4.1-fast-reasoning");
    expect(normalizeVertexModelId("grok-4.20-0309-non-reasoning")).toBe("grok-4.20-non-reasoning");
  });

  it("is case-insensitive on aliases", () => {
    expect(normalizeVertexModelId("GROK-4-FAST-REASONING")).toBe("grok-4.1-fast-reasoning");
  });

  it("trims whitespace", () => {
    expect(normalizeVertexModelId("  grok-4.20-reasoning  ")).toBe("grok-4.20-reasoning");
  });

  it("returns the input bare value when unknown so error messages can surface the original", () => {
    expect(normalizeVertexModelId("grok-7-quantum")).toBe("grok-7-quantum");
  });
});

describe("isKnownVertexModelId", () => {
  it("returns true for every catalog id", () => {
    for (const id of getVertexModelIds()) {
      expect(isKnownVertexModelId(id)).toBe(true);
    }
  });

  it("returns true for declared aliases", () => {
    expect(isKnownVertexModelId("grok-4-1-fast-reasoning")).toBe(true);
  });

  it("returns false for unknown models", () => {
    expect(isKnownVertexModelId("grok-7-quantum")).toBe(false);
  });
});

describe("getVertexRequestModelId", () => {
  it("prepends xai/ to the canonical id", () => {
    expect(getVertexRequestModelId("grok-4.20-reasoning")).toBe("xai/grok-4.20-reasoning");
  });

  it("normalizes aliases before formatting", () => {
    expect(getVertexRequestModelId("grok-4-1-fast-reasoning")).toBe("xai/grok-4.1-fast-reasoning");
  });

  it("does not double-prefix when input already has xai/", () => {
    expect(getVertexRequestModelId("xai/grok-4.20-reasoning")).toBe("xai/grok-4.20-reasoning");
  });

  it("preserves unknown ids so the error surface includes the original input", () => {
    expect(getVertexRequestModelId("grok-7-quantum")).toBe("xai/grok-7-quantum");
  });
});
