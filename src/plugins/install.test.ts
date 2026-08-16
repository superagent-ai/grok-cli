import { mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { installGitHubPlugin, uninstallGitHubPlugin } from "./install.js";
import { listInstalledRemotePlugins } from "./registry.js";
import { parsePluginSpec } from "./spec.js";

const dirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "grok-plugin-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function githubSpec(raw: string) {
  const spec = parsePluginSpec(raw);
  if (spec.kind !== "github") throw new Error(`expected github spec, got ${spec.kind}`);
  return spec;
}

describe("installGitHubPlugin", () => {
  it("fetches plugin.json and entry, then records the install", async () => {
    const home = tempHome();
    const files = new Map([
      [
        "plugin.json",
        JSON.stringify({
          id: "weather",
          name: "Weather",
          description: "Look up the weather",
          version: "1.0.0",
          entry: "index.js",
          commands: ["weather"],
        }),
      ],
      ["index.js", "export function createPlugin() { return { id: 'weather' }; }\n"],
    ]);

    const result = await installGitHubPlugin(githubSpec("acme/weather@v1"), {
      homeDir: home,
      fetchText: async (url) => {
        if (url.includes("/plugin.json")) return files.get("plugin.json") ?? null;
        if (url.endsWith("/index.js")) return files.get("index.js") ?? null;
        return null;
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.id).toBe("weather");
    expect(result.record.spec).toBe("acme/weather@v1");
    expect(readFileSync(result.record.entryPath, "utf8")).toContain("createPlugin");
    expect(listInstalledRemotePlugins(home).map((item) => item.id)).toEqual(["weather"]);
  });

  it("rejects a missing manifest and leaves no files", async () => {
    const home = tempHome();
    const result = await installGitHubPlugin(githubSpec("acme/missing"), {
      homeDir: home,
      fetchText: async () => null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("plugin.json");
    expect(listInstalledRemotePlugins(home)).toEqual([]);
  });

  it("uninstalls a remote plugin by id or spec", async () => {
    const home = tempHome();
    const installed = await installGitHubPlugin(githubSpec("acme/weather"), {
      homeDir: home,
      fetchText: async (url) => {
        if (url.includes("/plugin.json")) {
          return JSON.stringify({
            id: "weather",
            name: "Weather",
            version: "1.0.0",
            entry: "index.js",
          });
        }
        return "export function createPlugin() { return { id: 'weather' }; }\n";
      },
    });
    expect(installed.ok).toBe(true);
    const removed = uninstallGitHubPlugin("weather", home);
    expect(removed.ok).toBe(true);
    expect(listInstalledRemotePlugins(home)).toEqual([]);
  });
});
