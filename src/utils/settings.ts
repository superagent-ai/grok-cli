import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DEFAULT_MODEL, getModelIds } from "../grok/models.js";

export interface UserSettings {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  models?: string[];
}

export interface ProjectSettings {
  model?: string;
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
  const defaults: UserSettings = {
    baseURL: "https://api.x.ai/v1",
    defaultModel: DEFAULT_MODEL,
    models: getModelIds(),
  };
  const saved = readJson<UserSettings>(USER_SETTINGS_PATH);
  return { ...defaults, ...saved };
}

export function saveUserSettings(partial: Partial<UserSettings>): void {
  const current = loadUserSettings();
  writeJson(USER_SETTINGS_PATH, { ...current, ...partial });
}

export function loadProjectSettings(): ProjectSettings {
  const projectPath = path.join(process.cwd(), ".grok", "settings.json");
  return readJson<ProjectSettings>(projectPath) || {};
}

export function saveProjectSettings(partial: Partial<ProjectSettings>): void {
  const projectPath = path.join(process.cwd(), ".grok", "settings.json");
  const current = loadProjectSettings();
  writeJson(projectPath, { ...current, ...partial });
}

export function getApiKey(): string | undefined {
  return process.env.GROK_API_KEY || loadUserSettings().apiKey;
}

export function getBaseURL(): string {
  return process.env.GROK_BASE_URL || loadUserSettings().baseURL || "https://api.x.ai/v1";
}

export function getCurrentModel(): string {
  if (process.env.GROK_MODEL) return process.env.GROK_MODEL;
  const project = loadProjectSettings();
  if (project.model) return project.model;
  const user = loadUserSettings();
  return user.defaultModel || DEFAULT_MODEL;
}
