import { describe, it, expect } from 'vitest';
import { countTokens } from '../token-counter';

describe('token-counter', () => {
  describe('countTokens', () => {
    it('should count tokens in a simple message', () => {
      const count = countTokens('Hello, world!');
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it('should return 0 for empty string', () => {
      const count = countTokens('');
      expect(count).toBe(0);
    });

    it('should handle longer text', () => {
      const longText =
        'This is a longer piece of text that should have more tokens than a short one.';
      const count = countTokens(longText);
      expect(count).toBeGreaterThan(10);
    });

    it('should handle special characters', () => {
      const text = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle code snippets', () => {
      const code = `
        function hello() {
          console.log("Hello, world!");
        }
      `;
      const count = countTokens(code);
      expect(count).toBeGreaterThan(10);
    });
  });
});
