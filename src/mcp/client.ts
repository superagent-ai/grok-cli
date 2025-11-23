import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { createTransport, MCPTransport, TransportType, TransportConfig } from "./transports.js";

export interface MCPServerConfig {
  name: string;
  transport: TransportConfig;
  // Legacy support for stdio-only configs
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

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

  async addServer(config: MCPServerConfig): Promise<void> {
    try {
      // Handle legacy stdio-only configuration
      let transportConfig = config.transport;
      if (!transportConfig && config.command) {
        transportConfig = {
          type: 'stdio',
          command: config.command,
          args: config.args,
          env: config.env
        };
      }

      if (!transportConfig) {
        throw new Error('Transport configuration is required');
      }

      // Create transport
      const transport = createTransport(transportConfig);
      this.transports.set(config.name, transport);

      // Create client
      const client = new Client(
        {
          name: "grok-cli",
          version: "1.0.0"
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

    return await client.callTool({
      name: originalToolName,
      arguments: arguments_
    });
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