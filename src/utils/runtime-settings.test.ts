import { afterEach, describe, expect, it } from "vitest";
import { areSearchToolsEnabled, getHeadlessOutputFilePath, isBenchmarkMode } from "./settings";

const ORIGINAL_ENV = {
  GROK_BENCHMARK: process.env.GROK_BENCHMARK,
  GROK_DISABLE_SEARCH_TOOLS: process.env.GROK_DISABLE_SEARCH_TOOLS,
  GROK_HEADLESS_OUTPUT_FILE: process.env.GROK_HEADLESS_OUTPUT_FILE,
};

describe("runtime settings helpers", () => {
  afterEach(() => {
    if (ORIGINAL_ENV.GROK_BENCHMARK === undefined) {
      delete process.env.GROK_BENCHMARK;
    } else {
      process.env.GROK_BENCHMARK = ORIGINAL_ENV.GROK_BENCHMARK;
    }

    if (ORIGINAL_ENV.GROK_DISABLE_SEARCH_TOOLS === undefined) {
      delete process.env.GROK_DISABLE_SEARCH_TOOLS;
    } else {
      process.env.GROK_DISABLE_SEARCH_TOOLS = ORIGINAL_ENV.GROK_DISABLE_SEARCH_TOOLS;
    }

    if (ORIGINAL_ENV.GROK_HEADLESS_OUTPUT_FILE === undefined) {
      delete process.env.GROK_HEADLESS_OUTPUT_FILE;
    } else {
      process.env.GROK_HEADLESS_OUTPUT_FILE = ORIGINAL_ENV.GROK_HEADLESS_OUTPUT_FILE;
    }
  });

  it("detects benchmark mode from truthy env values", () => {
    process.env.GROK_BENCHMARK = "true";
    expect(isBenchmarkMode()).toBe(true);
    process.env.GROK_BENCHMARK = "0";
    expect(isBenchmarkMode()).toBe(false);
  });

  it("disables search tools from env", () => {
    delete process.env.GROK_DISABLE_SEARCH_TOOLS;
    expect(areSearchToolsEnabled()).toBe(true);

    process.env.GROK_DISABLE_SEARCH_TOOLS = "1";
    expect(areSearchToolsEnabled()).toBe(false);
  });

  it("returns a trimmed headless output path", () => {
    delete process.env.GROK_HEADLESS_OUTPUT_FILE;
    expect(getHeadlessOutputFilePath()).toBeUndefined();

    process.env.GROK_HEADLESS_OUTPUT_FILE = "  /tmp/grok.jsonl  ";
    expect(getHeadlessOutputFilePath()).toBe("/tmp/grok.jsonl");
  });
});
