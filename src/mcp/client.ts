import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { createTransport, MCPTransport, TransportType } from "./transports.js";
import { MCP_CONFIG, ERROR_MESSAGES } from "../constants.js";
import { MCPServerConfigSchema } from "../schemas/settings-schemas.js";
import type { MCPServerConfig, MCPTransportConfig } from "../schemas/settings-schemas.js";

// Re-export types for external use
export type { MCPServerConfig, MCPTransportConfig };

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export class MCPManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, MCPTransport> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private pendingConnections: Map<string, Promise<void>> = new Map();

  async addServer(config: MCPServerConfig): Promise<void> {
    // Check if already connecting to prevent race condition
    const pending = this.pendingConnections.get(config.name);
    if (pending) {
      return pending;
    }

    // Create a promise for this connection attempt
    const connectionPromise = this._addServerInternal(config);
    this.pendingConnections.set(config.name, connectionPromise);

    try {
      await connectionPromise;
    } finally {
      this.pendingConnections.delete(config.name);
    }
  }

  private async _addServerInternal(config: MCPServerConfig): Promise<void> {
    try {
      // Validate config with Zod
      const validationResult = MCPServerConfigSchema.safeParse(config);
      if (!validationResult.success) {
        throw new Error(`Invalid MCP server config: ${validationResult.error.message}`);
      }

      const validatedConfig = validationResult.data;

      // Handle legacy stdio-only configuration
      let transportConfig = validatedConfig.transport;
      if (!transportConfig && validatedConfig.command) {
        transportConfig = {
          type: 'stdio' as const,
          command: validatedConfig.command,
          args: validatedConfig.args,
          env: validatedConfig.env
        };
      }

      if (!transportConfig) {
        throw new Error(ERROR_MESSAGES.TRANSPORT_CONFIG_REQUIRED);
      }

      // Create transport
      const transport = createTransport(transportConfig);
      this.transports.set(validatedConfig.name, transport);

      // Create client
      const client = new Client(
        {
          name: MCP_CONFIG.CLIENT_NAME,
          version: MCP_CONFIG.CLIENT_VERSION
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      this.clients.set(config.name, client);

      // Connect
      const sdkTransport = await transport.connect();
      await client.connect(sdkTransport);

      // List available tools
      const toolsResult = await client.listTools();

      // Register tools
      for (const tool of toolsResult.tools) {
        const mcpTool: MCPTool = {
          name: `mcp__${config.name}__${tool.name}`,
          description: tool.description || `Tool from ${config.name} server`,
          inputSchema: tool.inputSchema,
          serverName: config.name
        };
        this.tools.set(mcpTool.name, mcpTool);
      }

      this.emit('serverAdded', config.name, toolsResult.tools.length);
    } catch (error) {
      // Clean up on error
      this.clients.delete(config.name);
      const transport = this.transports.get(config.name);
      if (transport) {
        await transport.disconnect().catch(() => {/* ignore cleanup errors */});
        this.transports.delete(config.name);
      }
      this.emit('serverError', config.name, error);
      throw error;
    }
  }

  async removeServer(serverName: string): Promise<void> {
    // Remove tools
    for (const [toolName, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        this.tools.delete(toolName);
      }
    }

    // Disconnect client
    const client = this.clients.get(serverName);
    if (client) {
      await client.close();
      this.clients.delete(serverName);
    }

    // Close transport
    const transport = this.transports.get(serverName);
    if (transport) {
      await transport.disconnect();
      this.transports.delete(serverName);
    }

    this.emit('serverRemoved', serverName);
  }

  async callTool(toolName: string, arguments_: any): Promise<CallToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const client = this.clients.get(tool.serverName);
    if (!client) {
      throw new Error(`Server ${tool.serverName} not connected`);
    }

    // Extract the original tool name (remove mcp__servername__ prefix)
    const originalToolName = toolName.replace(`mcp__${tool.serverName}__`, '');

    const result = await client.callTool({
      name: originalToolName,
      arguments: arguments_
    });

    return result as CallToolResult;
  }

  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getServers(): string[] {
    return Array.from(this.clients.keys());
  }

  async shutdown(): Promise<void> {
    const serverNames = Array.from(this.clients.keys());
    await Promise.all(serverNames.map(name => this.removeServer(name)));
  }

  getTransportType(serverName: string): TransportType | undefined {
    const transport = this.transports.get(serverName);
    return transport?.getType();
  }

  async ensureServersInitialized(): Promise<void> {
    if (this.clients.size > 0) {
      return; // Already initialized
    }

    const { loadMCPConfig } = await import('../mcp/config');
    const config = loadMCPConfig();
    
    // Initialize servers in parallel to avoid blocking
    const initPromises = config.servers.map(async (serverConfig) => {
      try {
        await this.addServer(serverConfig);
      } catch (error) {
        console.warn(`Failed to initialize MCP server ${serverConfig.name}:`, error);
      }
    });
    
    await Promise.all(initPromises);
  }
}