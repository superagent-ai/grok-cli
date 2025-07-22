export interface MCPServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'sse' | 'https';
  env?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
  enabled: boolean;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
  globalSettings: {
    timeout: number;
    retryAttempts: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId?: string;
}

export interface MCPServerStatus {
  id: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastActivity?: Date;
  error?: string;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  onMessage(callback: (message: MCPMessage) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  isConnected(): boolean;
}

export interface MCPClientOptions {
  serverId: string;
  config: MCPServerConfig;
  onStatusChange?: (status: MCPServerStatus) => void;
  onToolsUpdated?: (tools: MCPTool[]) => void;
  onResourcesUpdated?: (resources: MCPResource[]) => void;
  onPromptsUpdated?: (prompts: MCPPrompt[]) => void;
}

export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public serverId?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
  serverId: string;
}

export interface MCPToolResult {
  success: boolean;
  content?: any;
  error?: string;
  isText?: boolean;
}export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  content: string | Buffer;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required: boolean;
  }>;
  serverId?: string;
}

export interface MCPPromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MCPRoot {
  uri: string;
  name?: string;
}

export interface MCPCapabilities {
  resources?: boolean;
  prompts?: boolean;
  roots?: boolean;
}

export interface MCPServer {
  name: string;
  version: string;
  capabilities: MCPCapabilities;
}

export interface MCPListResourcesRequest {
  cursor?: string;
}

export interface MCPListResourcesResponse {
  resources: MCPResource[];
  nextCursor?: string;
}

export interface MCPReadResourceRequest {
  uri: string;
}

export interface MCPReadResourceResponse {
  content: MCPResourceContent;
}

export interface MCPListPromptsRequest {
  cursor?: string;
}

export interface MCPListPromptsResponse {
  prompts: MCPPrompt[];
  nextCursor?: string;
}

export interface MCPGetPromptRequest {
  name: string;
  arguments?: Record<string, string>;
}

export interface MCPGetPromptResponse {
  description?: string;
  messages: MCPPromptMessage[];
}

export interface MCPListRootsRequest {}

export interface MCPListRootsResponse {
  roots: MCPRoot[];
}

export interface MCPRequest {
  method: string;
  params?: any;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}