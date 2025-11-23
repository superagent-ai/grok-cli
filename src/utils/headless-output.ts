/**
 * Enhanced Headless Output - Inspired by Claude Code
 * Supports multiple output formats for CI/CD and automation
 */

export type OutputFormat = 'json' | 'stream-json' | 'text' | 'markdown';

export interface HeadlessResult {
  success: boolean;
  exitCode: number;
  messages: HeadlessMessage[];
  summary: ResultSummary;
  metadata: ResultMetadata;
}

export interface HeadlessMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  };
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
}

export interface ResultSummary {
  totalMessages: number;
  toolCalls: number;
  successfulTools: number;
  failedTools: number;
  filesModified: string[];
  filesCreated: string[];
  commandsExecuted: string[];
  errors: string[];
}

export interface ResultMetadata {
  model: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  tokensUsed?: number;
  workingDirectory: string;
}

/**
 * Format result as JSON
 */
export function formatAsJson(result: HeadlessResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format result as streaming JSON (NDJSON - one JSON object per line)
 */
export function formatAsStreamJson(messages: HeadlessMessage[]): string[] {
  return messages.map(msg => JSON.stringify(msg));
}

/**
 * Format result as plain text
 */
export function formatAsText(result: HeadlessResult): string {
  let output = '';

  for (const msg of result.messages) {
    switch (msg.role) {
      case 'user':
        output += `> ${msg.content}\n\n`;
        break;
      case 'assistant':
        output += `${msg.content}\n\n`;
        break;
      case 'tool':
        if (msg.toolCall) {
          output += `[Tool: ${msg.toolCall.name}]\n`;
        }
        if (msg.toolResult) {
          if (msg.toolResult.success) {
            output += `${msg.toolResult.output || 'Success'}\n\n`;
          } else {
            output += `Error: ${msg.toolResult.error}\n\n`;
          }
        }
        break;
    }
  }

  // Add summary
  output += '\n---\n';
  output += `Success: ${result.success}\n`;
  output += `Tool calls: ${result.summary.toolCalls}\n`;

  if (result.summary.filesModified.length > 0) {
    output += `Files modified: ${result.summary.filesModified.join(', ')}\n`;
  }
  if (result.summary.filesCreated.length > 0) {
    output += `Files created: ${result.summary.filesCreated.join(', ')}\n`;
  }
  if (result.summary.errors.length > 0) {
    output += `Errors: ${result.summary.errors.join(', ')}\n`;
  }

  output += `Duration: ${result.metadata.durationMs}ms\n`;

  return output;
}

/**
 * Format result as Markdown
 */
export function formatAsMarkdown(result: HeadlessResult): string {
  let output = '# Grok CLI Result\n\n';

  output += '## Conversation\n\n';

  for (const msg of result.messages) {
    switch (msg.role) {
      case 'user':
        output += `### User\n\n${msg.content}\n\n`;
        break;
      case 'assistant':
        output += `### Assistant\n\n${msg.content}\n\n`;
        break;
      case 'tool':
        if (msg.toolCall) {
          output += `### Tool: \`${msg.toolCall.name}\`\n\n`;
          output += '```json\n' + JSON.stringify(msg.toolCall.arguments, null, 2) + '\n```\n\n';
        }
        if (msg.toolResult) {
          output += '**Result:**\n\n';
          if (msg.toolResult.success) {
            output += '```\n' + (msg.toolResult.output || 'Success') + '\n```\n\n';
          } else {
            output += '```\nError: ' + msg.toolResult.error + '\n```\n\n';
          }
        }
        break;
    }
  }

  output += '## Summary\n\n';
  output += `| Metric | Value |\n`;
  output += `|--------|-------|\n`;
  output += `| Success | ${result.success ? '✅' : '❌'} |\n`;
  output += `| Exit Code | ${result.exitCode} |\n`;
  output += `| Total Messages | ${result.summary.totalMessages} |\n`;
  output += `| Tool Calls | ${result.summary.toolCalls} |\n`;
  output += `| Successful Tools | ${result.summary.successfulTools} |\n`;
  output += `| Failed Tools | ${result.summary.failedTools} |\n`;
  output += `| Duration | ${result.metadata.durationMs}ms |\n`;

  if (result.summary.filesModified.length > 0) {
    output += '\n### Files Modified\n\n';
    for (const file of result.summary.filesModified) {
      output += `- \`${file}\`\n`;
    }
  }

  if (result.summary.filesCreated.length > 0) {
    output += '\n### Files Created\n\n';
    for (const file of result.summary.filesCreated) {
      output += `- \`${file}\`\n`;
    }
  }

  if (result.summary.commandsExecuted.length > 0) {
    output += '\n### Commands Executed\n\n';
    for (const cmd of result.summary.commandsExecuted) {
      output += `- \`${cmd}\`\n`;
    }
  }

  if (result.summary.errors.length > 0) {
    output += '\n### Errors\n\n';
    for (const error of result.summary.errors) {
      output += `- ${error}\n`;
    }
  }

  output += '\n## Metadata\n\n';
  output += `- **Model**: ${result.metadata.model}\n`;
  output += `- **Working Directory**: ${result.metadata.workingDirectory}\n`;
  output += `- **Start Time**: ${result.metadata.startTime}\n`;
  output += `- **End Time**: ${result.metadata.endTime}\n`;

  return output;
}

/**
 * Create a HeadlessResult from chat entries
 */
export function createHeadlessResult(
  chatEntries: Array<{
    type: string;
    content: string;
    timestamp: Date;
    toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    toolCall?: { id: string; function: { name: string; arguments: string } };
    toolResult?: { success: boolean; output?: string; error?: string };
  }>,
  options: {
    model: string;
    startTime: Date;
    workingDirectory: string;
    success?: boolean;
  }
): HeadlessResult {
  const messages: HeadlessMessage[] = [];
  const summary: ResultSummary = {
    totalMessages: 0,
    toolCalls: 0,
    successfulTools: 0,
    failedTools: 0,
    filesModified: [],
    filesCreated: [],
    commandsExecuted: [],
    errors: []
  };

  for (const entry of chatEntries) {
    const msg: HeadlessMessage = {
      role: entry.type === 'user' ? 'user' :
            entry.type === 'assistant' ? 'assistant' :
            entry.type === 'tool_result' ? 'tool' : 'system',
      content: entry.content,
      timestamp: entry.timestamp.toISOString()
    };

    if (entry.toolCall) {
      msg.toolCall = {
        id: entry.toolCall.id,
        name: entry.toolCall.function.name,
        arguments: JSON.parse(entry.toolCall.function.arguments)
      };
      summary.toolCalls++;

      // Track specific tool types
      const toolName = entry.toolCall.function.name;
      const args = JSON.parse(entry.toolCall.function.arguments);

      if (toolName === 'str_replace_editor' && args.path) {
        if (!summary.filesModified.includes(args.path)) {
          summary.filesModified.push(args.path);
        }
      } else if (toolName === 'create_file' && args.path) {
        if (!summary.filesCreated.includes(args.path)) {
          summary.filesCreated.push(args.path);
        }
      } else if (toolName === 'bash' && args.command) {
        summary.commandsExecuted.push(args.command);
      }
    }

    if (entry.toolResult) {
      msg.toolResult = entry.toolResult;
      if (entry.toolResult.success) {
        summary.successfulTools++;
      } else {
        summary.failedTools++;
        if (entry.toolResult.error) {
          summary.errors.push(entry.toolResult.error);
        }
      }
    }

    messages.push(msg);
    summary.totalMessages++;
  }

  const endTime = new Date();
  const hasErrors = summary.failedTools > 0 || summary.errors.length > 0;

  return {
    success: options.success ?? !hasErrors,
    exitCode: (options.success ?? !hasErrors) ? 0 : 1,
    messages,
    summary,
    metadata: {
      model: options.model,
      startTime: options.startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - options.startTime.getTime(),
      workingDirectory: options.workingDirectory
    }
  };
}

/**
 * Output formatter based on format type
 */
export function formatOutput(result: HeadlessResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatAsJson(result);
    case 'stream-json':
      return formatAsStreamJson(result.messages).join('\n');
    case 'text':
      return formatAsText(result);
    case 'markdown':
      return formatAsMarkdown(result);
    default:
      return formatAsJson(result);
  }
}
