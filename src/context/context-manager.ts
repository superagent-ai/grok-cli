import { GrokMessage } from "../grok/client.js";
import { createTokenCounter, TokenCounter } from "../utils/token-counter.js";

export interface ContextConfig {
  maxTokens: number;
  reservedForResponse: number;
  summarizationThreshold: number;  // When to start summarizing
  keepRecentMessages: number;      // Always keep this many recent messages
}

export interface MessageSummary {
  originalCount: number;
  summarizedContent: string;
  tokensaved: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 128000,         // Default context window
  reservedForResponse: 4000, // Reserve for response
  summarizationThreshold: 0.7, // Start summarizing at 70% capacity
  keepRecentMessages: 10,    // Keep last 10 messages verbatim
};

export class ContextManager {
  private config: ContextConfig;
  private tokenCounter: TokenCounter;
  private summaryCache: Map<string, MessageSummary> = new Map();

  constructor(model: string = "grok-code-fast-1", config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenCounter = createTokenCounter(model);
  }

  updateModel(model: string): void {
    this.tokenCounter.dispose();
    this.tokenCounter = createTokenCounter(model);
  }

  /**
   * Get current token count for messages
   */
  getTokenCount(messages: GrokMessage[]): number {
    return this.tokenCounter.countMessageTokens(messages as any);
  }

  /**
   * Check if context needs compression
   */
  needsCompression(messages: GrokMessage[]): boolean {
    const currentTokens = this.getTokenCount(messages);
    const threshold = this.config.maxTokens * this.config.summarizationThreshold;
    return currentTokens > threshold;
  }

  /**
   * Get available tokens for new content
   */
  getAvailableTokens(messages: GrokMessage[]): number {
    const used = this.getTokenCount(messages);
    return Math.max(0, this.config.maxTokens - this.config.reservedForResponse - used);
  }

  /**
   * Compress context by summarizing old messages
   */
  async compressContext(
    messages: GrokMessage[],
    summarizer?: (content: string) => Promise<string>
  ): Promise<GrokMessage[]> {
    if (!this.needsCompression(messages)) {
      return messages;
    }

    // Find the system message
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    // Keep recent messages
    const keepCount = Math.min(
      this.config.keepRecentMessages,
      nonSystemMessages.length
    );
    const recentMessages = nonSystemMessages.slice(-keepCount);
    const oldMessages = nonSystemMessages.slice(0, -keepCount);

    if (oldMessages.length === 0) {
      return messages;  // Nothing to compress
    }

    // Create summary of old messages
    let summaryContent: string;

    if (summarizer) {
      // Use AI to summarize
      const oldContent = oldMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
      summaryContent = await summarizer(oldContent);
    } else {
      // Simple truncation-based summary
      summaryContent = this.createSimpleSummary(oldMessages);
    }

    // Build compressed message list
    const compressed: GrokMessage[] = [];

    if (systemMessage) {
      compressed.push(systemMessage);
    }

    // Add summary as a system message
    compressed.push({
      role: "system" as const,
      content: `[Conversation Summary - ${oldMessages.length} previous messages]\n${summaryContent}`,
    });

    // Add recent messages
    compressed.push(...recentMessages);

    return compressed;
  }

  private createSimpleSummary(messages: GrokMessage[]): string {
    const summary: string[] = [];

    // Group messages by topic/task
    let currentTopic = "";
    let topicMessages: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";

      // Detect topic changes (very basic)
      if (msg.role === "user" && content.length > 50) {
        if (topicMessages.length > 0) {
          summary.push(`- ${currentTopic}: ${topicMessages.length} exchanges`);
        }
        currentTopic = content.slice(0, 100).replace(/\n/g, " ");
        topicMessages = [];
      }

      topicMessages.push(content.slice(0, 200));
    }

    if (topicMessages.length > 0 && currentTopic) {
      summary.push(`- ${currentTopic}: ${topicMessages.length} exchanges`);
    }

    // Extract key information
    const keyInfo: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";

      // Look for file paths
      const filePaths = content.match(/(?:\/[\w.-]+)+\.\w+/g);
      if (filePaths) {
        keyInfo.push(`Files mentioned: ${[...new Set(filePaths)].slice(0, 5).join(", ")}`);
      }

      // Look for code blocks
      const codeBlocks = content.match(/```(\w+)?/g);
      if (codeBlocks) {
        keyInfo.push(`Code examples provided: ${codeBlocks.length}`);
      }
    }

    return [
      "Topics discussed:",
      ...summary.slice(0, 10),
      "",
      "Key information:",
      ...[...new Set(keyInfo)].slice(0, 5),
    ].join("\n");
  }

  /**
   * Smart truncation that preserves important content
   */
  smartTruncate(content: string, maxTokens: number): string {
    const currentTokens = this.tokenCounter.countTokens(content);

    if (currentTokens <= maxTokens) {
      return content;
    }

    // Calculate rough character limit (assuming ~4 chars per token)
    const targetChars = maxTokens * 4;

    // Try to preserve structure
    const lines = content.split("\n");

    // Keep first and last portions
    const keepRatio = targetChars / content.length;
    const keepLines = Math.floor(lines.length * keepRatio);

    if (keepLines < 10) {
      // Just truncate
      return content.slice(0, targetChars) + "\n... (truncated)";
    }

    const firstPart = lines.slice(0, Math.floor(keepLines / 2));
    const lastPart = lines.slice(-Math.floor(keepLines / 2));

    return [
      ...firstPart,
      "",
      `... (${lines.length - keepLines} lines omitted) ...`,
      "",
      ...lastPart,
    ].join("\n");
  }

  /**
   * Extract the most important parts of a tool result
   */
  compressToolResult(result: string, maxTokens: number = 1000): string {
    const currentTokens = this.tokenCounter.countTokens(result);

    if (currentTokens <= maxTokens) {
      return result;
    }

    // For code/diff content, try to preserve structure
    if (result.includes("```") || result.includes("@@")) {
      return this.smartTruncate(result, maxTokens);
    }

    // For lists/search results, keep first items
    const lines = result.split("\n");
    const truncatedLines: string[] = [];
    let tokens = 0;

    for (const line of lines) {
      const lineTokens = this.tokenCounter.countTokens(line);
      if (tokens + lineTokens > maxTokens) {
        truncatedLines.push(`... (${lines.length - truncatedLines.length} more lines)`);
        break;
      }
      truncatedLines.push(line);
      tokens += lineTokens;
    }

    return truncatedLines.join("\n");
  }

  /**
   * Prioritize messages by importance
   */
  prioritizeMessages(messages: GrokMessage[]): GrokMessage[] {
    // Sort by importance while maintaining order within priority groups
    const prioritized: GrokMessage[] = [];
    const systemMessages: GrokMessage[] = [];
    const toolResults: GrokMessage[] = [];
    const userMessages: GrokMessage[] = [];
    const assistantMessages: GrokMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessages.push(msg);
      } else if (msg.role === "tool") {
        toolResults.push(msg);
      } else if (msg.role === "user") {
        userMessages.push(msg);
      } else {
        assistantMessages.push(msg);
      }
    }

    // System messages first (highest priority)
    prioritized.push(...systemMessages);

    // Interleave user/assistant messages (maintain conversation flow)
    // But compress older tool results
    const conversationMessages = messages.filter((m) => m.role !== "system");
    const recentCount = this.config.keepRecentMessages * 2;

    for (let i = 0; i < conversationMessages.length; i++) {
      const msg = conversationMessages[i];
      const isRecent = i >= conversationMessages.length - recentCount;

      if (msg.role === "tool" && !isRecent) {
        // Compress old tool results
        prioritized.push({
          ...msg,
          content: this.compressToolResult(msg.content as string, 500),
        });
      } else {
        prioritized.push(msg);
      }
    }

    return prioritized;
  }

  formatStats(messages: GrokMessage[]): string {
    const totalTokens = this.getTokenCount(messages);
    const available = this.getAvailableTokens(messages);
    const usagePercent = (totalTokens / this.config.maxTokens) * 100;

    let output = `Context Usage:\n`;
    output += `  Total: ${totalTokens.toLocaleString()} / ${this.config.maxTokens.toLocaleString()} tokens\n`;
    output += `  Usage: ${usagePercent.toFixed(1)}%\n`;
    output += `  Available: ${available.toLocaleString()} tokens\n`;
    output += `  Messages: ${messages.length}\n`;

    if (this.needsCompression(messages)) {
      output += `\n  ⚠️ Context compression recommended\n`;
    }

    return output;
  }

  dispose(): void {
    this.tokenCounter.dispose();
    this.summaryCache.clear();
  }
}

// Singleton instance
let contextManagerInstance: ContextManager | null = null;

export function getContextManager(
  model?: string,
  config?: Partial<ContextConfig>
): ContextManager {
  if (!contextManagerInstance || model) {
    contextManagerInstance = new ContextManager(model, config);
  }
  return contextManagerInstance;
}
