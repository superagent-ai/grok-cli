import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { RemotePluginManifest } from "./manifest.js";
import type { GitHubPluginSpec } from "./spec.js";
import { githubPluginId } from "./spec.js";

export interface InstalledRemotePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  commands: string[];
  spec: string;
  owner: string;
  repo: string;
  ref: string;
  subdir: string;
  entry: string;
  entryPath: string;
  installDir: string;
  installedAt: string;
}

export function pluginsRoot(homeDir = os.homedir()): string {
  return path.join(homeDir, ".grok", "plugins");
}

export function pluginRegistryPath(homeDir = os.homedir()): string {
  return path.join(pluginsRoot(homeDir), "installed.json");
}

export function listInstalledRemotePlugins(homeDir = os.homedir()): InstalledRemotePlugin[] {
  const filePath = pluginRegistryPath(homeDir);
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { plugins?: unknown };
    if (!Array.isArray(parsed.plugins)) return [];
    return parsed.plugins.filter(isInstalledRemotePlugin);
  } catch {
    return [];
  }
}

export function saveInstalledRemotePlugins(plugins: InstalledRemotePlugin[], homeDir = os.homedir()): void {
  const filePath = pluginRegistryPath(homeDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify({ plugins }, null, 2), { mode: 0o600 });
}

export function findInstalledRemotePlugin(query: string, homeDir = os.homedir()): InstalledRemotePlugin | undefined {
  const normalized = query.trim().toLowerCase();
  return listInstalledRemotePlugins(homeDir).find(
    (plugin) => plugin.id === normalized || plugin.spec.toLowerCase() === normalized,
  );
}

export function pluginInstallDir(spec: GitHubPluginSpec, homeDir = os.homedir()): string {
  const slug = githubPluginId(spec).replace(/[/@]/g, "__");
  return path.join(pluginsRoot(homeDir), slug);
}

export function toInstalledRemotePlugin(
  spec: GitHubPluginSpec,
  manifest: RemotePluginManifest,
  installDir: string,
): InstalledRemotePlugin {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    commands: manifest.commands,
    spec: githubPluginId(spec),
    owner: spec.owner,
    repo: spec.repo,
    ref: spec.ref,
    subdir: spec.subdir,
    entry: manifest.entry,
    entryPath: path.join(installDir, manifest.entry),
    installDir,
    installedAt: new Date().toISOString(),
  };
}

function isInstalledRemotePlugin(value: unknown): value is InstalledRemotePlugin {
  if (!value || typeof value !== "object") return false;
  const plugin = value as InstalledRemotePlugin;
  return (
    typeof plugin.id === "string" &&
    typeof plugin.name === "string" &&
    typeof plugin.version === "string" &&
    typeof plugin.spec === "string" &&
    typeof plugin.entryPath === "string" &&
    typeof plugin.installDir === "string" &&
    Array.isArray(plugin.commands)
  );
}
