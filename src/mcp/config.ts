import { getSettingsManager } from "../utils/settings-manager.js";
import { MCPServerConfig } from "./client.js";
import { MCPServerConfigSchema } from "../schemas/settings-schemas.js";
import { ErrorCategory, createErrorMessage } from "../utils/error-handler.js";

export interface MCPConfig {
  servers: MCPServerConfig[];
}

/**
 * Load MCP configuration from project settings with validation
 */
export function loadMCPConfig(): MCPConfig {
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  const rawServers = projectSettings.mcpServers
    ? Object.values(projectSettings.mcpServers)
    : [];

  // Validate each server config
  const validatedServers: MCPServerConfig[] = [];
  for (const server of rawServers) {
    const result = MCPServerConfigSchema.safeParse(server);
    if (result.success && result.data) {
      validatedServers.push(result.data as MCPServerConfig);
    } else {
      console.warn(
        createErrorMessage(
          ErrorCategory.VALIDATION,
          `MCP server config validation for "${(server as any)?.name || 'unknown'}"`,
          result.error || 'Invalid configuration'
        )
      );
    }
  }

  return { servers: validatedServers };
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
  // Validate server config before adding
  const validationResult = MCPServerConfigSchema.safeParse(config);
  if (!validationResult.success) {
    throw new Error(
      createErrorMessage(
        ErrorCategory.VALIDATION,
        `Adding MCP server "${config.name}"`,
        validationResult.error || 'Invalid server configuration'
      )
    );
  }

  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  const mcpServers = projectSettings.mcpServers || {};

  mcpServers[config.name] = validationResult.data!;
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
