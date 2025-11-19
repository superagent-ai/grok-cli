import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TokenCounter, formatTokenCount, createTokenCounter } from '../../src/utils/token-counter';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  afterEach(() => {
    counter.dispose();
  });

  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(counter.countTokens('')).toBe(0);
    });

    it('should count tokens in simple text', () => {
      const count = counter.countTokens('hello world');
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it('should count tokens in longer text', () => {
      const text = 'This is a longer piece of text that should have more tokens.';
      const count = counter.countTokens(text);
      expect(count).toBeGreaterThan(5);
    });

    it('should handle special characters', () => {
      const count = counter.countTokens('!@#$%^&*()');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle Unicode characters', () => {
      const count = counter.countTokens('Hello 世界 🌍');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countMessageTokens', () => {
    it('should count tokens in simple message', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
      ];
      const count = counter.countMessageTokens(messages);
      expect(count).toBeGreaterThan(3); // Base + content
    });

    it('should count tokens in multiple messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const count = counter.countMessageTokens(messages);
      expect(count).toBeGreaterThan(6);
    });

    it('should handle null content', () => {
      const messages = [
        { role: 'user', content: null },
      ];
      const count = counter.countMessageTokens(messages);
      expect(count).toBeGreaterThanOrEqual(3); // Base tokens
    });

    it('should count tool_calls if present', () => {
      const messages = [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function' as const,
              function: { name: 'test', arguments: '{}' },
            },
          ],
        },
      ];
      const count = counter.countMessageTokens(messages);
      expect(count).toBeGreaterThan(3);
    });
  });

  describe('estimateStreamingTokens', () => {
    it('should estimate tokens for accumulated content', () => {
      const content = 'This is streaming content';
      const estimate = counter.estimateStreamingTokens(content);
      expect(estimate).toBeGreaterThan(0);
    });

    it('should return 0 for empty content', () => {
      expect(counter.estimateStreamingTokens('')).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should cleanup resources without error', () => {
      // Note: dispose() is called in afterEach, so we don't call it again here
      // Just verify the counter exists
      expect(counter).toBeInstanceOf(TokenCounter);
    });
  });
});

describe('formatTokenCount', () => {
  it('should format small numbers as-is', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('should format thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(2000)).toBe('2k');
    expect(formatTokenCount(12345)).toBe('12.3k');
  });

  it('should format millions with m suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1m');
    expect(formatTokenCount(1_500_000)).toBe('1.5m');
    expect(formatTokenCount(2_000_000)).toBe('2m');
  });

  it('should handle edge cases', () => {
    expect(formatTokenCount(999_999)).toBe('1000.0k');
    expect(formatTokenCount(1_234_567)).toBe('1.2m');
  });
});

describe('createTokenCounter', () => {
  it('should create a token counter without model', () => {
    const counter = createTokenCounter();
    expect(counter).toBeInstanceOf(TokenCounter);
    counter.dispose();
  });

  it('should create a token counter with model', () => {
    const counter = createTokenCounter('gpt-4');
    expect(counter).toBeInstanceOf(TokenCounter);
    counter.dispose();
  });

  it('should handle invalid model gracefully', () => {
    const counter = createTokenCounter('invalid-model');
    expect(counter).toBeInstanceOf(TokenCounter);
    expect(counter.countTokens('test')).toBeGreaterThan(0);
    counter.dispose();
  });
});
