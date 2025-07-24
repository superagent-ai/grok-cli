import { EventEmitter } from 'events';
import { MCPConfigManager } from './config';
import { MCPClient } from './client';
import { MCPConfig, MCPServerConfig, MCPServerStatus, MCPTool, MCPResource, MCPPrompt, MCPError, MCPToolCall, MCPToolResult } from './types';

export class MCPManager extends EventEmitter {
  private configManager: MCPConfigManager;
  private clients = new Map<string, MCPClient>();
  private serverStatuses = new Map<string, MCPServerStatus>();
  private allTools: MCPTool[] = [];
  private allResources: MCPResource[] = [];
  private allPrompts: MCPPrompt[] = [];
  private initialized = false;

  constructor(configManager: MCPConfigManager) {
    super();
    this.configManager = configManager;
    this.setupConfigWatcher();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      await this.configManager.loadConfig();
      
      // Connect to enabled servers
      await this.connectToEnabledServers();
      
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new MCPError(
        `Failed to initialize MCP manager: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MANAGER_INIT_ERROR',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Disconnect all clients
    const disconnectPromises = Array.from(this.clients.values()).map(client => 
      client.disconnect().catch(error => {
        console.warn('Error disconnecting MCP client:', error);
      })
    );
    
    await Promise.all(disconnectPromises);
    
    this.clients.clear();
    this.serverStatuses.clear();
    this.allTools = [];
    this.allResources = [];
    this.initialized = false;
    
    this.emit('shutdown');
  }

  async connectServer(serverId: string): Promise<void> {
    const config = this.configManager.getServerConfig(serverId);
    if (!config) {
      throw new MCPError(`Server ${serverId} not found in configuration`, 'SERVER_NOT_FOUND');
    }

    if (this.clients.has(serverId)) {
      throw new MCPError(`Server ${serverId} is already connected`, 'SERVER_ALREADY_CONNECTED');
    }

    try {
      const client = this.createClient(serverId, config);
      this.clients.set(serverId, client);
      
      await client.connect();
      
      // Enable the server in config if it was disabled
      if (!config.enabled) {
        await this.configManager.enableServer(serverId);
      }
    } catch (error) {
      this.clients.delete(serverId);
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new MCPError(`Server ${serverId} is not connected`, 'SERVER_NOT_CONNECTED');
    }

    try {
      await client.disconnect();
    } finally {
      this.clients.delete(serverId);
      this.serverStatuses.delete(serverId);
      this.updateAggregatedData();
    }
  }

  async enableServer(serverId: string): Promise<void> {
    await this.configManager.enableServer(serverId);
    
    // Connect if not already connected
    if (!this.clients.has(serverId)) {
      await this.connectServer(serverId);
    }
  }

  async disableServer(serverId: string): Promise<void> {
    await this.configManager.disableServer(serverId);
    
    // Disconnect if connected
    if (this.clients.has(serverId)) {
      await this.disconnectServer(serverId);
    }
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    const client = this.clients.get(toolCall.serverId);
    if (!client) {
      return {
        success: false,
        error: `Server ${toolCall.serverId} is not connected`
      };
    }

    if (!client.isConnected()) {
      return {
        success: false,
        error: `Server ${toolCall.serverId} is not ready`
      };
    }

    try {
      return await client.callTool(toolCall.name, toolCall.arguments);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async readResource(uri: string, serverId?: string): Promise<any> {
    // If serverId is provided, use that specific server
    if (serverId) {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new MCPError(`Server ${serverId} is not connected`, 'SERVER_NOT_CONNECTED');
      }
      return await client.readResource(uri);
    }

    // Otherwise, find the server that has this resource
    const resource = this.allResources.find(r => r.uri === uri);
    if (!resource) {
      throw new MCPError(`Resource ${uri} not found`, 'RESOURCE_NOT_FOUND');
    }

    const client = this.clients.get(resource.serverId);
    if (!client) {
      throw new MCPError(`Server ${resource.serverId} is not connected`, 'SERVER_NOT_CONNECTED');
    }

    return await client.readResource(uri);
  }

  getServerStatuses(): Record<string, MCPServerStatus> {
    const result: Record<string, MCPServerStatus> = {};
    for (const [serverId, status] of this.serverStatuses.entries()) {
      result[serverId] = status;
    }
    return result;
  }

  getServerStatus(serverId: string): MCPServerStatus | null {
    return this.serverStatuses.get(serverId) || null;
  }

  getAllTools(): MCPTool[] {
    return [...this.allTools];
  }

  getAllResources(): MCPResource[] {
    return [...this.allResources];
  }

  getAllPrompts(): MCPPrompt[] {
    return [...this.allPrompts];
  }

  getToolsByServer(serverId: string): MCPTool[] {
    return this.allTools.filter(tool => tool.serverId === serverId);
  }

  getResourcesByServer(serverId: string): MCPResource[] {
    return this.allResources.filter(resource => resource.serverId === serverId);
  }

  getPromptsByServer(serverId: string): MCPPrompt[] {
    return this.allPrompts.filter(prompt => prompt.serverId === serverId);
  }

  findTool(name: string): MCPTool | null {
    return this.allTools.find(tool => tool.name === name) || null;
  }

  getConfig(): MCPConfig | null {
    return this.configManager.getConfig();
  }

  getConfigManager(): MCPConfigManager {
    return this.configManager;
  }

  getConfigPath(): string {
    return this.configManager.getConfigPath();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async testConnection(serverId: string): Promise<{ success: boolean; error?: string; tools?: MCPTool[]; resources?: MCPResource[] }> {
    try {
      const config = this.configManager.getServerConfig(serverId);
      if (!config) {
        return { success: false, error: `Server ${serverId} not found in configuration` };
      }

      // Create a temporary client for testing
      const client = this.createClient(serverId, config);
      
      try {
        await client.connect();
        const tools = client.getTools();
        const resources = client.getResources();
        await client.disconnect();
        
        return {
          success: true,
          tools,
          resources
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    return this.getAllTools();
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<{ success: boolean; output?: string; error?: string }> {
    const tool = this.findTool(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`
      };
    }

    try {
      const result = await this.callTool({
        serverId: tool.serverId,
        name: toolName,
        arguments: args
      });
      
      // Convert content to string if it's an object
      let output: string | undefined;
      if (result.content !== undefined) {
        if (typeof result.content === 'string') {
          output = result.content;
        } else if (typeof result.content === 'object' && result.content !== null) {
          // Handle objects with type and text properties (common MCP pattern)
          if (result.content.type === 'text' && result.content.text) {
            output = result.content.text;
          } else {
            // Fallback to JSON stringification for other objects
            output = JSON.stringify(result.content, null, 2);
          }
        } else {
          // Convert other types to string
          output = String(result.content);
        }
      }
      
      return {
        success: result.success,
        output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private setupConfigWatcher(): void {
    this.configManager.onConfigChange(async (config) => {
      if (!this.initialized) {
        return;
      }

      try {
        await this.handleConfigChange(config);
      } catch (error) {
        this.emit('error', new MCPError(
          `Failed to handle config change: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CONFIG_CHANGE_ERROR',
          undefined,
          error instanceof Error ? error : undefined
        ));
      }
    });
  }

  private async handleConfigChange(config: MCPConfig): Promise<void> {
    const enabledServers = this.configManager.getEnabledServers();
    const currentServers = new Set(this.clients.keys());
    const targetServers = new Set(Object.keys(enabledServers));

    // Disconnect servers that are no longer enabled
    for (const serverId of currentServers) {
      if (!targetServers.has(serverId)) {
        await this.disconnectServer(serverId);
      }
    }

    // Connect new enabled servers
    for (const serverId of targetServers) {
      if (!currentServers.has(serverId)) {
        try {
          await this.connectServer(serverId);
        } catch (error) {
          console.warn(`Failed to connect to server ${serverId}:`, error);
        }
      }
    }
  }

  private async connectToEnabledServers(): Promise<void> {
    const enabledServers = this.configManager.getEnabledServers();
    
    const connectionPromises = Object.entries(enabledServers).map(async ([serverId, config]) => {
      try {
        // Validate command exists for stdio transport
        if (config.transport === 'stdio' && config.command) {
          const { execSync } = require('child_process');
          try {
            execSync(`which "${config.command}"`, { stdio: 'ignore' });
          } catch (error) {
            console.warn(`MCP server ${serverId}: command not found: ${config.command}`);
            this.clients.delete(serverId);
            return;
          }
        }

        const client = this.createClient(serverId, config);
        this.clients.set(serverId, client);
        await client.connect();
        // Server connected successfully (removed success log)
      } catch (error) {
        // Failed to connect (removed error log - UI will show status)
        this.clients.delete(serverId);
      }
    });

    await Promise.allSettled(connectionPromises);
  }

  private createClient(serverId: string, config: MCPServerConfig): MCPClient {
    const client = new MCPClient({
      serverId,
      config,
      onStatusChange: (status) => {
        this.serverStatuses.set(serverId, status);
        this.emit('serverStatusChanged', status);
      },
      onToolsUpdated: (tools) => {
        this.updateAggregatedData();
        this.emit('toolsUpdated', serverId, tools);
      },
      onResourcesUpdated: (resources) => {
        this.updateAggregatedData();
        this.emit('resourcesUpdated', serverId, resources);
      },
      onPromptsUpdated: (prompts) => {
        this.updateAggregatedData();
        this.emit('promptsUpdated', serverId, prompts);
      }
    });

    client.on('connected', () => {
      this.emit('serverConnected', serverId);
    });

    client.on('disconnected', () => {
      this.emit('serverDisconnected', serverId);
    });

    client.on('error', (error) => {
      this.emit('serverError', serverId, error);
    });

    return client;
  }

  private updateAggregatedData(): void {
    // Aggregate all tools from all connected clients
    this.allTools = [];
    this.allResources = [];
    this.allPrompts = [];
    
    for (const client of this.clients.values()) {
      this.allTools.push(...client.getTools());
      this.allResources.push(...client.getResources());
      this.allPrompts.push(...client.getPrompts());
    }

    this.emit('dataUpdated', {
      tools: this.allTools,
      resources: this.allResources,
      prompts: this.allPrompts
    });
  }
}