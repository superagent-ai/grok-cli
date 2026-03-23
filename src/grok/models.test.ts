import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  getEffectiveReasoningEffort,
  getModelInfo,
  getSupportedReasoningEfforts,
  normalizeModelId,
} from "./models";

describe("models", () => {
  it("keeps the default model on a canonical reasoning id", () => {
    expect(DEFAULT_MODEL).toBe("grok-4-1-fast-reasoning");
  });

  it("normalizes current aliases to canonical ids", () => {
    expect(normalizeModelId("grok-4-1-fast")).toBe("grok-4-1-fast-reasoning");
    expect(normalizeModelId("grok-4.20-multi-agent")).toBe("grok-4.20-multi-agent-0309");
    expect(normalizeModelId("x-ai/grok-4.20-multi-agent-beta")).toBe("grok-4.20-multi-agent-0309");
    expect(normalizeModelId("xai/grok-code-fast-1")).toBe("grok-code-fast-1");
  });

  it("returns model metadata for aliased ids", () => {
    expect(getModelInfo("grok-4-1-fast")?.id).toBe("grok-4-1-fast-reasoning");
    expect(getModelInfo("grok-4.20-multi-agent")?.responsesOnly).toBe(true);
    expect(getModelInfo("grok-4.20-multi-agent")?.supportsClientTools).toBe(false);
  });

  it("reports supported reasoning-effort levels", () => {
    expect(getSupportedReasoningEfforts("grok-4.20-multi-agent-0309")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(getSupportedReasoningEfforts("grok-4-1-fast-reasoning")).toEqual(["low", "high"]);
    expect(getSupportedReasoningEfforts("grok-4-1-fast-non-reasoning")).toEqual([]);
  });

  it("resolves effective reasoning effort with defaults and overrides", () => {
    expect(getEffectiveReasoningEffort("grok-4.20-multi-agent-0309")).toBe("low");
    expect(getEffectiveReasoningEffort("grok-4.20-multi-agent-0309", "high")).toBe("high");
    expect(getEffectiveReasoningEffort("grok-4-1-fast-reasoning")).toBeUndefined();
  });
});
