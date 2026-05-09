import { describe, expect, it } from "vitest";
import { isProcessingStatusNudge } from "./processing-input";

describe("processing input helpers", () => {
  it("classifies common liveness nudges while a turn is processing", () => {
    expect(isProcessingStatusNudge("continue")).toBe(true);
    expect(isProcessingStatusNudge(" Continue ")).toBe(true);
    expect(isProcessingStatusNudge("status?")).toBe(true);
    expect(isProcessingStatusNudge("are you stuck?")).toBe(true);
  });

  it("does not classify substantive follow-ups as status nudges", () => {
    expect(isProcessingStatusNudge("continue by adding tests")).toBe(false);
    expect(isProcessingStatusNudge("now update the README")).toBe(false);
    expect(isProcessingStatusNudge("use option 2")).toBe(false);
  });
});
