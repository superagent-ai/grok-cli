import { describe, expect, it } from "vitest";
import { isGhostAcceptKey } from "./keys.js";

describe("isGhostAcceptKey", () => {
  it("matches space and right only when configured", () => {
    expect(isGhostAcceptKey({ name: "space" }, ["space"])).toBe(true);
    expect(isGhostAcceptKey({ sequence: " " }, ["space", "right"])).toBe(true);
    expect(isGhostAcceptKey({ name: "right" }, ["right"])).toBe(true);
    expect(isGhostAcceptKey({ name: "right" }, ["space"])).toBe(false);
    expect(isGhostAcceptKey({ name: "a", sequence: "a" }, ["space", "right"])).toBe(false);
  });
});
