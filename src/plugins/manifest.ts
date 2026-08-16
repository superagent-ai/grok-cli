import { BUNDLED_PLUGINS } from "./catalog.js";

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const PLUGIN_ENTRY_RE = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.js$/;
const RESERVED_COMMANDS = new Set([
  "install",
  "uninstall",
  "plugins",
  "plugin",
  "help",
  "exit",
  "quit",
  "q",
  "clear",
  "model",
  "models",
  "sandbox",
  "recap",
  "recaps",
  "remote-control",
  "mcp",
  "mcps",
  "agents",
  "agent",
  "schedule",
  "schedules",
  "review",
  "verify",
  "commit-push",
  "commit-pr",
  "wallet",
  "btw",
  "resume",
  "sessions",
  "session",
  "skills",
  "update",
  "new",
  ...BUNDLED_PLUGINS.flatMap((plugin) => [plugin.id, ...plugin.commands]),
]);

export interface RemotePluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  entry: string;
  commands: string[];
}

export function parsePluginManifest(raw: unknown): RemotePluginManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const version = typeof value.version === "string" ? value.version.trim() : "";
  const entry = typeof value.entry === "string" ? value.entry.trim() : "";
  const commands = Array.isArray(value.commands)
    ? value.commands.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase())
    : [];

  if (!PLUGIN_ID_RE.test(id) || RESERVED_COMMANDS.has(id)) return null;
  if (!name || !version) return null;
  if (!PLUGIN_ENTRY_RE.test(entry) || entry.includes("..")) return null;
  if (commands.some((command) => !PLUGIN_ID_RE.test(command) || RESERVED_COMMANDS.has(command))) return null;

  return {
    id,
    name,
    description,
    version,
    entry,
    commands: [...new Set(commands.length > 0 ? commands : [id])],
  };
}

export function isReservedPluginCommand(command: string): boolean {
  return RESERVED_COMMANDS.has(command.trim().toLowerCase());
}
