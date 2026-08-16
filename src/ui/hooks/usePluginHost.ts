import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findInstalledRemotePlugin,
  formatPluginList,
  type GrokPlugin,
  installGitHubPlugin,
  isPluginInstalled,
  listInstalledRemotePlugins,
  loadRemotePlugins,
  type PluginHostState,
  type PluginSlashCommand,
  type PluginTurnStatus,
  parsePluginCommand,
  parsePluginSpec,
  pluginUsageText,
  reservedPluginCommands,
  runPluginCommand,
  uninstallGitHubPlugin,
} from "../../plugins/index.js";
import { handleSuggesterCommand } from "../../suggester/handle-command.js";
import type { ChatEntry } from "../../types/index.js";
import { loadInstalledPlugins, saveInstalledPlugins } from "../../utils/settings.js";
import { usePromptSuggester } from "./usePromptSuggester.js";

export const PLUGIN_TYPED_SLASH_COMMANDS = ["/install", "/uninstall", "/plugins", "/plugin"] as const;

export function pluginReservedCommands(extra: string[] = []): string[] {
  return [
    ...PLUGIN_TYPED_SLASH_COMMANDS,
    ...reservedPluginCommands().map((command) => `/${command}`),
    ...extra.map((command) => (command.startsWith("/") ? command : `/${command}`)),
  ];
}

export function usePluginHost(
  inputRef: React.RefObject<TextareaRenderable | null>,
  cwd: string,
  sessionId: string | null,
  baseURL: string,
): PluginHostState {
  const [installed, setInstalled] = useState<string[]>(() => loadInstalledPlugins());
  const [remoteRecords, setRemoteRecords] = useState(() => listInstalledRemotePlugins());
  const [remotePlugins, setRemotePlugins] = useState<GrokPlugin[]>([]);
  const suggesterActive = isPluginInstalled(installed, "suggester");
  const suggester = usePromptSuggester(inputRef, cwd, sessionId, baseURL, suggesterActive);

  const reloadRemote = useCallback(async () => {
    const records = listInstalledRemotePlugins();
    setRemoteRecords(records);
    setRemotePlugins(await loadRemotePlugins(records));
  }, []);

  useEffect(() => {
    void reloadRemote();
  }, [reloadRemote]);

  useEffect(() => {
    if (!sessionId || !suggesterActive) return;
    suggester.ensureSeed();
  }, [sessionId, suggester.ensureSeed, suggesterActive]);

  const persist = useCallback((next: string[]) => {
    const saved = saveInstalledPlugins(next);
    setInstalled(saved);
    return saved;
  }, []);

  const installBundled = useCallback(
    (id: string) => {
      const result = runPluginCommand({ action: "install", id }, installed);
      persist(result.installed);
      return result.message;
    },
    [installed, persist],
  );

  const uninstall = useCallback(
    (id: string) => {
      const remote = findInstalledRemotePlugin(id);
      if (remote) {
        const result = uninstallGitHubPlugin(id);
        void reloadRemote();
        return result.message;
      }
      const result = runPluginCommand({ action: "uninstall", id }, installed);
      persist(result.installed);
      if (!isPluginInstalled(result.installed, "suggester")) {
        suggester.cancel();
        suggester.dismiss();
      }
      return result.message;
    },
    [installed, persist, reloadRemote, suggester],
  );

  const formatList = useCallback(() => formatPluginList(installed, remoteRecords), [installed, remoteRecords]);

  const slashCommands = useMemo<PluginSlashCommand[]>(() => {
    const items: PluginSlashCommand[] = [
      { id: "plugins", description: "List installed plugins", aliases: ["plugin"] },
      { id: "install", description: "Install a bundled or GitHub plugin" },
      { id: "uninstall", description: "Uninstall a plugin" },
    ];
    if (suggesterActive) {
      items.push({ id: "suggester", description: "Next-prompt suggestions and project seed" });
    }
    for (const plugin of remotePlugins) {
      for (const command of plugin.slashCommands ?? []) {
        if (!items.some((item) => item.id === command.id)) items.push(command);
      }
    }
    return items;
  }, [remotePlugins, suggesterActive]);

  const handleCommand = useCallback(
    (cmd: string, reply: (text: string) => void) => {
      const pluginCommand = parsePluginCommand(cmd);
      if (pluginCommand) {
        if (pluginCommand.action === "list") {
          reply(formatList());
          return true;
        }
        if (pluginCommand.action === "uninstall") {
          if (!pluginCommand.id) {
            reply(pluginUsageText());
            return true;
          }
          reply(uninstall(pluginCommand.id));
          return true;
        }

        const spec = parsePluginSpec(pluginCommand.id);
        if (spec.kind === "bundled") {
          reply(installBundled(spec.id));
          return true;
        }
        if (spec.kind === "github") {
          reply(`Installing ${spec.owner}/${spec.repo}${spec.ref ? `@${spec.ref}` : ""}...`);
          void installGitHubPlugin(spec).then(async (result) => {
            if (result.ok) await reloadRemote();
            reply(result.message);
          });
          return true;
        }
        reply(
          spec.reason === "missing" ? pluginUsageText() : `Unknown plugin "${pluginCommand.id}".\n\n${formatList()}`,
        );
        return true;
      }

      for (const plugin of remotePlugins) {
        if (plugin.handleCommand?.(cmd, { reply })) return true;
      }

      if (!suggesterActive) return false;
      return handleSuggesterCommand(cmd, suggester, reply);
    },
    [formatList, installBundled, reloadRemote, remotePlugins, suggester, suggesterActive, uninstall],
  );

  const requestAfterTurn = useCallback(
    (entries: ChatEntry[], status: PluginTurnStatus, abortNote?: string) => {
      for (const plugin of remotePlugins) {
        plugin.requestAfterTurn?.(entries, status, abortNote);
      }
      if (!suggesterActive) return;
      suggester.requestAfterTurn(entries, status, abortNote);
    },
    [remotePlugins, suggester, suggesterActive],
  );

  const recordSubmit = useCallback(
    (userPrompt: string) => {
      for (const plugin of remotePlugins) {
        plugin.recordSubmit?.(userPrompt);
      }
      if (!suggesterActive) return;
      suggester.recordSubmit(userPrompt);
    },
    [remotePlugins, suggester, suggesterActive],
  );

  const ensureSeed = useCallback(() => {
    for (const plugin of remotePlugins) {
      plugin.ensureSeed?.();
    }
    if (!suggesterActive) return;
    suggester.ensureSeed();
  }, [remotePlugins, suggester, suggesterActive]);

  const cancel = useCallback(() => {
    for (const plugin of remotePlugins) {
      plugin.cancel?.();
    }
    suggester.cancel();
  }, [remotePlugins, suggester]);

  const dismiss = useCallback(() => {
    for (const plugin of remotePlugins) {
      plugin.dismiss?.();
    }
    suggester.dismiss();
  }, [remotePlugins, suggester]);

  const handleKey = useCallback(
    (key: KeyEvent, blocked: boolean) => {
      for (const plugin of remotePlugins) {
        if (plugin.handleKey?.(key, blocked)) return true;
      }
      if (!suggesterActive) return false;
      return suggester.handleKey(key, blocked);
    },
    [remotePlugins, suggester, suggesterActive],
  );

  const remoteGhost = remotePlugins.find((plugin) => plugin.ghostVisible && plugin.ghostSuggestion);

  return {
    installed,
    slashCommands,
    ghostSuggestion: remoteGhost?.ghostSuggestion ?? (suggesterActive ? suggester.suggestion : null),
    ghostVisible: Boolean(remoteGhost?.ghostVisible || (suggesterActive && suggester.visible)),
    handleCommand,
    requestAfterTurn,
    recordSubmit,
    ensureSeed,
    cancel,
    dismiss,
    handleKey,
    install: installBundled,
    uninstall,
    formatList,
  };
}
