import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parsePluginManifest } from "./manifest.js";
import {
  findInstalledRemotePlugin,
  type InstalledRemotePlugin,
  listInstalledRemotePlugins,
  pluginInstallDir,
  saveInstalledRemotePlugins,
  toInstalledRemotePlugin,
} from "./registry.js";
import type { GitHubPluginSpec } from "./spec.js";
import { githubPluginId } from "./spec.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT_BYTES = 256_000;

export interface PluginFetchOptions {
  homeDir?: string;
  fetchText?: (url: string) => Promise<string | null>;
}

export type InstallPluginResult =
  | { ok: true; record: InstalledRemotePlugin; message: string }
  | { ok: false; message: string };

export type UninstallPluginResult = { ok: true; message: string } | { ok: false; message: string };

export function githubRawUrl(spec: GitHubPluginSpec, filePath: string): string {
  const ref = spec.ref || "HEAD";
  const prefix = spec.subdir ? `${spec.subdir.replace(/\/+$/, "")}/` : "";
  return `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${ref}/${prefix}${filePath}`;
}

export async function installGitHubPlugin(
  spec: GitHubPluginSpec,
  options: PluginFetchOptions = {},
): Promise<InstallPluginResult> {
  const homeDir = options.homeDir ?? os.homedir();
  const fetchText = options.fetchText ?? fetchGitHubText;
  const manifestText = await fetchText(githubRawUrl(spec, "plugin.json"));
  if (!manifestText) {
    return { ok: false, message: `Could not fetch plugin.json from ${githubPluginId(spec)}.` };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestText);
  } catch {
    return { ok: false, message: "plugin.json is not valid JSON." };
  }

  const manifest = parsePluginManifest(parsedJson);
  if (!manifest) {
    return {
      ok: false,
      message: "plugin.json is invalid. Need id, name, version, and a relative .js entry.",
    };
  }

  const existing = findInstalledRemotePlugin(manifest.id, homeDir);
  if (existing && existing.spec !== githubPluginId(spec)) {
    return { ok: false, message: `Plugin id "${manifest.id}" is already installed from ${existing.spec}.` };
  }

  const entryText = await fetchText(githubRawUrl(spec, manifest.entry));
  if (!entryText) {
    return { ok: false, message: `Could not fetch entry ${manifest.entry} from ${githubPluginId(spec)}.` };
  }

  const installDir = pluginInstallDir(spec, homeDir);
  const entryPath = path.join(installDir, manifest.entry);
  fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(entryPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(installDir, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(entryPath, entryText, { mode: 0o600 });

  const record = toInstalledRemotePlugin(spec, manifest, installDir);
  const next = listInstalledRemotePlugins(homeDir).filter((plugin) => plugin.id !== record.id);
  next.push(record);
  saveInstalledRemotePlugins(next, homeDir);

  return {
    ok: true,
    record,
    message: `Installed ${record.id} from ${record.spec}. /${record.commands[0] ?? record.id} is now available.`,
  };
}

export function uninstallGitHubPlugin(query: string, homeDir = os.homedir()): UninstallPluginResult {
  const existing = findInstalledRemotePlugin(query, homeDir);
  if (!existing) {
    return { ok: false, message: `Remote plugin "${query}" is not installed.` };
  }

  fs.rmSync(existing.installDir, { recursive: true, force: true });
  saveInstalledRemotePlugins(
    listInstalledRemotePlugins(homeDir).filter((plugin) => plugin.id !== existing.id),
    homeDir,
  );
  return { ok: true, message: `Uninstalled ${existing.id}.` };
}

async function fetchGitHubText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_TEXT_BYTES) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
