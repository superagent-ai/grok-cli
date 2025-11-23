import http from 'http';
import fs from 'fs';
import path from 'path';
import { GrokAgent, ChatEntry } from '../../agent/grok-agent.js';

/**
 * Browser UI Server
 *
 * A simple HTTP server that provides a web interface for Grok CLI.
 * Uses Server-Sent Events (SSE) for real-time streaming.
 */

export interface BrowserServerOptions {
  port?: number;
  host?: string;
  agent: GrokAgent;
}

export class BrowserServer {
  private server: http.Server | null = null;
  private agent: GrokAgent;
  private port: number;
  private host: string;
  private chatHistory: ChatEntry[] = [];

  constructor(options: BrowserServerOptions) {
    this.agent = options.agent;
    this.port = options.port || 3000;
    this.host = options.host || 'localhost';
  }

  /**
   * Start the browser server
   */
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          // Try next port
          this.port++;
          this.server?.close();
          this.start().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        resolve(url);
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    switch (url.pathname) {
      case '/':
        this.serveHTML(res);
        break;
      case '/api/chat':
        if (req.method === 'POST') {
          this.handleChat(req, res);
        } else {
          res.writeHead(405);
          res.end('Method not allowed');
        }
        break;
      case '/api/stream':
        if (req.method === 'POST') {
          this.handleStreamChat(req, res);
        } else {
          res.writeHead(405);
          res.end('Method not allowed');
        }
        break;
      case '/api/history':
        this.handleHistory(res);
        break;
      case '/api/model':
        this.handleModel(req, res);
        break;
      default:
        res.writeHead(404);
        res.end('Not found');
    }
  }

  /**
   * Serve the main HTML page
   */
  private serveHTML(res: http.ServerResponse): void {
    const html = this.generateHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Handle chat message (non-streaming)
   */
  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { message } = JSON.parse(body);

      const entries = await this.agent.processUserMessage(message);
      this.chatHistory.push(...entries);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries }));
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Handle streaming chat message
   */
  private async handleStreamChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { message } = JSON.parse(body);

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Add user entry to history
      const userEntry: ChatEntry = {
        type: 'user',
        content: message,
        timestamp: new Date()
      };
      this.chatHistory.push(userEntry);
      res.write(`data: ${JSON.stringify({ type: 'user', entry: userEntry })}\n\n`);

      // Stream the response
      for await (const chunk of this.agent.processUserMessageStream(message)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        if (chunk.type === 'content' && chunk.content) {
          // Track content for history
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle history request
   */
  private handleHistory(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history: this.chatHistory }));
  }

  /**
   * Handle model info/change
   */
  private async handleModel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: this.agent.getCurrentModel() }));
    } else if (req.method === 'POST') {
      try {
        const body = await this.readBody(req);
        const { model } = JSON.parse(body);
        this.agent.setModel(model);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, model }));
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    }
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Generate the HTML page
   */
  private generateHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grok CLI - Browser Interface</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    header h1 { font-size: 1.5rem; }
    header select {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 0.5rem;
      border-radius: 4px;
      margin-left: auto;
    }
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 2rem;
    }
    .message {
      margin-bottom: 1rem;
      padding: 1rem;
      border-radius: 8px;
      max-width: 80%;
    }
    .message.user {
      background: #667eea;
      margin-left: auto;
    }
    .message.assistant {
      background: #2d2d44;
    }
    .message.tool {
      background: #1e3a5f;
      font-family: monospace;
      font-size: 0.9rem;
    }
    .message pre {
      background: rgba(0,0,0,0.3);
      padding: 0.5rem;
      border-radius: 4px;
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .message code {
      font-family: 'Fira Code', monospace;
    }
    #input-container {
      padding: 1rem 2rem;
      background: #16213e;
      display: flex;
      gap: 0.5rem;
    }
    #message-input {
      flex: 1;
      background: #1a1a2e;
      border: 1px solid #333;
      color: white;
      padding: 1rem;
      border-radius: 8px;
      font-size: 1rem;
      resize: none;
    }
    #message-input:focus { outline: none; border-color: #667eea; }
    #send-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
    }
    #send-btn:hover { opacity: 0.9; }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 1rem;
    }
    .typing-indicator span {
      width: 8px;
      height: 8px;
      background: #667eea;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <header>
    <h1>🤖 Grok CLI</h1>
    <select id="model-select">
      <option value="grok-4-latest">Grok 4 (Latest)</option>
      <option value="grok-3-latest">Grok 3 (Latest)</option>
      <option value="grok-3-fast">Grok 3 (Fast)</option>
      <option value="grok-3-mini-fast">Grok 3 Mini (Fast)</option>
    </select>
  </header>

  <div id="chat-container"></div>

  <div id="input-container">
    <textarea id="message-input" rows="2" placeholder="Type your message..."></textarea>
    <button id="send-btn">Send</button>
  </div>

  <script>
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const modelSelect = document.getElementById('model-select');

    // Load current model
    fetch('/api/model').then(r => r.json()).then(data => {
      modelSelect.value = data.model;
    });

    modelSelect.addEventListener('change', async () => {
      await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelSelect.value })
      });
    });

    function addMessage(content, type) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.innerHTML = formatContent(content);
      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return div;
    }

    function formatContent(content) {
      // Basic markdown-like formatting
      return content
        .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\n/g, '<br>');
    }

    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      messageInput.value = '';
      sendBtn.disabled = true;

      addMessage(message, 'user');

      // Add typing indicator
      const typingDiv = document.createElement('div');
      typingDiv.className = 'typing-indicator';
      typingDiv.innerHTML = '<span></span><span></span><span></span>';
      chatContainer.appendChild(typingDiv);

      try {
        const response = await fetch('/api/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantDiv = null;
        let content = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const chunk = JSON.parse(data);

                if (chunk.type === 'content' && chunk.content) {
                  if (!assistantDiv) {
                    typingDiv.remove();
                    assistantDiv = addMessage('', 'assistant');
                  }
                  content += chunk.content;
                  assistantDiv.innerHTML = formatContent(content);
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }

                if (chunk.type === 'tool_result') {
                  const toolContent = chunk.toolResult?.output || chunk.toolResult?.error || '';
                  addMessage('Tool: ' + (chunk.toolCall?.function?.name || 'unknown') + '\\n' + toolContent, 'tool');
                }
              } catch (e) {}
            }
          }
        }
      } catch (error) {
        typingDiv.remove();
        addMessage('Error: ' + error.message, 'assistant');
      }

      sendBtn.disabled = false;
      messageInput.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.focus();
  </script>
</body>
</html>`;
  }
}
