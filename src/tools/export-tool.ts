import fs from 'fs';
import path from 'path';
import { ToolResult } from '../types';

export type ExportFormat = 'json' | 'markdown' | 'html' | 'txt' | 'pdf';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  toolCalls?: any[];
}

export interface ConversationExport {
  title?: string;
  timestamp: string;
  messages: Message[];
  metadata?: {
    model?: string;
    totalTokens?: number;
    cost?: number;
    duration?: string;
  };
}

export interface ExportOptions {
  format: ExportFormat;
  outputPath?: string;
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
  includeToolCalls?: boolean;
  theme?: 'light' | 'dark';
  title?: string;
}

/**
 * Export Tool for saving conversations and data in various formats
 * Supports JSON, Markdown, HTML, plain text, and PDF exports
 */
export class ExportTool {
  private readonly outputDir = path.join(process.cwd(), '.grok', 'exports');

  /**
   * Export conversation to specified format
   */
  async exportConversation(
    messages: Message[],
    options: ExportOptions
  ): Promise<ToolResult> {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const title = options.title || `conversation_${timestamp}`;
      const ext = options.format === 'markdown' ? 'md' : options.format;
      const filename = `${title}.${ext}`;
      const outputPath = options.outputPath || path.join(this.outputDir, filename);

      const conversation: ConversationExport = {
        title: options.title,
        timestamp: new Date().toISOString(),
        messages
      };

      let content: string;

      switch (options.format) {
        case 'json':
          content = this.toJSON(conversation, options);
          break;
        case 'markdown':
          content = this.toMarkdown(conversation, options);
          break;
        case 'html':
          content = this.toHTML(conversation, options);
          break;
        case 'txt':
          content = this.toPlainText(conversation, options);
          break;
        case 'pdf':
          return await this.toPDF(conversation, outputPath, options);
        default:
          return {
            success: false,
            error: `Unsupported format: ${options.format}`
          };
      }

      fs.writeFileSync(outputPath, content, 'utf8');

      return {
        success: true,
        output: `📤 Exported conversation to ${outputPath}`,
        data: { path: outputPath, format: options.format, size: content.length }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Export failed: ${error.message}`
      };
    }
  }

  /**
   * Convert to JSON
   */
  private toJSON(conversation: ConversationExport, options: ExportOptions): string {
    const data: any = {
      title: conversation.title,
      exported_at: conversation.timestamp,
      messages: conversation.messages.map(m => {
        const msg: any = {
          role: m.role,
          content: m.content
        };
        if (options.includeTimestamps && m.timestamp) {
          msg.timestamp = m.timestamp;
        }
        if (options.includeToolCalls && m.toolCalls) {
          msg.tool_calls = m.toolCalls;
        }
        return msg;
      })
    };

    if (options.includeMetadata && conversation.metadata) {
      data.metadata = conversation.metadata;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert to Markdown
   */
  private toMarkdown(conversation: ConversationExport, options: ExportOptions): string {
    const lines: string[] = [];

    if (conversation.title) {
      lines.push(`# ${conversation.title}`);
      lines.push('');
    }

    lines.push(`*Exported: ${new Date(conversation.timestamp).toLocaleString()}*`);
    lines.push('');

    if (options.includeMetadata && conversation.metadata) {
      lines.push('## Metadata');
      lines.push('');
      if (conversation.metadata.model) {
        lines.push(`- **Model:** ${conversation.metadata.model}`);
      }
      if (conversation.metadata.totalTokens) {
        lines.push(`- **Tokens:** ${conversation.metadata.totalTokens}`);
      }
      if (conversation.metadata.cost) {
        lines.push(`- **Cost:** $${conversation.metadata.cost.toFixed(4)}`);
      }
      if (conversation.metadata.duration) {
        lines.push(`- **Duration:** ${conversation.metadata.duration}`);
      }
      lines.push('');
    }

    lines.push('## Conversation');
    lines.push('');

    for (const msg of conversation.messages) {
      const roleEmoji = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
      const roleName = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      lines.push(`### ${roleEmoji} ${roleName}`);

      if (options.includeTimestamps && msg.timestamp) {
        lines.push(`*${new Date(msg.timestamp).toLocaleString()}*`);
      }

      lines.push('');
      lines.push(msg.content);
      lines.push('');

      if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push('<details>');
        lines.push('<summary>Tool Calls</summary>');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(msg.toolCalls, null, 2));
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Convert to HTML
   */
  private toHTML(conversation: ConversationExport, options: ExportOptions): string {
    const isDark = options.theme === 'dark';

    const styles = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background: ${isDark ? '#1a1a2e' : '#f5f5f5'};
          color: ${isDark ? '#eee' : '#333'};
        }
        h1 { margin-bottom: 10px; color: ${isDark ? '#fff' : '#222'}; }
        .meta { color: ${isDark ? '#888' : '#666'}; font-size: 0.9em; margin-bottom: 20px; }
        .message {
          margin: 15px 0;
          padding: 15px;
          border-radius: 10px;
          position: relative;
        }
        .user {
          background: ${isDark ? '#16213e' : '#e3f2fd'};
          margin-left: 20px;
        }
        .assistant {
          background: ${isDark ? '#0f3460' : '#fff'};
          border: 1px solid ${isDark ? '#1a1a2e' : '#ddd'};
          margin-right: 20px;
        }
        .system {
          background: ${isDark ? '#2d132c' : '#fff3e0'};
          font-size: 0.9em;
          font-style: italic;
        }
        .role {
          font-weight: bold;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .timestamp {
          font-size: 0.8em;
          color: ${isDark ? '#666' : '#999'};
          margin-left: auto;
        }
        .content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        pre {
          background: ${isDark ? '#0a0a0a' : '#f4f4f4'};
          padding: 10px;
          border-radius: 5px;
          overflow-x: auto;
          margin: 10px 0;
        }
        code {
          font-family: 'Fira Code', 'Consolas', monospace;
          font-size: 0.9em;
        }
        .tool-calls {
          margin-top: 10px;
          padding: 10px;
          background: ${isDark ? '#0a0a0a' : '#f9f9f9'};
          border-radius: 5px;
          font-size: 0.85em;
        }
        details summary {
          cursor: pointer;
          color: ${isDark ? '#4fc3f7' : '#1976d2'};
        }
      </style>
    `;

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${conversation.title || 'Conversation Export'}</title>
  ${styles}
</head>
<body>
  <h1>${conversation.title || 'Conversation'}</h1>
  <p class="meta">Exported: ${new Date(conversation.timestamp).toLocaleString()}</p>
`;

    if (options.includeMetadata && conversation.metadata) {
      html += `
  <div class="metadata">
    ${conversation.metadata.model ? `<p><strong>Model:</strong> ${conversation.metadata.model}</p>` : ''}
    ${conversation.metadata.totalTokens ? `<p><strong>Tokens:</strong> ${conversation.metadata.totalTokens}</p>` : ''}
    ${conversation.metadata.cost ? `<p><strong>Cost:</strong> $${conversation.metadata.cost.toFixed(4)}</p>` : ''}
  </div>
`;
    }

    for (const msg of conversation.messages) {
      const roleEmoji = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
      const roleName = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      html += `
  <div class="message ${msg.role}">
    <div class="role">
      <span>${roleEmoji} ${roleName}</span>
      ${options.includeTimestamps && msg.timestamp ? `<span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span>` : ''}
    </div>
    <div class="content">${this.escapeHTML(msg.content)}</div>
`;

      if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
        html += `
    <div class="tool-calls">
      <details>
        <summary>Tool Calls (${msg.toolCalls.length})</summary>
        <pre><code>${this.escapeHTML(JSON.stringify(msg.toolCalls, null, 2))}</code></pre>
      </details>
    </div>
`;
      }

      html += `  </div>\n`;
    }

    html += `</body>\n</html>`;

    return html;
  }

  /**
   * Convert to plain text
   */
  private toPlainText(conversation: ConversationExport, options: ExportOptions): string {
    const lines: string[] = [];
    const separator = '='.repeat(60);

    if (conversation.title) {
      lines.push(conversation.title);
      lines.push(separator);
    }

    lines.push(`Exported: ${new Date(conversation.timestamp).toLocaleString()}`);
    lines.push('');

    if (options.includeMetadata && conversation.metadata) {
      lines.push('METADATA');
      lines.push('-'.repeat(40));
      if (conversation.metadata.model) lines.push(`Model: ${conversation.metadata.model}`);
      if (conversation.metadata.totalTokens) lines.push(`Tokens: ${conversation.metadata.totalTokens}`);
      if (conversation.metadata.cost) lines.push(`Cost: $${conversation.metadata.cost.toFixed(4)}`);
      lines.push('');
    }

    lines.push('CONVERSATION');
    lines.push(separator);
    lines.push('');

    for (const msg of conversation.messages) {
      const roleName = msg.role.toUpperCase();

      lines.push(`[${roleName}]`);

      if (options.includeTimestamps && msg.timestamp) {
        lines.push(`Time: ${new Date(msg.timestamp).toLocaleString()}`);
      }

      lines.push('');
      lines.push(msg.content);
      lines.push('');
      lines.push('-'.repeat(40));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Convert to PDF (requires external tool)
   */
  private async toPDF(
    conversation: ConversationExport,
    outputPath: string,
    options: ExportOptions
  ): Promise<ToolResult> {
    // First generate HTML
    const htmlContent = this.toHTML(conversation, options);
    const htmlPath = outputPath.replace('.pdf', '.html');

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // Try to use wkhtmltopdf or puppeteer
    try {
      const { execSync } = await import('child_process');

      // Try wkhtmltopdf first
      try {
        execSync(`wkhtmltopdf "${htmlPath}" "${outputPath}"`, { stdio: 'ignore' });
        fs.unlinkSync(htmlPath);

        return {
          success: true,
          output: `📤 Exported conversation to PDF: ${outputPath}`,
          data: { path: outputPath, format: 'pdf' }
        };
      } catch {
        // wkhtmltopdf not available
      }

      // Fallback: keep HTML and inform user
      return {
        success: true,
        output: `📤 HTML export created: ${htmlPath}\nNote: Install wkhtmltopdf for PDF export: sudo apt install wkhtmltopdf`,
        data: { path: htmlPath, format: 'html' }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `PDF export failed: ${error.message}`
      };
    }
  }

  /**
   * Export data to CSV
   */
  async exportToCSV(
    data: Array<Record<string, any>>,
    outputPath?: string
  ): Promise<ToolResult> {
    try {
      if (data.length === 0) {
        return {
          success: false,
          error: 'No data to export'
        };
      }

      fs.mkdirSync(this.outputDir, { recursive: true });

      const timestamp = Date.now();
      const filePath = outputPath || path.join(this.outputDir, `export_${timestamp}.csv`);

      const headers = Object.keys(data[0]);
      const lines = [headers.join(',')];

      for (const row of data) {
        const values = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        lines.push(values.join(','));
      }

      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

      return {
        success: true,
        output: `📤 Exported ${data.length} rows to CSV: ${filePath}`,
        data: { path: filePath, rows: data.length }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `CSV export failed: ${error.message}`
      };
    }
  }

  /**
   * Export code snippets from conversation
   */
  async exportCodeSnippets(
    messages: Message[],
    options: { language?: string; outputDir?: string } = {}
  ): Promise<ToolResult> {
    try {
      const snippetDir = options.outputDir || path.join(this.outputDir, 'snippets');
      fs.mkdirSync(snippetDir, { recursive: true });

      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      const snippets: Array<{ language: string; code: string; file: string }> = [];

      let snippetCount = 0;

      for (const msg of messages) {
        let match;
        while ((match = codeBlockRegex.exec(msg.content)) !== null) {
          const language = match[1] || 'txt';
          const code = match[2].trim();

          if (options.language && language !== options.language) continue;

          snippetCount++;
          const ext = this.getExtension(language);
          const filename = `snippet_${snippetCount}.${ext}`;
          const filePath = path.join(snippetDir, filename);

          fs.writeFileSync(filePath, code, 'utf8');
          snippets.push({ language, code, file: filePath });
        }
      }

      if (snippets.length === 0) {
        return {
          success: true,
          output: 'No code snippets found in conversation'
        };
      }

      const summary = snippets.map(s => `  - ${path.basename(s.file)} (${s.language})`).join('\n');

      return {
        success: true,
        output: `📤 Exported ${snippets.length} code snippets:\n${summary}`,
        data: { snippets, directory: snippetDir }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Code export failed: ${error.message}`
      };
    }
  }

  /**
   * List exported files
   */
  listExports(): ToolResult {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return {
          success: true,
          output: 'No exports found'
        };
      }

      const files = this.getAllFiles(this.outputDir);

      if (files.length === 0) {
        return {
          success: true,
          output: 'No exports found'
        };
      }

      const list = files.map(f => {
        const stats = fs.statSync(f);
        const relPath = path.relative(this.outputDir, f);
        return `  📄 ${relPath} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Exports in ${this.outputDir}:\n${list}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list exports: ${error.message}`
      };
    }
  }

  /**
   * Get all files recursively
   */
  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Get file extension for language
   */
  private getExtension(language: string): string {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      ruby: 'rb',
      java: 'java',
      csharp: 'cs',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rust: 'rs',
      php: 'php',
      swift: 'swift',
      kotlin: 'kt',
      scala: 'scala',
      html: 'html',
      css: 'css',
      sql: 'sql',
      bash: 'sh',
      shell: 'sh',
      json: 'json',
      yaml: 'yaml',
      xml: 'xml',
      markdown: 'md'
    };

    return extensions[language.toLowerCase()] || language || 'txt';
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
