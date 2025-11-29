import fs from 'fs';
import path from 'path';
import os from 'os';
import { ChatEntry } from '../agent/grok-agent.js';

export interface ExportOptions {
  format?: 'markdown' | 'json' | 'text';
  includeToolResults?: boolean;
  includeTimestamps?: boolean;
  outputPath?: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'markdown',
  includeToolResults: true,
  includeTimestamps: true,
};

/**
 * Conversation Export Utility
 * Saves chat conversations to files in various formats
 */
export class ConversationExporter {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(os.homedir(), '.grok', 'conversations');
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a default filename based on timestamp
   */
  private generateFilename(format: string): string {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    return `conversation_${timestamp}.${format === 'json' ? 'json' : 'md'}`;
  }

  /**
   * Export conversation to markdown format
   */
  private toMarkdown(entries: ChatEntry[], options: Required<ExportOptions>): string {
    const lines: string[] = [];
    const now = new Date();

    // Header
    lines.push('# Grok CLI Conversation');
    lines.push('');
    lines.push(`**Date:** ${now.toLocaleDateString()}`);
    lines.push(`**Time:** ${now.toLocaleTimeString()}`);
    lines.push(`**Working Directory:** ${process.cwd()}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const entry of entries) {
      const timestamp = options.includeTimestamps
        ? ` *(${entry.timestamp.toLocaleTimeString()})*`
        : '';

      switch (entry.type) {
        case 'user':
          lines.push(`## 👤 User${timestamp}`);
          lines.push('');
          lines.push(entry.content);
          lines.push('');
          break;

        case 'assistant':
          lines.push(`## 🤖 Grok${timestamp}`);
          lines.push('');
          lines.push(entry.content);
          lines.push('');

          // Show tool calls if any
          if (entry.toolCalls && entry.toolCalls.length > 0) {
            lines.push('**Tools used:**');
            for (const tc of entry.toolCalls) {
              lines.push(`- \`${tc.function.name}\``);
            }
            lines.push('');
          }
          break;

        case 'tool_call':
          if (options.includeToolResults && entry.toolCall) {
            lines.push(`### 🔧 Tool: ${entry.toolCall.function.name}${timestamp}`);
            lines.push('');
            try {
              const args = JSON.parse(entry.toolCall.function.arguments);
              lines.push('**Arguments:**');
              lines.push('```json');
              lines.push(JSON.stringify(args, null, 2));
              lines.push('```');
              lines.push('');
            } catch {
              // Skip malformed args
            }
          }
          break;

        case 'tool_result':
          if (options.includeToolResults) {
            const status = entry.toolResult?.success ? '✅' : '❌';
            lines.push(`**Result:** ${status}`);
            lines.push('');
            if (entry.content) {
              // Truncate very long outputs
              const content = entry.content.length > 2000
                ? entry.content.slice(0, 2000) + '\n\n... (truncated)'
                : entry.content;

              // Detect if it's code/output
              if (content.includes('\n') || content.length > 100) {
                lines.push('```');
                lines.push(content);
                lines.push('```');
              } else {
                lines.push(`> ${content}`);
              }
              lines.push('');
            }
          }
          break;
      }
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`*Exported from Grok CLI on ${now.toLocaleString()}*`);

    return lines.join('\n');
  }

  /**
   * Export conversation to JSON format
   */
  private toJSON(entries: ChatEntry[], options: Required<ExportOptions>): string {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        workingDirectory: process.cwd(),
        entryCount: entries.length,
      },
      entries: entries.map(entry => ({
        type: entry.type,
        content: entry.content,
        timestamp: options.includeTimestamps ? entry.timestamp.toISOString() : undefined,
        toolCall: options.includeToolResults ? entry.toolCall : undefined,
        toolResult: options.includeToolResults ? entry.toolResult : undefined,
        toolCalls: options.includeToolResults ? entry.toolCalls : undefined,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export conversation to plain text format
   */
  private toText(entries: ChatEntry[], options: Required<ExportOptions>): string {
    const lines: string[] = [];
    const now = new Date();

    lines.push('GROK CLI CONVERSATION');
    lines.push('='.repeat(50));
    lines.push(`Date: ${now.toLocaleString()}`);
    lines.push(`Directory: ${process.cwd()}`);
    lines.push('='.repeat(50));
    lines.push('');

    for (const entry of entries) {
      const timestamp = options.includeTimestamps
        ? ` [${entry.timestamp.toLocaleTimeString()}]`
        : '';

      switch (entry.type) {
        case 'user':
          lines.push(`USER${timestamp}:`);
          lines.push(entry.content);
          lines.push('');
          break;

        case 'assistant':
          lines.push(`GROK${timestamp}:`);
          lines.push(entry.content);
          lines.push('');
          break;

        case 'tool_result':
          if (options.includeToolResults) {
            const status = entry.toolResult?.success ? 'SUCCESS' : 'FAILED';
            lines.push(`  [TOOL ${status}]`);
            if (entry.content) {
              const content = entry.content.length > 500
                ? entry.content.slice(0, 500) + '...'
                : entry.content;
              lines.push(`  ${content}`);
            }
            lines.push('');
          }
          break;
      }
    }

    lines.push('='.repeat(50));
    lines.push('END OF CONVERSATION');

    return lines.join('\n');
  }

  /**
   * Export conversation to file
   */
  export(entries: ChatEntry[], options: Partial<ExportOptions> = {}): {
    success: boolean;
    filePath?: string;
    error?: string;
  } {
    const opts: Required<ExportOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
    } as Required<ExportOptions>;

    try {
      // Generate content based on format
      let content: string;
      switch (opts.format) {
        case 'json':
          content = this.toJSON(entries, opts);
          break;
        case 'text':
          content = this.toText(entries, opts);
          break;
        case 'markdown':
        default:
          content = this.toMarkdown(entries, opts);
          break;
      }

      // Determine output path
      const filename = opts.outputPath || this.generateFilename(opts.format || 'markdown');
      const filePath = path.isAbsolute(filename)
        ? filename
        : path.join(this.outputDir, filename);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List saved conversations
   */
  listSavedConversations(): Array<{
    filename: string;
    path: string;
    size: string;
    date: Date;
  }> {
    try {
      const files = fs.readdirSync(this.outputDir);
      return files
        .filter(f => f.endsWith('.md') || f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(this.outputDir, f);
          const stats = fs.statSync(filePath);
          return {
            filename: f,
            path: filePath,
            size: this.formatBytes(stats.size),
            date: stats.mtime,
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch {
      return [];
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Singleton instance
let conversationExporterInstance: ConversationExporter | null = null;

export function getConversationExporter(): ConversationExporter {
  if (!conversationExporterInstance) {
    conversationExporterInstance = new ConversationExporter();
  }
  return conversationExporterInstance;
}

export function resetConversationExporter(): void {
  conversationExporterInstance = null;
}
