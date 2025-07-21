import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { MCPConfig, MCPServerConfig, MCPError } from './types';

export class MCPConfigManager {
  private config: MCPConfig | null = null;
  private configPath: string;
  private watchers: Array<(config: MCPConfig) => void> = [];
  private serverScopes: Map<string, 'project' | 'user' | 'local' | 'fallback'> = new Map();

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  private getDefaultConfigPath(): string {
    // Configuration loading hierarchy:
    // 1. .grok/mcpConfig.json in current workspace
    // 2. ~/.grok/mcpConfig.json (global user config)
    // 3. mcpConfig.json in current directory (legacy)
    // 4. ~/.config/grok-cli/mcpConfig.json (fallback)
    
    const workspaceGrokPath = path.join(process.cwd(), '.grok', 'mcpConfig.json');
    if (fs.existsSync(workspaceGrokPath)) {
      return workspaceGrokPath;
    }
    
    const globalGrokPath = path.join(os.homedir(), '.grok', 'mcpConfig.json');
    if (fs.existsSync(globalGrokPath)) {
      return globalGrokPath;
    }
    
    const currentDirPath = path.join(process.cwd(), 'mcpConfig.json');
    if (fs.existsSync(currentDirPath)) {
      return currentDirPath;
    }
    
    const homeDirPath = path.join(os.homedir(), '.config', 'grok-cli', 'mcpConfig.json');
    return homeDirPath;
  }

  async loadConfig(): Promise<MCPConfig> {
    try {
      // Load configurations from all scopes and merge them
      const mergedConfig = await this.loadMergedConfig();
      
      // Validate merged config
      this.validateConfig(mergedConfig);
      
      this.config = mergedConfig;
      return mergedConfig;
    } catch (error) {
      throw new MCPError(
        `Failed to load MCP configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONFIG_LOAD_ERROR',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async loadMergedConfig(): Promise<MCPConfig> {
    const configPaths = this.getAllConfigPaths();
    let mergedConfig: MCPConfig = this.createDefaultConfig();
    this.serverScopes.clear();

    // Load and merge configs in reverse priority order (lowest to highest)
    for (const { path: configPath, scope } of configPaths.reverse()) {
      if (fs.existsSync(configPath)) {
        try {
          const configContent = await fs.readFile(configPath, 'utf-8');
          const rawConfig = JSON.parse(configContent);
          const processedConfig = this.substituteEnvVars(rawConfig);
          
          if (processedConfig.mcpServers) {
            // Track server scopes and merge servers
            for (const [serverId, serverConfig] of Object.entries(processedConfig.mcpServers)) {
              this.serverScopes.set(serverId, scope);
              mergedConfig.mcpServers[serverId] = serverConfig as MCPServerConfig;
            }
          }
          
          // Merge global settings (higher priority configs override)
          if (processedConfig.globalSettings) {
            mergedConfig.globalSettings = { ...mergedConfig.globalSettings, ...processedConfig.globalSettings };
          }
        } catch (error) {
          console.warn(`Warning: Failed to load config from ${configPath}: ${error}`);
        }
      }
    }

    return mergedConfig;
  }

  private getAllConfigPaths(): Array<{ path: string; scope: 'project' | 'user' | 'local' | 'fallback' }> {
    return [
      { path: path.join(os.homedir(), '.config', 'grok-cli', 'mcpConfig.json'), scope: 'fallback' },
      { path: path.join(process.cwd(), 'mcpConfig.json'), scope: 'local' },
      { path: path.join(os.homedir(), '.grok', 'mcpConfig.json'), scope: 'user' },
      { path: path.join(process.cwd(), '.grok', 'mcpConfig.json'), scope: 'project' }
    ];
  }

  getServerScope(serverId: string): 'project' | 'user' | 'local' | 'fallback' | undefined {
    return this.serverScopes.get(serverId);
  }

  getServersByScope(): Record<'project' | 'user' | 'local' | 'fallback', string[]> {
    const result = { project: [], user: [], local: [], fallback: [] } as Record<'project' | 'user' | 'local' | 'fallback', string[]>;
    
    for (const [serverId, scope] of this.serverScopes.entries()) {
      result[scope].push(serverId);
    }
    
    return result;
  }

  async saveConfig(config: MCPConfig): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.configPath));
      
      // Write config with pretty formatting
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      
      this.config = config;
      this.notifyWatchers(config);
    } catch (error) {
      throw new MCPError(
        `Failed to save MCP configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONFIG_SAVE_ERROR',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  private createDefaultConfig(): MCPConfig {
    return {
      mcpServers: {
        // Example configurations for each transport type
        'example-stdio': {
          command: 'echo',
          args: ['MCP server not configured'],
          transport: 'stdio',
          enabled: false
        },
        'example-sse': {
          url: 'https://example.com/mcp',
          transport: 'sse',
          headers: {
            'Authorization': 'Bearer ${MCP_API_KEY}'
          },
          enabled: false
        },
        'example-https': {
          url: 'https://api.example.com/mcp',
          transport: 'https',
          timeout: 30000,
          enabled: false
        }
      },
      globalSettings: {
        timeout: 10000,
        retryAttempts: 3,
        logLevel: 'info'
      }
    };
  }

  private substituteEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || match;
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteEnvVars(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvVars(value);
      }
      return result;
    }
    
    return obj;
  }

  private validateConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Configuration must have mcpServers object');
    }

    if (!config.globalSettings || typeof config.globalSettings !== 'object') {
      throw new Error('Configuration must have globalSettings object');
    }

    // Validate each server configuration
    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      this.validateServerConfig(serverId, serverConfig as MCPServerConfig);
    }

    // Validate global settings
    const { timeout, retryAttempts, logLevel } = config.globalSettings;
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new Error('globalSettings.timeout must be a positive number');
    }
    if (typeof retryAttempts !== 'number' || retryAttempts < 0) {
      throw new Error('globalSettings.retryAttempts must be a non-negative number');
    }
    if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
      throw new Error('globalSettings.logLevel must be one of: debug, info, warn, error');
    }
  }

  private validateServerConfig(serverId: string, config: MCPServerConfig): void {
    if (!['stdio', 'sse', 'https'].includes(config.transport)) {
      throw new Error(`Server ${serverId}: transport must be one of: stdio, sse, https`);
    }

    if (typeof config.enabled !== 'boolean') {
      throw new Error(`Server ${serverId}: enabled must be a boolean`);
    }

    switch (config.transport) {
      case 'stdio':
        if (!config.command || typeof config.command !== 'string') {
          throw new Error(`Server ${serverId}: command is required for stdio transport`);
        }
        break;
      
      case 'sse':
      case 'https':
        if (!config.url || typeof config.url !== 'string') {
          throw new Error(`Server ${serverId}: url is required for ${config.transport} transport`);
        }
        try {
          new URL(config.url);
        } catch {
          throw new Error(`Server ${serverId}: url must be a valid URL`);
        }
        break;
    }

    if (config.timeout !== undefined && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
      throw new Error(`Server ${serverId}: timeout must be a positive number`);
    }
  }

  getConfig(): MCPConfig | null {
    return this.config;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getServerConfig(serverId: string): MCPServerConfig | null {
    return this.config?.mcpServers[serverId] || null;
  }

  getEnabledServers(): Record<string, MCPServerConfig> {
    if (!this.config) return {};
    
    const enabled: Record<string, MCPServerConfig> = {};
    for (const [serverId, config] of Object.entries(this.config.mcpServers)) {
      if (config.enabled) {
        enabled[serverId] = config;
      }
    }
    return enabled;
  }

  async updateServerConfig(serverId: string, updates: Partial<MCPServerConfig>): Promise<void> {
    if (!this.config) {
      throw new MCPError('No configuration loaded', 'CONFIG_NOT_LOADED');
    }

    const currentConfig = this.config.mcpServers[serverId];
    if (!currentConfig) {
      throw new MCPError(`Server ${serverId} not found in configuration`, 'SERVER_NOT_FOUND');
    }

    const updatedConfig = { ...currentConfig, ...updates };
    this.validateServerConfig(serverId, updatedConfig);

    this.config.mcpServers[serverId] = updatedConfig;
    await this.saveConfig(this.config);
  }

  async enableServer(serverId: string): Promise<void> {
    await this.updateServerConfig(serverId, { enabled: true });
  }

  async disableServer(serverId: string): Promise<void> {
    await this.updateServerConfig(serverId, { enabled: false });
  }

  async addServer(serverId: string, serverConfig: MCPServerConfig): Promise<void> {
    if (!this.config) {
      // Load or create default config if none exists
      await this.loadConfig();
    }

    if (this.config!.mcpServers[serverId]) {
      throw new MCPError(`Server ${serverId} already exists`, 'SERVER_ALREADY_EXISTS');
    }

    this.validateServerConfig(serverId, serverConfig);
    this.config!.mcpServers[serverId] = serverConfig;
    await this.saveConfig(this.config!);
  }

  async removeServer(serverId: string): Promise<void> {
    if (!this.config) {
      throw new MCPError('No configuration loaded', 'CONFIG_NOT_LOADED');
    }

    if (!this.config.mcpServers[serverId]) {
      throw new MCPError(`Server ${serverId} not found`, 'SERVER_NOT_FOUND');
    }

    delete this.config.mcpServers[serverId];
    await this.saveConfig(this.config);
  }

  onConfigChange(callback: (config: MCPConfig) => void): void {
    this.watchers.push(callback);
  }

  private notifyWatchers(config: MCPConfig): void {
    this.watchers.forEach(callback => {
      try {
        callback(config);
      } catch (error) {
        console.error('Error in config change callback:', error);
      }
    });
  }

}