import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCPServerConfig } from "./client";

const CONFIG_DIR = path.join(process.cwd(), ".grok");
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");

export interface Settings {
  model?: string;
  mcpServers?: Record<string, MCPServerConfig>;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}

function loadSettings(): Settings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }

    const settingsData = fs.readFileSync(SETTINGS_FILE, "utf8");
    return JSON.parse(settingsData);
  } catch (error) {
    console.warn("Failed to load settings:", error);
    return {};
  }
}

function saveSettings(settings: Settings): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Failed to save settings:", error);
    throw error;
  }
}

export function loadMCPConfig(): MCPConfig {
  const settings = loadSettings();
  const servers = settings.mcpServers ? Object.values(settings.mcpServers) : [];
  return { servers };
}

export function saveMCPConfig(config: MCPConfig): void {
  const settings = loadSettings();
  settings.mcpServers = {};

  // Convert servers array to object keyed by name
  for (const server of config.servers) {
    settings.mcpServers[server.name] = server;
  }

  saveSettings(settings);
}

export function addMCPServer(config: MCPServerConfig): void {
  const settings = loadSettings();
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  settings.mcpServers[config.name] = config;
  saveSettings(settings);
}

export function removeMCPServer(serverName: string): void {
  const settings = loadSettings();
  if (settings.mcpServers) {
    delete settings.mcpServers[serverName];
    saveSettings(settings);
  }
}

export function getMCPServer(serverName: string): MCPServerConfig | undefined {
  const settings = loadSettings();
  return settings.mcpServers?.[serverName];
}

// Predefined server configurations
export const PREDEFINED_SERVERS: Record<string, MCPServerConfig> = {};
