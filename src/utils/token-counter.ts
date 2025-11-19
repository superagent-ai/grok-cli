import { get_encoding, encoding_for_model, Tiktoken } from 'tiktoken';
import { TOKEN_CONFIG } from '../constants.js';

export class TokenCounter {
  private encoder: Tiktoken;
  private cache: Map<string, number> = new Map();
  private static readonly MAX_CACHE_SIZE = 1000;

  constructor(model: string = TOKEN_CONFIG.DEFAULT_MODEL) {
    try {
      // Try to get encoding for specific model
      this.encoder = encoding_for_model(model as any);
    } catch {
      // Fallback to cl100k_base (used by GPT-4 and most modern models)
      this.encoder = get_encoding(TOKEN_CONFIG.DEFAULT_ENCODING);
    }
  }

  /**
   * Count tokens in a string with LRU caching for performance
   */
  countTokens(text: string): number {
    if (!text) return 0;

    // Check cache first
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      return cached;
    }

    // Count tokens
    const count = this.encoder.encode(text).length;

    // Add to cache with LRU eviction
    if (this.cache.size >= TokenCounter.MAX_CACHE_SIZE) {
      // Remove oldest entry (first one)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, count);

    return count;
  }

  /**
   * Count tokens in messages array (for chat completions)
   */
  countMessageTokens(messages: Array<{ role: string; content: string | null; [key: string]: any }>): number {
    let totalTokens = 0;

    for (const message of messages) {
      // Every message follows <|start|>{role/name}\n{content}<|end|\>\n
      totalTokens += TOKEN_CONFIG.TOKENS_PER_MESSAGE;

      if (message.content && typeof message.content === 'string') {
        totalTokens += this.countTokens(message.content);
      }

      if (message.role) {
        totalTokens += this.countTokens(message.role);
      }

      // Add extra tokens for tool calls if present
      if (message.tool_calls) {
        totalTokens += this.countTokens(JSON.stringify(message.tool_calls));
      }
    }

    totalTokens += TOKEN_CONFIG.TOKENS_FOR_REPLY_PRIMING;

    return totalTokens;
  }

  /**
   * Estimate tokens for streaming content
   * This is an approximation since we don't have the full response yet
   */
  estimateStreamingTokens(accumulatedContent: string): number {
    return this.countTokens(accumulatedContent);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.cache.clear();
    this.encoder.free();
  }
}

/**
 * Format token count for display (e.g., 1.2k for 1200)
 */
export function formatTokenCount(count: number): string {
  if (count <= 999) {
    return count.toString();
  }
  
  if (count < 1_000_000) {
    const k = count / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  
  const m = count / 1_000_000;
  return m % 1 === 0 ? `${m}m` : `${m.toFixed(1)}m`;
}

/**
 * Create a token counter instance
 */
export function createTokenCounter(model?: string): TokenCounter {
  return new TokenCounter(model);
}