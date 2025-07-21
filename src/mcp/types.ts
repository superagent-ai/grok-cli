export interface MCPResource {
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