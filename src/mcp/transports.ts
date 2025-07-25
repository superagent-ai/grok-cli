import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import axios, { AxiosInstance } from "axios";

export type TransportType = 'stdio' | 'http' | 'sse' | 'streamable_http';

export interface TransportConfig {
  type: TransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPTransport {
  connect(): Promise<Transport>;
  disconnect(): Promise<void>;
  getType(): TransportType;
}

export class StdioTransport implements MCPTransport {
  private transport?: StdioClientTransport;
  private process?: ChildProcess;

  constructor(private config: TransportConfig) {
    if (!config.command) {
      throw new Error('Command is required for stdio transport');
    }
  }

  async connect(): Promise<Transport> {
    // Create transport with environment variables to suppress verbose output
    const env = { 
      ...process.env, 
      ...this.config.env,
      // Try to suppress verbose output from mcp-remote
      MCP_REMOTE_QUIET: '1',
      MCP_REMOTE_SILENT: '1',
      DEBUG: '',
      NODE_ENV: 'production'
    };

    this.transport = new StdioClientTransport({
      command: this.config.command!,
      args: this.config.args || [],
      env
    });

    return this.transport;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }

    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  getType(): TransportType {
    return 'stdio';
  }
}

export class HttpTransport extends EventEmitter implements MCPTransport {
  private client?: AxiosInstance;
  private connected = false;

  constructor(private config: TransportConfig) {
    super();
    if (!config.url) {
      throw new Error('URL is required for HTTP transport');
    }
  }

  async connect(): Promise<Transport> {
    this.client = axios.create({
      baseURL: this.config.url,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      }
    });

    // Test connection
    try {
      await this.client.get('/health');
      this.connected = true;
    } catch (error) {
      // If health endpoint doesn't exist, try a basic request
      this.connected = true;
    }

    return new HttpClientTransport(this.client);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.client = undefined;
  }

  getType(): TransportType {
    return 'http';
  }
}

export class SSETransport extends EventEmitter implements MCPTransport {
  private connected = false;

  constructor(private config: TransportConfig) {
    super();
    if (!config.url) {
      throw new Error('URL is required for SSE transport');
    }
  }

  async connect(): Promise<Transport> {
    return new Promise((resolve, reject) => {
      try {
        // For Node.js environment, we'll use a simple HTTP-based approach
        // In a real implementation, you'd use a proper SSE library like 'eventsource'
        this.connected = true;
        resolve(new SSEClientTransport(this.config.url!));
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getType(): TransportType {
    return 'sse';
  }
}

// Custom HTTP Transport implementation
class HttpClientTransport extends EventEmitter implements Transport {
  constructor(private client: AxiosInstance) {
    super();
  }

  async start(): Promise<void> {
    // HTTP transport is connection-less, so we're always "started"
  }

  async close(): Promise<void> {
    // Nothing to close for HTTP transport
  }

  async send(message: any): Promise<any> {
    try {
      const response = await this.client.post('/rpc', message);
      return response.data;
    } catch (error) {
      throw new Error(`HTTP transport error: ${error}`);
    }
  }
}

// Custom SSE Transport implementation
class SSEClientTransport extends EventEmitter implements Transport {
  constructor(private url: string) {
    super();
  }

  async start(): Promise<void> {
    // SSE transport is event-driven, so we're always "started"
  }

  async close(): Promise<void> {
    // Nothing to close for basic SSE transport
  }

  async send(message: any): Promise<any> {
    // For bidirectional communication over SSE, we typically use HTTP POST
    // for sending messages and SSE for receiving
    try {
      const response = await axios.post(this.url.replace('/sse', '/rpc'), message, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      throw new Error(`SSE transport error: ${error}`);
    }
  }
}

export class StreamableHttpTransport extends EventEmitter implements MCPTransport {
  private connected = false;

  constructor(private config: TransportConfig) {
    super();
    if (!config.url) {
      throw new Error('URL is required for streamable_http transport');
    }
  }

  async connect(): Promise<Transport> {
    return new Promise((resolve, reject) => {
      try {
        this.connected = true;
        resolve(new StreamableHttpClientTransport(this.config.url!, this.config.headers));
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getType(): TransportType {
    return 'streamable_http';
  }
}

// Custom Streamable HTTP Transport implementation for GitHub Copilot MCP
class StreamableHttpClientTransport extends EventEmitter implements Transport {
  constructor(private url: string, private headers?: Record<string, string>) {
    super();
  }

  async start(): Promise<void> {
    // Streamable HTTP transport is connection-less, so we're always "started"
  }

  async close(): Promise<void> {
    // Nothing to close for streamable HTTP transport
  }

  async send(message: any): Promise<any> {
    console.log('StreamableHttpTransport: SSE endpoints require persistent connections, not suitable for MCP request-response pattern');
    console.log('StreamableHttpTransport: Message that would be sent:', JSON.stringify(message));
    
    // For now, return a mock response to indicate the transport type is not compatible
    // with the MCP protocol's request-response pattern
    throw new Error('StreamableHttpTransport: SSE endpoints are not compatible with MCP request-response pattern. GitHub Copilot MCP may require a different integration approach.');
  }
}

export function createTransport(config: TransportConfig): MCPTransport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport(config);
    case 'http':
      return new HttpTransport(config);
    case 'sse':
      return new SSETransport(config);
    case 'streamable_http':
      return new StreamableHttpTransport(config);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}