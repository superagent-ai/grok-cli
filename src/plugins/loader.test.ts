import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRemotePlugin } from "./loader.js";
import type { InstalledRemotePlugin } from "./registry.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function record(overrides: Partial<InstalledRemotePlugin> = {}): InstalledRemotePlugin {
  const dir = mkdtempSync(path.join(os.tmpdir(), "grok-plugin-load-"));
  dirs.push(dir);
  const entryPath = path.join(dir, "index.js");
  return {
    id: "weather",
    name: "Weather",
    description: "Look up the weather",
    version: "1.0.0",
    commands: ["weather"],
    spec: "acme/weather",
    owner: "acme",
    repo: "weather",
    ref: "",
    subdir: "",
    entry: "index.js",
    entryPath,
    installDir: dir,
    installedAt: "2026-08-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("loadRemotePlugin", () => {
  it("loads createPlugin from a local entry file", async () => {
    const installed = record();
    writeFileSync(
      installed.entryPath,
      `export function createPlugin() {
        return {
          id: "weather",
          slashCommands: [{ id: "weather", description: "Look up the weather" }],
          handleCommand(cmd, ctx) {
            if (!cmd.startsWith("/weather")) return false;
            ctx.reply("sunny");
            return true;
          },
        };
      }`,
    );

    const plugin = await loadRemotePlugin(installed);
    expect(plugin?.id).toBe("weather");
    expect(plugin?.slashCommands?.[0]?.id).toBe("weather");
    const replies: string[] = [];
    expect(plugin?.handleCommand?.("/weather", { reply: (text) => replies.push(text) })).toBe(true);
    expect(replies).toEqual(["sunny"]);
  });

  it("returns null when the entry has no factory", async () => {
    const installed = record();
    writeFileSync(installed.entryPath, "export const nope = true;\n");
    expect(await loadRemotePlugin(installed)).toBeNull();
  });
});
