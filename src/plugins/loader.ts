import { pathToFileURL } from "url";
import type { InstalledRemotePlugin } from "./registry.js";
import type { GrokPlugin } from "./types.js";

export async function loadRemotePlugin(record: InstalledRemotePlugin): Promise<GrokPlugin | null> {
  try {
    const href = `${pathToFileURL(record.entryPath).href}?t=${Date.now()}`;
    const mod = (await import(href)) as { createPlugin?: unknown; default?: unknown };
    const factory = typeof mod.createPlugin === "function" ? mod.createPlugin : mod.default;
    if (typeof factory !== "function") return null;

    const created = await factory();
    if (!created || typeof created !== "object") return null;
    const plugin = created as GrokPlugin;
    const id = typeof plugin.id === "string" && plugin.id.trim() ? plugin.id.trim().toLowerCase() : record.id;
    if (id !== record.id) return null;

    return {
      ...plugin,
      id: record.id,
      slashCommands:
        plugin.slashCommands && plugin.slashCommands.length > 0
          ? plugin.slashCommands
          : record.commands.map((command) => ({
              id: command,
              description: record.description || record.name,
            })),
    };
  } catch {
    return null;
  }
}

export async function loadRemotePlugins(records: readonly InstalledRemotePlugin[]): Promise<GrokPlugin[]> {
  const loaded: GrokPlugin[] = [];
  for (const record of records) {
    const plugin = await loadRemotePlugin(record);
    if (plugin) loaded.push(plugin);
  }
  return loaded;
}
