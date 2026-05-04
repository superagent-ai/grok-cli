import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasTelegramModelAuth } from "./headless-bridge";
import { resolveTelegramHeadlessBridgePaths } from "./headless-bridge-paths";

vi.mock("../agent/agent", () => ({
  Agent: class {},
}));

const originalApiKey = process.env.GROK_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.GROK_API_KEY;
  } else {
    process.env.GROK_API_KEY = originalApiKey;
  }
});

describe("resolveTelegramHeadlessBridgePaths", () => {
  it("uses default files in the provided cwd", () => {
    const cwd = path.resolve("fixture-workspace");

    expect(resolveTelegramHeadlessBridgePaths(cwd)).toEqual({
      logFile: path.resolve(cwd, "telegram-remote-bridge.log"),
      pairCodeFile: path.resolve(cwd, "telegram-pair-code.txt"),
    });
  });

  it("resolves custom relative paths from the provided cwd", () => {
    const cwd = path.resolve("fixture-workspace");

    expect(
      resolveTelegramHeadlessBridgePaths(cwd, {
        logFile: path.join("logs", "bridge.log"),
        pairCodeFile: path.join("state", "pair.txt"),
      }),
    ).toEqual({
      logFile: path.resolve(cwd, "logs", "bridge.log"),
      pairCodeFile: path.resolve(cwd, "state", "pair.txt"),
    });
  });
});

describe("hasTelegramModelAuth", () => {
  it("accepts an explicit CLI api key even when saved auth is absent", () => {
    delete process.env.GROK_API_KEY;

    expect(hasTelegramModelAuth("cli-key")).toBe(true);
  });
});
