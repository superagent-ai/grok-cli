import { EventEmitter } from 'events';
import { MCPTransport, MCPMessage, MCPServerConfig, MCPClientOptions, MCPServerStatus, MCPTool, MCPResource, MCPError, MCPToolCall, MCPToolResult } from './types';
import { createTransport } from './transports';

export class MCPClient extends EventEmitter {
  private transport: MCPTransport;
  private status: MCPServerStatus;
  private messageId = 0;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private initialized = false;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(private options: MCPClientOptions) {
    super();
    
    this.transport = createTransport(options.serverId, options.config);
    this.status = {
      id: options.serverId,
      status: 'disconnected',
      tools: [],
      resources: []
    };

    this.setupTransportHandlers();
  }

  private setupTransportHandlers(): void {
    this.transport.onMessage((message) => {
      this.handleMessage(message);
    });

    this.transport.onError((error) => {
      this.updateStatus('error', error.message);
      this.emit('error', error);
    });

    this.transport.onClose(() => {
      this.updateStatus('disconnected');
      this.initialized = false;
      this.emit('disconnected');
    });
  }

  async connect(): Promise<void> {
    try {
      this.updateStatus('connecting');
      await this.transport.connect();
      
      // Send initialize request and wait for completion
      await this.initialize();
      
      // Discover tools and resources
      await this.discoverCapabilities();
      
      this.updateStatus('connected');
      this.emit('connected');
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
    } catch (error) {
      // Ignore errors during disconnect
    }
    
    this.updateStatus('disconnected');
    this.initialized = false;
    
    // Cancel all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new MCPError('Client disconnected', 'CLIENT_DISCONNECTED', this.options.serverId));
    }
    this.pendingRequests.clear();
  }

  async callTool(name: string, arguments_: Record<string, any>): Promise<MCPToolResult> {
    if (!this.isConnected()) {
      throw new MCPError('Client not connected', 'NOT_CONNECTED', this.options.serverId);
    }

    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      throw new MCPError(`Tool '${name}' not found`, 'TOOL_NOT_FOUND', this.options.serverId);
    }

    try {
      const response = await this.sendRequest('tools/call', {
        name,
        arguments: arguments_
      });

      return {
        success: true,
        content: response.content,
        isText: response.isText
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async listResources(): Promise<MCPResource[]> {
    if (!this.isConnected()) {
      throw new MCPError('Client not connected', 'NOT_CONNECTED', this.options.serverId);
    }

    try {
      const response = await this.sendRequest('resources/list');
      return response.resources || [];
    } catch (error) {
      throw new MCPError(
        `Failed to list resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RESOURCE_LIST_ERROR',
        this.options.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isConnected()) {
      throw new MCPError('Client not connected', 'NOT_CONNECTED', this.options.serverId);
    }

    try {
      const response = await this.sendRequest('resources/read', { uri });
      return response.contents;
    } catch (error) {
      throw new MCPError(
        `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RESOURCE_READ_ERROR',
        this.options.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  getStatus(): MCPServerStatus {
    return { ...this.status };
  }

  getTools(): MCPTool[] {
    return [...this.tools];
  }

  getResources(): MCPResource[] {
    return [...this.resources];
  }

  isConnected(): boolean {
    return this.transport.isConnected() && this.initialized;
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPError('Request timeout', 'REQUEST_TIMEOUT', this.options.serverId));
      }, (this.options.config.timeout || 10) * 1000);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout
      });

      this.transport.send(message).catch(reject);
    });
  }

  private async sendNotification(method: string, params?: any): Promise<void> {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    await this.transport.send(message);
  }

  private handleMessage(message: MCPMessage): void {
    // Handle responses to pending requests
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      clearTimeout(request.timeout);

      if (message.error) {
        request.reject(new MCPError(
          message.error.message,
          'SERVER_ERROR',
          this.options.serverId
        ));
      } else {
          // Special handling for initialize response
          if (!this.initialized && message.result && message.result.capabilities) {
            this.handleInitializeResponse(message.result).then(() => {
              request.resolve(message.result);
            }).catch(error => {
              console.error('Failed to complete initialization:', error);
              request.reject(error);
            });
          } else {
            request.resolve(message.result);
          }
        }
      return;
    }

    // Handle notifications and other messages
    if (message.method) {
      this.handleNotification(message);
    }
  }

  private handleNotification(message: MCPMessage): void {
    switch (message.method) {
      case 'notifications/initialized':
        this.initialized = true;
        break;
      
      case 'notifications/tools/list_changed':
        this.discoverTools();
        break;
      
      case 'notifications/resources/list_changed':
        this.discoverResources();
        break;
      
      default:
        // Emit unknown notifications for custom handling
        this.emit('notification', message);
        break;
    }
  }

  private async handleInitializeResponse(response: any): Promise<void> {
    // Send initialized notification to complete the handshake
    await this.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'grok-cli',
          version: '0.0.2'
        }
      });

      // The handleInitializeResponse will be called automatically
      // when the response is received, which sets this.initialized = true
    } catch (error) {
      throw new MCPError(
        `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR',
        this.options.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async waitForInitialization(): Promise<void> {
    if (this.initialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new MCPError('Initialization timeout', 'INIT_TIMEOUT', this.options.serverId));
      }, (this.options.config.timeout || 10) * 1000);

      const checkInitialized = () => {
        if (this.initialized) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkInitialized, 100);
        }
      };

      checkInitialized();
    });
  }

  private async discoverCapabilities(): Promise<void> {
    await Promise.all([
      this.discoverTools(),
      this.discoverResources()
    ]);
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await this.sendRequest('tools/list');
      this.tools = (response.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverId: this.options.serverId
      }));
      
      this.status.tools = this.tools;
      this.options.onToolsUpdated?.(this.tools);
    } catch (error) {
      console.warn(`Failed to discover tools for ${this.options.serverId}:`, error);
    }
  }

  private async discoverResources(): Promise<void> {
    try {
      const response = await this.sendRequest('resources/list');
      this.resources = (response.resources || []).map((resource: any) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId: this.options.serverId
      }));
      
      this.status.resources = this.resources;
      this.options.onResourcesUpdated?.(this.resources);
    } catch (error) {
      // Silently handle "Method not found" errors as resources/list is optional
      if (error instanceof MCPError && error.message.includes('Method not found')) {
        this.resources = [];
        this.status.resources = this.resources;
        this.options.onResourcesUpdated?.(this.resources);
      } else {
        console.warn(`Failed to discover resources for ${this.options.serverId}:`, error);
      }
    }
  }

  private updateStatus(status: MCPServerStatus['status'], error?: string): void {
    this.status = {
      ...this.status,
      status,
      lastActivity: new Date(),
      error
    };
    
    this.options.onStatusChange?.(this.status);
  }
}