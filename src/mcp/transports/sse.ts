import EventSource from 'eventsource';
import axios from 'axios';
import { MCPTransport, MCPMessage, MCPServerConfig, MCPError } from '../types';
import { EventEmitter } from 'events';

export class SSETransport extends EventEmitter implements MCPTransport {
  private eventSource: EventSource | null = null;
  private connected = false;
  private messageId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

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
      throw new MCPError('URL is required for SSE transport', 'INVALID_CONFIG', this.serverId);
    }

    try {
      // Create EventSource with headers
      const eventSourceOptions: any = {
        headers: this.config.headers || {}
      };

      this.eventSource = new EventSource(this.config.url, eventSourceOptions);

      // Handle connection events
      this.eventSource.onopen = () => {
        this.connected = true;
        this.initialize();
      };

      this.eventSource.onerror = (error) => {
        this.connected = false;
        this.emit('error', new MCPError(
          `SSE connection error: ${error}`,
          'CONNECTION_ERROR',
          this.serverId
        ));
      };

      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new MCPError(
            `Failed to parse SSE message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'PARSE_ERROR',
            this.serverId,
            error instanceof Error ? error : undefined
          ));
        }
      };

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new MCPError('SSE connection timeout', 'CONNECTION_TIMEOUT', this.serverId));
        }, this.config.timeout || 10000);

        const onOpen = () => {
          clearTimeout(timeout);
          resolve();
        };

        const onError = (error: any) => {
          clearTimeout(timeout);
          reject(new MCPError(
            `SSE connection failed: ${error}`,
            'CONNECTION_ERROR',
            this.serverId
          ));
        };

        if (this.eventSource) {
          this.eventSource.addEventListener('open', onOpen);
          this.eventSource.addEventListener('error', onError);
        }
      });
    } catch (error) {
      throw new MCPError(
        `Failed to connect to SSE server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.eventSource) {
      return;
    }

    this.connected = false;

    // Cancel all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new MCPError('Connection closed', 'CONNECTION_CLOSED', this.serverId));
    }
    this.pendingRequests.clear();

    // Close EventSource
    this.eventSource.close();
    this.eventSource = null;

    this.emit('close');
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.connected || !this.config.url) {
      throw new MCPError('Transport not connected', 'NOT_CONNECTED', this.serverId);
    }

    try {
      // For SSE, we typically send messages via HTTP POST to a separate endpoint
      const sendUrl = this.config.url.replace('/events', '/send').replace('/sse', '/send');
      
      await axios.post(sendUrl, message, {
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        timeout: this.config.timeout || 10000
      });

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
        `Failed to initialize SSE connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      ));
    }
  }
}