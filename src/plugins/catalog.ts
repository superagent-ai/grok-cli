export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  commands: string[];
}

export const BUNDLED_PLUGINS: PluginManifest[] = [
  {
    id: "suggester",
    name: "Prompt suggester",
    description: "Ghost a likely next prompt after each interactive turn",
    version: "1.0.0",
    commands: ["suggester"],
  },
];

export function getBundledPlugin(id: string): PluginManifest | undefined {
  const normalized = id.trim().toLowerCase();
  return BUNDLED_PLUGINS.find((plugin) => plugin.id === normalized);
}

export function bundledPluginIds(): string[] {
  return BUNDLED_PLUGINS.map((plugin) => plugin.id);
}

export function reservedPluginCommands(): string[] {
  return BUNDLED_PLUGINS.flatMap((plugin) => plugin.commands);
}
