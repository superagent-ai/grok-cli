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