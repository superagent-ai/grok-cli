import { spawn, ChildProcess } from 'child_process';
import { MCPTransport, MCPMessage, MCPServerConfig, MCPError } from '../types';
import { EventEmitter } from 'events';

export class StdioTransport extends EventEmitter implements MCPTransport {
  private process: ChildProcess | null = null;
  private connected = false;
  private messageBuffer = '';
  private messageId = 0;

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

    if (!this.config.command) {
      throw new MCPError('Command is required for STDIO transport', 'INVALID_CONFIG', this.serverId);
    }

    try {
      this.process = spawn(this.config.command, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
        shell: false
      });

      if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
        throw new MCPError('Failed to create process pipes', 'PROCESS_ERROR', this.serverId);
      }

      // Handle process events
      this.process.on('error', (error) => {
        this.emit('error', new MCPError(
          `Process error: ${error.message}`,
          'PROCESS_ERROR',
          this.serverId,
          error
        ));
      });

      this.process.on('exit', (code, signal) => {
        this.connected = false;
        this.emit('close');
        if (code !== 0 && code !== null) {
          this.emit('error', new MCPError(
            `Process exited with code ${code}`,
            'PROCESS_EXIT',
            this.serverId
          ));
        }
      });

      // Handle stdout messages
      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // Handle stderr silently (suppress debug messages)
      this.process.stderr.on('data', (data: Buffer) => {
        // Silently consume stderr to avoid cluttering the output
        // The data is available but not logged to console
      });

      this.connected = true;
    } catch (error) {
      throw new MCPError(
        `Failed to connect to STDIO server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_ERROR',
        this.serverId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.process) {
      return;
    }

    this.connected = false;

    // Send shutdown notification if possible
    try {
      await this.send({
        jsonrpc: '2.0',
        method: 'notifications/cancelled'
      });
    } catch {
      // Ignore errors during shutdown
    }

    // Gracefully terminate the process
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.connected || !this.process?.stdin) {
      throw new MCPError('Transport not connected', 'NOT_CONNECTED', this.serverId);
    }

    try {
      const messageStr = JSON.stringify(message) + '\n';
      this.process.stdin.write(messageStr);
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

  private handleData(data: string): void {
    this.messageBuffer += data;
    
    // Process complete messages (separated by newlines)
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line.trim());
          this.emit('message', message);
        } catch (error) {
          this.emit('error', new MCPError(
            `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'PARSE_ERROR',
            this.serverId,
            error instanceof Error ? error : undefined
          ));
        }
      }
    }
  }
}

export class MCPServerTransport extends EventEmitter {
  private connected = false;

  constructor(private service: any) {
    super();
    this.setupStdioHandlers();
  }

  private setupStdioHandlers(): void {
    // Handle incoming messages from stdin
    process.stdin.setEncoding('utf8');
    let messageBuffer = '';

    process.stdin.on('data', (data: string) => {
      messageBuffer += data;
      
      // Process complete messages (separated by newlines)
      const lines = messageBuffer.split('\n');
      messageBuffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line.trim());
            this.handleMessage(message);
          } catch (error) {
            this.sendError(-32700, 'Parse error');
          }
        }
      }
    });

    // Handle process termination
    process.on('SIGINT', () => {
      this.emit('close');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.emit('close');
      process.exit(0);
    });

    this.connected = true;
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        this.sendError(-32600, 'Invalid Request');
        return;
      }

      if (message.method) {
        await this.handleRequest(message);
      } else {
        this.sendError(-32600, 'Invalid Request');
      }
    } catch (error) {
      this.sendError(-32603, 'Internal error');
    }
  }

  private async handleRequest(request: any): Promise<void> {
    try {
      let result: any;

      switch (request.method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: this.service.getCapabilities(),
            serverInfo: {
              name: 'grok-cli',
              version: '1.0.0'
            }
          };
          break;

        case 'tools/list':
          result = { tools: [] }; // TODO: Implement tools listing
          break;

        case 'resources/list':
          const resourcesResponse = await this.service.listResources();
          result = { resources: resourcesResponse.resources };
          break;

        case 'resources/read':
          if (!request.params?.uri) {
            this.sendError(-32602, 'Invalid params: URI parameter is required');
            return;
          }
          const resourceResponse = await this.service.readResource(request.params.uri);
          result = { contents: [resourceResponse.content] };
          break;

        case 'prompts/list':
          const promptsResponse = await this.service.listPrompts();
          result = { prompts: promptsResponse.prompts };
          break;

        case 'prompts/get':
          if (!request.params?.name) {
            this.sendError(-32602, 'Invalid params: Name parameter is required');
            return;
          }
          const promptResponse = await this.service.getPrompt(
            request.params.name,
            request.params.arguments || {}
          );
          result = {
            description: promptResponse.description,
            messages: promptResponse.messages
          };
          break;

        case 'roots/list':
          const rootsResponse = await this.service.listRoots();
          result = { roots: rootsResponse.roots };
          break;

        default:
          this.sendError(-32601, `Method not found: ${request.method}`);
          return;
      }

      this.sendResponse(request.id, result);
    } catch (error) {
      this.sendError(-32603, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private sendResponse(id: any, result: any): void {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    this.sendMessage(response);
  }

  private sendError(code: number, message: string, data?: any): void {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code,
        message,
        ...(data && { data })
      }
    };
    this.sendMessage(errorResponse);
  }

  private sendMessage(message: any): void {
    const messageStr = JSON.stringify(message) + '\n';
    process.stdout.write(messageStr);
  }

  async start(): Promise<void> {
    // Start the server
    console.error = () => {}; // Suppress console.error
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}