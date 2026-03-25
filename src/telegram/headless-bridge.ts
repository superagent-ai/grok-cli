import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";
import { Agent } from "../agent/agent";
import {
  getApiKey,
  getBaseURL,
  getCurrentModel,
  getCurrentSandboxMode,
  getTelegramBotToken,
  loadUserSettings,
  type SandboxMode,
  saveApprovedTelegramUserId,
  saveUserSettings,
} from "../utils/settings";
import { createTelegramBridge } from "./bridge";
import {
  resolveTelegramHeadlessBridgePaths,
  type TelegramHeadlessBridgePathOptions,
  type TelegramHeadlessBridgePaths,
} from "./headless-bridge-paths";
import { approvePairingCode } from "./pairing";
import { createTurnCoordinator } from "./turn-coordinator";

export interface TelegramHeadlessBridgeOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  sandboxMode?: SandboxMode;
  maxToolRounds?: number;
  logFile?: string;
  pairCodeFile?: string;
}

interface TelegramHeadlessStartupConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  sandboxMode: SandboxMode;
  maxToolRounds: number;
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendLog(logFile: string, message: string): void {
  ensureParentDir(logFile);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

function truncate(text: string, limit = 160): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

function ensurePairCodeFile(pairCodeFile: string): void {
  ensureParentDir(pairCodeFile);
  if (!fs.existsSync(pairCodeFile)) {
    fs.writeFileSync(pairCodeFile, "", "utf8");
  }
}

function buildTelegramAgentFactory(startupConfig: TelegramHeadlessStartupConfig): (userId: number) => Agent {
  const agents = new Map<number, Agent>();

  return (userId: number) => {
    const existing = agents.get(userId);
    if (existing) {
      return existing;
    }

    const settings = loadUserSettings();
    const sessionId = settings.telegram?.sessionsByUserId?.[String(userId)];
    const agent = new Agent(
      startupConfig.apiKey,
      startupConfig.baseURL,
      startupConfig.model,
      startupConfig.maxToolRounds,
      { session: sessionId, sandboxMode: startupConfig.sandboxMode },
    );

    const nextSessionId = agent.getSessionId();
    if (!sessionId && nextSessionId) {
      saveUserSettings({
        telegram: {
          ...settings.telegram,
          sessionsByUserId: {
            ...settings.telegram?.sessionsByUserId,
            [String(userId)]: nextSessionId,
          },
        },
      });
    }

    agents.set(userId, agent);
    return agent;
  };
}

async function fetchBotIdentity(token: string, signal?: AbortSignal): Promise<{ username?: string; id: number }> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal });
  const data = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { username?: string; id: number };
  };
  if (!data.ok || !data.result) {
    throw new Error(data.description || "Telegram getMe failed");
  }
  return data.result;
}

export async function runTelegramHeadlessBridge(options: TelegramHeadlessBridgeOptions = {}): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error("Missing Telegram bot token in user settings or TELEGRAM_BOT_TOKEN.");
  }

  const apiKey = options.apiKey ?? getApiKey();
  if (!apiKey) {
    throw new Error("Missing Grok API key.");
  }

  const startupConfig: TelegramHeadlessStartupConfig = {
    apiKey,
    baseURL: options.baseURL ?? getBaseURL(),
    model: options.model ?? getCurrentModel(),
    sandboxMode: options.sandboxMode ?? getCurrentSandboxMode(),
    maxToolRounds: options.maxToolRounds ?? 400,
  };
  const pathOptions: TelegramHeadlessBridgePathOptions = {
    logFile: options.logFile,
    pairCodeFile: options.pairCodeFile,
  };
  const paths: TelegramHeadlessBridgePaths = resolveTelegramHeadlessBridgePaths(process.cwd(), pathOptions);

  ensurePairCodeFile(paths.pairCodeFile);

  const coordinator = createTurnCoordinator();
  const getTelegramAgent = buildTelegramAgentFactory(startupConfig);
  const bridge = createTelegramBridge({
    token,
    getApprovedUserIds: () => loadUserSettings().telegram?.approvedUserIds ?? [],
    coordinator,
    getTelegramAgent,
    onUserMessage: (event) => {
      appendLog(paths.logFile, `user ${event.userId}: ${truncate(event.content)}`);
    },
    onAssistantMessage: (event) => {
      if (event.done) {
        appendLog(paths.logFile, `assistant ${event.userId}: ${truncate(event.content)}`);
      }
    },
    onToolCalls: (event) => {
      const names = event.toolCalls.map((toolCall) => toolCall.function.name).join(", ");
      appendLog(paths.logFile, `tools ${event.userId}: ${names}`);
    },
    onToolResult: (event) => {
      appendLog(paths.logFile, `tool_result ${event.userId}: ${event.toolCall.function.name}`);
    },
    onError: (message) => {
      appendLog(paths.logFile, `bridge_error: ${message}`);
    },
  });

  let lastPairInput = "";
  let pairWatcher: ReturnType<typeof setInterval> | undefined;
  let bridgeStarted = false;
  let stopping = false;
  let resolveShutdown: (() => void) | undefined;
  const shutdownComplete = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });
  const startupAbortController = new AbortController();

  const stopPairWatcher = () => {
    if (pairWatcher) {
      clearInterval(pairWatcher);
      pairWatcher = undefined;
    }
  };

  const stop = async (signal: string) => {
    if (stopping) {
      return;
    }

    stopping = true;
    startupAbortController.abort();
    stopPairWatcher();
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
    appendLog(paths.logFile, `shutdown: ${signal}`);
    if (bridgeStarted) {
      await bridge.stop().catch((error: unknown) => {
        appendLog(paths.logFile, `shutdown_error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    resolveShutdown?.();
  };

  const onSigInt = () => {
    void stop("SIGINT");
  };
  const onSigTerm = () => {
    void stop("SIGTERM");
  };

  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);

  try {
    const bot = await fetchBotIdentity(token, startupAbortController.signal);
    if (stopping) {
      await shutdownComplete;
      return;
    }

    appendLog(paths.logFile, `bot_ready username=@${bot.username ?? "unknown"} id=${bot.id}`);
    appendLog(paths.logFile, `approved_users=${(loadUserSettings().telegram?.approvedUserIds ?? []).length}`);
    appendLog(paths.logFile, "telegram_bridge_starting");
    bridge.start();
    bridgeStarted = true;
    appendLog(paths.logFile, "telegram_bridge_started");

    pairWatcher = setInterval(() => {
      try {
        const code = fs.readFileSync(paths.pairCodeFile, "utf8").trim().toUpperCase();
        if (!code || code === lastPairInput) {
          return;
        }

        lastPairInput = code;
        const result = approvePairingCode(code);
        if (result.ok) {
          saveApprovedTelegramUserId(result.userId);
          fs.writeFileSync(paths.pairCodeFile, "", "utf8");
          appendLog(paths.logFile, `pair_approved user=${result.userId} code=${code.slice(0, 2)}****`);
          return;
        }

        appendLog(paths.logFile, `pair_rejected: ${result.error}`);
      } catch (error) {
        appendLog(paths.logFile, `pair_watcher_error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 1000);

    await shutdownComplete;
  } catch (error) {
    if (!stopping) {
      stopPairWatcher();
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
      if (bridgeStarted) {
        await bridge.stop().catch((stopError: unknown) => {
          appendLog(
            paths.logFile,
            `shutdown_error: ${stopError instanceof Error ? stopError.message : String(stopError)}`,
          );
        });
      }
      throw error;
    }

    await shutdownComplete;
  }
}
