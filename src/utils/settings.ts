import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DEFAULT_MODEL, getEffectiveReasoningEffort, getModelIds, normalizeModelId } from "../grok/models";
import type { HooksConfig } from "../hooks/types";
import type { ReasoningEffort } from "../types/index";

export type TelegramStreamingMode = "off" | "partial";
export type TelegramAudioInputEngine = "whisper.cpp";
export type SandboxMode = "off" | "shuru";

export interface SandboxSecretConfig {
  name: string;
  fromEnv: string;
  hosts: string[];
}

export interface SandboxSettings {
  allowNet?: boolean;
  allowedHosts?: string[];
  ports?: string[];
  cpus?: number;
  memory?: number;
  diskSize?: number;
  secrets?: SandboxSecretConfig[];
  from?: string;
  allowEphemeralInstall?: boolean;
  guestWorkdir?: string;
  syncHostWorkspace?: boolean;
  verifyBaseFrom?: string;
  shellInit?: string[];
  hostBrowserCommandsOnHost?: boolean;
}

export const DEFAULT_TELEGRAM_AUDIO_INPUT_BINARY = "whisper-cli";
export const DEFAULT_TELEGRAM_AUDIO_INPUT_MODEL = "tiny.en";

export interface TelegramAudioInputSettings {
  /** Enable Telegram voice/audio transcription before sending text to the agent. Default: true. */
  enabled?: boolean;
  /** Reserved for future providers. The current built-in engine is whisper.cpp. */
  engine?: TelegramAudioInputEngine;
  /** Path or command name for the whisper.cpp CLI. Default: whisper-cli on PATH. */
  binaryPath?: string;
  /** Whisper.cpp model alias used for cache/download resolution. Default: tiny.en. */
  model?: string;
  /** Optional override for an exact ggml model path on disk. */
  modelPath?: string;
  /** Automatically download missing models into ~/.grok/models/stt. Default: true. */
  autoDownloadModel?: boolean;
  /** Whisper language code passed to the CLI. Default: en. */
  language?: string;
}

export interface TelegramSettings {
  botToken?: string;
  approvedUserIds?: number[];
  sessionsByUserId?: Record<string, string>;
  /** Live preview while generating. Default: partial (send + edit). Use `off` for buffer-then-send only. */
  streaming?: TelegramStreamingMode;
  /** Send `typing` chat action on an interval while the agent runs. Default: true. */
  typingIndicator?: boolean;
  /** Reserved: Bot API `sendMessageDraft` for private DMs (not implemented yet). */
  nativeDrafts?: boolean;
  audioInput?: TelegramAudioInputSettings;
}

export type McpRemoteTransport = "http" | "sse";

export interface McpServerConfig {
  id: string;
  label: string;
  enabled: boolean;
  transport: McpRemoteTransport | "stdio";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpSettings {
  servers?: McpServerConfig[];
}

export interface CustomSubagentConfig {
  name: string;
  model: string;
  instruction: string;
}

const RESERVED_SUBAGENT_NAMES = new Set([
  "general",
  "explore",
  "vision",
  "verify",
  "verify-detect",
  "verify-manifest",
  "computer",
]);

export function isReservedSubagentName(name: string): boolean {
  return RESERVED_SUBAGENT_NAMES.has(name.trim().toLowerCase());
}

export function parseSubAgentsRawList(raw: unknown): CustomSubagentConfig[] {
  if (!Array.isArray(raw)) return [];

  const validModels = new Set(getModelIds());
  const seen = new Set<string>();
  const agents: CustomSubagentConfig[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const model = typeof entry.model === "string" ? normalizeModelId(entry.model) : "";
    const instruction = typeof entry.instruction === "string" ? entry.instruction : "";

    if (!name || isReservedSubagentName(name) || !validModels.has(model)) {
      continue;
    }

    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    agents.push({ name, model, instruction });
  }

  return agents;
}

export function loadValidSubAgents(): CustomSubagentConfig[] {
  return parseSubAgentsRawList(loadUserSettings().subAgents);
}

export interface UserSettings {
  apiKey?: string;
  defaultModel?: string;
  sandboxMode?: SandboxMode;
  sandbox?: SandboxSettings;
  reasoningEffortByModel?: Record<string, ReasoningEffort>;
  telegram?: TelegramSettings;
  mcp?: McpSettings;
  subAgents?: CustomSubagentConfig[];
  hooks?: HooksConfig;
}

export interface ProjectSettings {
  model?: string;
  sandboxMode?: SandboxMode;
  sandbox?: SandboxSettings;
  hooks?: HooksConfig;
}

const USER_DIR = path.join(os.homedir(), ".grok");
const USER_SETTINGS_PATH = path.join(USER_DIR, "user-settings.json");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadUserSettings(): UserSettings {
  return readJson<UserSettings>(USER_SETTINGS_PATH) || {};
}

export function saveUserSettings(partial: Partial<UserSettings>): void {
  const current = loadUserSettings();
  const next: UserSettings = {
    ...current,
    ...partial,
    ...(partial.apiKey !== undefined ? { apiKey: partial.apiKey } : {}),
    ...(partial.defaultModel !== undefined ? { defaultModel: normalizeModelId(partial.defaultModel) } : {}),
    ...(partial.sandboxMode !== undefined ? { sandboxMode: normalizeSandboxMode(partial.sandboxMode) } : {}),
    ...(partial.reasoningEffortByModel !== undefined
      ? {
          reasoningEffortByModel: Object.fromEntries(
            Object.entries(partial.reasoningEffortByModel).map(([modelId, effort]) => [
              normalizeModelId(modelId),
              effort,
            ]),
          ),
        }
      : {}),
    ...(partial.telegram !== undefined
      ? {
          telegram: {
            ...current.telegram,
            ...partial.telegram,
            audioInput: {
              ...current.telegram?.audioInput,
              ...partial.telegram?.audioInput,
            },
            sessionsByUserId: {
              ...current.telegram?.sessionsByUserId,
              ...partial.telegram?.sessionsByUserId,
            },
          },
        }
      : {}),
    ...(partial.mcp !== undefined
      ? {
          mcp: {
            ...current.mcp,
            ...partial.mcp,
            servers: partial.mcp.servers ?? current.mcp?.servers ?? [],
          },
        }
      : {}),
    ...(partial.subAgents !== undefined
      ? {
          subAgents: partial.subAgents.map((agent) => ({
            ...agent,
            model: normalizeModelId(agent.model),
          })),
        }
      : {}),
    ...(partial.sandbox !== undefined
      ? { sandbox: normalizeSandboxSettings({ ...current.sandbox, ...partial.sandbox }) }
      : {}),
  };

  writeJson(USER_SETTINGS_PATH, next);
}

export function loadProjectSettings(): ProjectSettings {
  const projectPath = path.join(process.cwd(), ".grok", "settings.json");
  return readJson<ProjectSettings>(projectPath) || {};
}

export function saveProjectSettings(partial: Partial<ProjectSettings>): void {
  const projectPath = path.join(process.cwd(), ".grok", "settings.json");
  const current = loadProjectSettings();
  writeJson(projectPath, {
    ...current,
    ...partial,
    ...(partial.model !== undefined ? { model: normalizeModelId(partial.model) } : {}),
    ...(partial.sandboxMode !== undefined ? { sandboxMode: normalizeSandboxMode(partial.sandboxMode) } : {}),
    ...(partial.sandbox !== undefined
      ? { sandbox: normalizeSandboxSettings({ ...current.sandbox, ...partial.sandbox }) }
      : {}),
  });
}

export function getApiKey(): string | undefined {
  return process.env.GROK_API_KEY || loadUserSettings().apiKey;
}

export function getBaseURL(): string {
  return process.env.GROK_BASE_URL || "https://api.x.ai/v1";
}

export function getCurrentModel(): string {
  if (process.env.GROK_MODEL) return normalizeModelId(process.env.GROK_MODEL);
  const project = loadProjectSettings();
  if (project.model) return normalizeModelId(project.model);
  const user = loadUserSettings();
  return user.defaultModel ? normalizeModelId(user.defaultModel) : DEFAULT_MODEL;
}

export function normalizeSandboxMode(value: unknown): SandboxMode {
  return value === "shuru" ? "shuru" : "off";
}

function isNonNullObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeSecretConfig(raw: unknown): SandboxSecretConfig | null {
  if (!isNonNullObject(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const fromEnv = typeof raw.fromEnv === "string" ? raw.fromEnv.trim() : "";
  const hosts = Array.isArray(raw.hosts)
    ? raw.hosts.filter((h): h is string => typeof h === "string" && h.trim() !== "")
    : [];
  if (!name || !fromEnv) return null;
  return { name, fromEnv, hosts };
}

export function normalizeSandboxSettings(raw: unknown): SandboxSettings {
  if (!isNonNullObject(raw)) return {};
  const result: SandboxSettings = {};

  if (typeof raw.allowNet === "boolean") result.allowNet = raw.allowNet;
  if (Array.isArray(raw.allowedHosts)) {
    const hosts = raw.allowedHosts.filter((h): h is string => typeof h === "string" && h.trim() !== "");
    if (hosts.length > 0) result.allowedHosts = hosts;
  }
  if (Array.isArray(raw.ports)) {
    const ports = raw.ports.filter((p): p is string => typeof p === "string" && /^\d+:\d+$/.test(p.trim()));
    if (ports.length > 0) result.ports = ports;
  }
  if (typeof raw.cpus === "number" && raw.cpus > 0) result.cpus = raw.cpus;
  if (typeof raw.memory === "number" && raw.memory > 0) result.memory = raw.memory;
  if (typeof raw.diskSize === "number" && raw.diskSize > 0) result.diskSize = raw.diskSize;
  if (Array.isArray(raw.secrets)) {
    const secrets = raw.secrets.map(normalizeSecretConfig).filter((s): s is SandboxSecretConfig => s !== null);
    if (secrets.length > 0) result.secrets = secrets;
  }
  if (typeof raw.from === "string" && raw.from.trim()) result.from = raw.from.trim();
  if (typeof raw.verifyBaseFrom === "string" && raw.verifyBaseFrom.trim())
    result.verifyBaseFrom = raw.verifyBaseFrom.trim();
  if (typeof raw.allowEphemeralInstall === "boolean") result.allowEphemeralInstall = raw.allowEphemeralInstall;
  if (typeof raw.syncHostWorkspace === "boolean") result.syncHostWorkspace = raw.syncHostWorkspace;
  if (typeof raw.guestWorkdir === "string" && raw.guestWorkdir.trim()) result.guestWorkdir = raw.guestWorkdir.trim();
  if (Array.isArray(raw.shellInit)) {
    const shellInit = raw.shellInit.filter((line): line is string => typeof line === "string" && line.trim() !== "");
    if (shellInit.length > 0) result.shellInit = shellInit;
  }
  if (typeof raw.hostBrowserCommandsOnHost === "boolean")
    result.hostBrowserCommandsOnHost = raw.hostBrowserCommandsOnHost;

  return result;
}

export function mergeSandboxSettings(
  base: SandboxSettings | undefined,
  override: SandboxSettings | undefined,
): SandboxSettings {
  if (!base && !override) return {};
  if (!base) return { ...override };
  if (!override) return { ...base };
  return {
    allowNet: override.allowNet ?? base.allowNet,
    allowedHosts: override.allowedHosts ?? base.allowedHosts,
    ports: override.ports ?? base.ports,
    cpus: override.cpus ?? base.cpus,
    memory: override.memory ?? base.memory,
    diskSize: override.diskSize ?? base.diskSize,
    secrets: override.secrets ?? base.secrets,
    from: override.from ?? base.from,
    allowEphemeralInstall: override.allowEphemeralInstall ?? base.allowEphemeralInstall,
    guestWorkdir: override.guestWorkdir ?? base.guestWorkdir,
    syncHostWorkspace: override.syncHostWorkspace ?? base.syncHostWorkspace,
    verifyBaseFrom: override.verifyBaseFrom ?? base.verifyBaseFrom,
    shellInit: override.shellInit ?? base.shellInit,
    hostBrowserCommandsOnHost: override.hostBrowserCommandsOnHost ?? base.hostBrowserCommandsOnHost,
  };
}

export function getCurrentSandboxMode(): SandboxMode {
  const project = loadProjectSettings();
  if (project.sandboxMode) return normalizeSandboxMode(project.sandboxMode);
  const user = loadUserSettings();
  if (user.sandboxMode) return normalizeSandboxMode(user.sandboxMode);
  return "off";
}

export function getCurrentSandboxSettings(): SandboxSettings {
  const user = loadUserSettings();
  const project = loadProjectSettings();
  return mergeSandboxSettings(user.sandbox, project.sandbox);
}

export function getReasoningEffortForModel(modelId: string): ReasoningEffort | undefined {
  const normalizedModelId = normalizeModelId(modelId);
  const savedEfforts = loadUserSettings().reasoningEffortByModel ?? {};
  const effort =
    savedEfforts[normalizedModelId] ??
    Object.entries(savedEfforts).find(([savedModelId]) => normalizeModelId(savedModelId) === normalizedModelId)?.[1];
  return getEffectiveReasoningEffort(normalizedModelId, effort);
}

export function getTelegramBotToken(): string | undefined {
  const env = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (env) return env;
  return loadUserSettings().telegram?.botToken?.trim();
}

export function saveApprovedTelegramUserId(userId: number): void {
  const settings = loadUserSettings();
  const approvedUserIds = new Set(settings.telegram?.approvedUserIds ?? []);
  approvedUserIds.add(userId);
  saveUserSettings({
    telegram: {
      ...settings.telegram,
      approvedUserIds: [...approvedUserIds],
    },
  });
}

export function resolveTelegramStreamSettings(t: TelegramSettings | undefined): {
  streaming: TelegramStreamingMode;
  typingIndicator: boolean;
  nativeDrafts: boolean;
} {
  return {
    streaming: t?.streaming === "off" ? "off" : "partial",
    typingIndicator: t?.typingIndicator !== false,
    nativeDrafts: t?.nativeDrafts === true,
  };
}

export function resolveTelegramAudioInputSettings(t: TelegramSettings | undefined): {
  enabled: boolean;
  engine: TelegramAudioInputEngine;
  binaryPath: string;
  model: string;
  modelPath: string | undefined;
  autoDownloadModel: boolean;
  language: string;
} {
  return {
    enabled: t?.audioInput?.enabled !== false,
    engine: "whisper.cpp",
    binaryPath: t?.audioInput?.binaryPath?.trim() || DEFAULT_TELEGRAM_AUDIO_INPUT_BINARY,
    model: t?.audioInput?.model?.trim() || DEFAULT_TELEGRAM_AUDIO_INPUT_MODEL,
    modelPath: t?.audioInput?.modelPath?.trim() || undefined,
    autoDownloadModel: t?.audioInput?.autoDownloadModel !== false,
    language: t?.audioInput?.language?.trim() || "en",
  };
}

export function loadMcpServers(): McpServerConfig[] {
  return loadUserSettings().mcp?.servers ?? [];
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  saveUserSettings({ mcp: { servers } });
}
