import { get_encoding, encoding_for_model, Tiktoken } from 'tiktoken';

export class TokenCounter {
  private encoder: Tiktoken;

  constructor(model: string = 'gpt-4') {
    try {
      // Try to get encoding for specific model
      this.encoder = encoding_for_model(model as any);
    } catch {
      // Fallback to cl100k_base (used by GPT-4 and most modern models)
      this.encoder = get_encoding('cl100k_base');
    }
  }

  /**
   * Count tokens in a string
   */
  countTokens(text: string): number {
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  /**
   * Count tokens in messages array (for chat completions)
   */
  countMessageTokens(messages: Array<{ role: string; content: string | null | any; [key: string]: any }>): number {
    let totalTokens = 0;
    
    for (const message of messages) {
      // Every message follows <|start|>{role/name}\n{content}<|end|\>\n
      totalTokens += 3; // Base tokens per message
      
      // Handle different content types
      if (message.content) {
        if (typeof message.content === 'string') {
          totalTokens += this.countTokens(message.content);
        } else if (Array.isArray(message.content)) {
          // Handle array content (like ChatCompletionContentPartText[])
          for (const part of message.content) {
            if (typeof part === 'string') {
              totalTokens += this.countTokens(part);
            } else if (part && typeof part === 'object' && part.text) {
              totalTokens += this.countTokens(part.text);
            }
          }
        }
      }
      
      if (message.role) {
        totalTokens += this.countTokens(message.role);
      }
      
      // Add extra tokens for tool calls if present
      if (message.tool_calls) {
        totalTokens += this.countTokens(JSON.stringify(message.tool_calls));
      }
    }
    
    totalTokens += 3; // Every reply is primed with <|start|>assistant<|message|>
    
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
    this.encoder.free();
  }
}

/**
 * Create a token counter instance
 */
export function createTokenCounter(model?: string): TokenCounter {
  return new TokenCounter(model);
}