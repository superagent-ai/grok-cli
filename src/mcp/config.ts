import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSettingsManager } from "../utils/settings-manager.js";
import { MCPServerConfig } from "./client.js";

export interface MCPConfig {
  servers: MCPServerConfig[];
}

/**
 * Load MCP configuration from multiple sources (inspired by Claude Code)
 * Priority: Project .grok/mcp.json > .grok/settings.json > ~/.grok/mcp.json
 */
export function loadMCPConfig(): MCPConfig {
  const servers: MCPServerConfig[] = [];
  const seenServers = new Set<string>();

  // 1. First, try project-level .grok/mcp.json (highest priority, committable)
  const projectMCPPath = path.join(process.cwd(), '.grok', 'mcp.json');
  if (fs.existsSync(projectMCPPath)) {
    try {
      const projectMCP = JSON.parse(fs.readFileSync(projectMCPPath, 'utf-8'));
      const mcpServers = projectMCP.mcpServers || projectMCP.servers || {};

      for (const [name, config] of Object.entries(mcpServers)) {
        if (!seenServers.has(name)) {
          servers.push({ name, ...(config as any) });
          seenServers.add(name);
        }
      }
    } catch (error) {
      console.warn('Failed to load project MCP config:', error);
    }
  }

  // 2. Then, try project settings (.grok/settings.json)
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  if (projectSettings.mcpServers) {
    for (const [name, config] of Object.entries(projectSettings.mcpServers)) {
      if (!seenServers.has(name)) {
        servers.push(config as MCPServerConfig);
        seenServers.add(name);
      }
    }
  }

  // 3. Finally, try user-level ~/.grok/mcp.json (lowest priority)
  const userMCPPath = path.join(os.homedir(), '.grok', 'mcp.json');
  if (fs.existsSync(userMCPPath)) {
    try {
      const userMCP = JSON.parse(fs.readFileSync(userMCPPath, 'utf-8'));
      const mcpServers = userMCP.mcpServers || userMCP.servers || {};

      for (const [name, config] of Object.entries(mcpServers)) {
        if (!seenServers.has(name)) {
          servers.push({ name, ...(config as any) });
          seenServers.add(name);
        }
      }
    } catch (error) {
      // Silently ignore user config errors
    }
  }

  return { servers };
}

export function saveMCPConfig(config: MCPConfig): void {
  const manager = getSettingsManager();
  const mcpServers: Record<string, MCPServerConfig> = {};

  // Convert servers array to object keyed by name
  for (const server of config.servers) {
    mcpServers[server.name] = server;
  }

  manager.updateProjectSetting('mcpServers', mcpServers);
}

export function addMCPServer(config: MCPServerConfig): void {
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  const mcpServers = projectSettings.mcpServers || {};

  mcpServers[config.name] = config;
  manager.updateProjectSetting('mcpServers', mcpServers);
}

export function removeMCPServer(serverName: string): void {
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  const mcpServers = projectSettings.mcpServers;

  if (mcpServers) {
    delete mcpServers[serverName];
    manager.updateProjectSetting('mcpServers', mcpServers);
  }
}

export function getMCPServer(serverName: string): MCPServerConfig | undefined {
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  return projectSettings.mcpServers?.[serverName];
}

// Predefined server configurations
export const PREDEFINED_SERVERS: Record<string, MCPServerConfig> = {};

/**
 * Save MCP configuration to project-level .grok/mcp.json (committable)
 */
export function saveProjectMCPConfig(servers: Record<string, MCPServerConfig>): string {
  const projectMCPPath = path.join(process.cwd(), '.grok', 'mcp.json');
  const projectDir = path.dirname(projectMCPPath);

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const config = {
    mcpServers: servers
  };

  fs.writeFileSync(projectMCPPath, JSON.stringify(config, null, 2));
  return projectMCPPath;
}

/**
 * Create default MCP configuration template
 */
export function createMCPConfigTemplate(): string {
  const projectMCPPath = path.join(process.cwd(), '.grok', 'mcp.json');
  const projectDir = path.dirname(projectMCPPath);

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const template = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "description": "MCP server configuration for this project. This file can be committed to share MCP servers with your team.",
    "mcpServers": {
      "example-stdio": {
        "name": "example-stdio",
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@example/mcp-server"],
        "env": {},
        "enabled": false
      },
      "example-http": {
        "name": "example-http",
        "type": "http",
        "url": "http://localhost:3000/mcp",
        "enabled": false
      }
    }
  };

  fs.writeFileSync(projectMCPPath, JSON.stringify(template, null, 2));
  return projectMCPPath;
}

/**
 * Check if project has MCP configuration
 */
export function hasProjectMCPConfig(): boolean {
  const projectMCPPath = path.join(process.cwd(), '.grok', 'mcp.json');
  return fs.existsSync(projectMCPPath);
}

/**
 * Get MCP configuration file paths
 */
export function getMCPConfigPaths(): { project: string; user: string } {
  return {
    project: path.join(process.cwd(), '.grok', 'mcp.json'),
    user: path.join(os.homedir(), '.grok', 'mcp.json')
  };
}
