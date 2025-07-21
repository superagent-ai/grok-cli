import WebSocket from 'ws';
import { MCPTransport, MCPMessage, MCPServerConfig, MCPError } from '../types';
import { EventEmitter } from 'events';

export class HTTPSTransport extends EventEmitter implements MCPTransport {
  private ws: WebSocket | null = null;
  private connected = false;
  private messageId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;

  constructor(
    private serverId: string,
    private config: MCPServerConfig
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (!this.config.url) {
      throw new MCPError('URL is required for HTTPS transport', 'INVALID_CONFIG', this.serverId);
    }

    try {
      // Convert HTTP(S) URL to WebSocket URL
      const wsUrl = this.config.url.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
      
      // Create WebSocket connection
      const wsOptions: any = {
        headers: this.config.headers || {},
        handshakeTimeout: this.config.timeout || 10000
      };

      this.ws = new WebSocket(wsUrl, wsOptions);

      // Set up event handlers
      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.initialize();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new MCPError(
            `Failed to parse WebSocket message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'PARSE_ERROR',
            this.serverId,
            error instanceof Error ? error : undefined
          ));
        }
      });

      this.ws.on('error', (error) => {
        this.connected = false;
        this.emit('error', new MCPError(
          `WebSocket error: ${error.message}`,
          'CONNECTION_ERROR',
          this.serverId,
          error
        ));
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this.emit('close');
        
        // Attempt reconnection if not manually closed
        if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      });

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new MCPError('WebSocket connection timeout', 'CONNECTION_TIMEOUT', this.serverId));
        }, this.config.timeout || 10000);

        const onOpen = () => {
          clearTimeout(timeout);
          resolve();
        };

        const onError = (error: Error) => {
          clearTimeout(timeout);
          reject(new MCPError(
            `WebSocket connection failed: ${error.message}`,
            'CONNECTION_ERROR',
            this.serverId,
            error
          ));
        };

        if (this.ws) {
          this.ws.once('open', onOpen);
          this.ws.once('error', onError);
        }
      });
    } catch (error) {
      throw new MCPError(
        `Failed to connect to HTTPS server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    this.connected = false;
    this.maxReconnectAttempts = 0; // Prevent reconnection

    // Cancel all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new MCPError('Connection closed', 'CONNECTION_CLOSED', this.serverId));
    }
    this.pendingRequests.clear();

    // Send close notification if possible
    try {
      await this.send({
        jsonrpc: '2.0',
        method: 'notifications/cancelled'
      });
    } catch {
      // Ignore errors during shutdown
    }

    // Close WebSocket
    this.ws.close(1000, 'Client disconnect');
    this.ws = null;
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new MCPError('Transport not connected', 'NOT_CONNECTED', this.serverId);
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);

      // If this is a request (has id), set up response handling
      if (message.id !== undefined) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingRequests.delete(message.id!);
            reject(new MCPError('Request timeout', 'REQUEST_TIMEOUT', this.serverId));
          }, this.config.timeout || 10000);

          this.pendingRequests.set(message.id!, {
            resolve,
            reject,
            timeout
          });
        });
      }
    } catch (error) {
      throw new MCPError(
        `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SEND_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  onMessage(callback: (message: MCPMessage) => void): void {
    this.on('message', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }

  onClose(callback: () => void): void {
    this.on('close', callback);
  }

  isConnected(): boolean {
    return this.connected;
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
          this.serverId
        ));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    // Emit message for notifications and other messages
    this.emit('message', message);
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.emit('error', new MCPError(
            'Max reconnection attempts reached',
            'RECONNECT_FAILED',
            this.serverId
          ));
        }
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private async initialize(): Promise<void> {
    const initMessage: MCPMessage = {
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'grok-cli',
          version: '0.0.2'
        }
      }
    };

    try {
      await this.send(initMessage);
    } catch (error) {
      this.emit('error', new MCPError(
        `Failed to initialize HTTPS connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      ));
    }
  }
}