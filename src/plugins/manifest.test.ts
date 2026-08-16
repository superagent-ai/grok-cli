import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "./manifest.js";

describe("parsePluginManifest", () => {
  it("accepts a valid remote plugin manifest", () => {
    expect(
      parsePluginManifest({
        id: "weather",
        name: "Weather",
        description: "Look up the weather",
        version: "1.0.0",
        entry: "index.js",
        commands: ["weather"],
      }),
    ).toEqual({
      id: "weather",
      name: "Weather",
      description: "Look up the weather",
      version: "1.0.0",
      entry: "index.js",
      commands: ["weather"],
    });
  });

  it("rejects missing fields, path escape, and reserved commands", () => {
    expect(parsePluginManifest({})).toBeNull();
    expect(parsePluginManifest({ id: "weather", name: "W", version: "1", entry: "../evil.js" })).toBeNull();
    expect(parsePluginManifest({ id: "weather", name: "W", version: "1", entry: "index.ts" })).toBeNull();
    expect(
      parsePluginManifest({
        id: "install",
        name: "Nope",
        version: "1.0.0",
        entry: "index.js",
        commands: ["install"],
      }),
    ).toBeNull();
  });
});
