import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * MCP (Model Context Protocol) Client
 *
 * Implements a client for the Model Context Protocol specification.
 * Supports stdio transport for local MCP servers.
 */

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: object;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPClient extends EventEmitter {
  private servers: Map<string, MCPServerConnection> = new Map();
  private configPath: string;

  constructor() {
    super();
    this.configPath = path.join(process.cwd(), '.grok', 'mcp-servers.json');
  }

  /**
   * Load MCP server configurations from file
   */
  loadConfig(): MCPServerConfig[] {
    // Check project-level config first
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(content);
        return config.servers || [];
      } catch (error) {
        console.error('Failed to load MCP config:', error);
      }
    }

    // Check user-level config
    const userConfigPath = path.join(os.homedir(), '.grok', 'mcp-servers.json');
    if (fs.existsSync(userConfigPath)) {
      try {
        const content = fs.readFileSync(userConfigPath, 'utf-8');
        const config = JSON.parse(content);
        return config.servers || [];
      } catch (error) {
        console.error('Failed to load user MCP config:', error);
      }
    }

    return [];
  }

  /**
   * Save MCP server configuration
   */
  saveConfig(servers: MCPServerConfig[]): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify({ servers }, null, 2));
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<void> {
    const configs = this.loadConfig();

    for (const config of configs) {
      if (config.enabled !== false) {
        try {
          await this.connect(config);
        } catch (error: any) {
          console.error(`Failed to connect to MCP server ${config.name}:`, error.message);
        }
      }
    }
  }

  /**
   * Connect to a specific MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      throw new Error(`Server ${config.name} is already connected`);
    }

    const connection = new MCPServerConnection(config);
    await connection.start();

    this.servers.set(config.name, connection);
    this.emit('server-connected', config.name);
  }

  /**
   * Disconnect from a server
   */
  async disconnect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (server) {
      await server.stop();
      this.servers.delete(serverName);
      this.emit('server-disconnected', serverName);
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    for (const [name] of this.servers) {
      await this.disconnect(name);
    }
  }

  /**
   * Get all available tools from connected servers
   */
  async getAllTools(): Promise<Map<string, MCPTool[]>> {
    const allTools = new Map<string, MCPTool[]>();

    for (const [name, server] of this.servers) {
      try {
        const tools = await server.listTools();
        allTools.set(name, tools);
      } catch (error) {
        console.error(`Failed to get tools from ${name}:`, error);
      }
    }

    return allTools;
  }

  /**
   * Get all available resources from connected servers
   */
  async getAllResources(): Promise<Map<string, MCPResource[]>> {
    const allResources = new Map<string, MCPResource[]>();

    for (const [name, server] of this.servers) {
      try {
        const resources = await server.listResources();
        allResources.set(name, resources);
      } catch (error) {
        console.error(`Failed to get resources from ${name}:`, error);
      }
    }

    return allResources;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverName: string, toolName: string, args: object): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    return server.callTool(toolName, args);
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverName: string, uri: string): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    return server.readResource(uri);
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  /**
   * Format status for display
   */
  formatStatus(): string {
    const servers = this.getConnectedServers();
    if (servers.length === 0) {
      return 'No MCP servers connected.\nConfigure servers in .grok/mcp-servers.json';
    }

    return `Connected MCP Servers:\n${servers.map(s => `  • ${s}`).join('\n')}`;
  }
}

/**
 * Connection to a single MCP server
 */
class MCPServerConnection extends EventEmitter {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();
  private buffer = '';

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env };

      this.process = spawn(this.config.command, this.config.args || [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout?.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[${this.config.name}] stderr:`, data.toString());
      });

      this.process.on('error', (error) => {
        reject(error);
      });

      this.process.on('close', (code) => {
        this.emit('close', code);
      });

      // Initialize the connection
      this.initialize()
        .then(() => resolve())
        .catch(reject);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      clientInfo: {
        name: 'grok-cli',
        version: '1.0.0'
      }
    });

    await this.sendNotification('notifications/initialized', {});
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Try to parse complete JSON-RPC messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as JSONRPCResponse;
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse MCP message:', error);
        }
      }
    }
  }

  private handleMessage(message: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private async sendRequest(method: string, params?: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } else {
        reject(new Error('Process not started'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params?: object): void {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify(notification) + '\n');
    }
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return result.tools || [];
  }

  async listResources(): Promise<MCPResource[]> {
    const result = await this.sendRequest('resources/list', {});
    return result.resources || [];
  }

  async callTool(name: string, args: object): Promise<any> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
    return result;
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.sendRequest('resources/read', { uri });
    return result;
  }
}

// Singleton instance
let mcpClientInstance: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient();
  }
  return mcpClientInstance;
}

export function resetMCPClient(): void {
  if (mcpClientInstance) {
    mcpClientInstance.disconnectAll();
  }
  mcpClientInstance = null;
}
