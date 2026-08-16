import { BUNDLED_PLUGINS, getBundledPlugin } from "./catalog.js";

export function normalizeInstalledPlugins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(BUNDLED_PLUGINS.map((plugin) => plugin.id));
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && known.has(id)))];
}

export function withPluginInstalled(installed: readonly string[], id: string): string[] {
  const plugin = getBundledPlugin(id);
  if (!plugin) return normalizeInstalledPlugins(installed);
  return normalizeInstalledPlugins([...installed, plugin.id]);
}

export function withoutPluginInstalled(installed: readonly string[], id: string): string[] {
  const plugin = getBundledPlugin(id);
  if (!plugin) return normalizeInstalledPlugins(installed);
  return normalizeInstalledPlugins(installed).filter((item) => item !== plugin.id);
}

export function isPluginInstalled(installed: readonly string[], id: string): boolean {
  return normalizeInstalledPlugins(installed).includes(id.trim().toLowerCase());
}
