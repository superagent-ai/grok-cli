import { BUNDLED_PLUGINS, getBundledPlugin } from "./catalog.js";
import { isPluginInstalled, withoutPluginInstalled, withPluginInstalled } from "./installed.js";

export type PluginCommandAction = "install" | "uninstall" | "list";

export interface ParsedPluginCommand {
  action: PluginCommandAction;
  id: string;
}

export interface PluginCommandResult {
  installed: string[];
  message: string;
}

export function parsePluginCommand(cmd: string): ParsedPluginCommand | null {
  const trimmed = cmd.trim();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1).trim();
  const [first, ...tail] = body.split(/\s+/).filter(Boolean);
  const verb = (first ?? "").toLowerCase();
  const id = tail.join(" ").trim();

  if (verb === "install") return { action: "install", id };
  if (verb === "uninstall") return { action: "uninstall", id };
  if (verb === "plugins" || verb === "plugin") return { action: "list", id };
  return null;
}

export function pluginUsageText(): string {
  return [
    "Usage:",
    "  /plugins                      List installed plugins",
    "  /install <id>                 Enable a bundled plugin",
    "  /install owner/repo[@ref]     Install a GitHub plugin",
    "  /uninstall <id|spec>          Remove a plugin",
    "",
    "Bundled:",
    ...BUNDLED_PLUGINS.map((plugin) => `  ${plugin.id.padEnd(14)} ${plugin.description}`),
  ].join("\n");
}

export function formatPluginList(
  installed: readonly string[],
  remote: Array<{ id: string; spec: string; description?: string }> = [],
): string {
  const lines = ["Bundled plugins:"];
  for (const plugin of BUNDLED_PLUGINS) {
    const status = isPluginInstalled(installed, plugin.id) ? "installed" : "not installed";
    lines.push(`  ${plugin.id} — ${plugin.description} (${status})`);
  }
  lines.push("", "Remote plugins:");
  if (remote.length === 0) {
    lines.push("  none");
  } else {
    for (const plugin of remote) {
      lines.push(`  ${plugin.id} — ${plugin.description || plugin.spec} (${plugin.spec})`);
    }
  }
  lines.push("", "Install with /install <id> or /install owner/repo.");
  return lines.join("\n");
}

export function runPluginCommand(command: ParsedPluginCommand, installed: readonly string[]): PluginCommandResult {
  if (command.action === "list") {
    return { installed: [...installed], message: formatPluginList(installed) };
  }

  if (!command.id) {
    return { installed: [...installed], message: pluginUsageText() };
  }

  const plugin = getBundledPlugin(command.id);
  if (!plugin) {
    return {
      installed: [...installed],
      message: `Unknown plugin "${command.id}".\n\n${formatPluginList(installed)}`,
    };
  }

  if (command.action === "install") {
    if (isPluginInstalled(installed, plugin.id)) {
      return { installed: [...installed], message: `${plugin.name} is already installed.` };
    }
    return {
      installed: withPluginInstalled(installed, plugin.id),
      message: `Installed ${plugin.id}. /${plugin.commands[0] ?? plugin.id} is now available.`,
    };
  }

  if (!isPluginInstalled(installed, plugin.id)) {
    return { installed: [...installed], message: `${plugin.name} is not installed.` };
  }

  return {
    installed: withoutPluginInstalled(installed, plugin.id),
    message: `Uninstalled ${plugin.id}.`,
  };
}
