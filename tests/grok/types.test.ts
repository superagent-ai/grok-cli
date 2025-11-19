import { describe, it, expect } from 'vitest';
import {
  validateTemperature,
  validateMaxTokens,
  validateThinking,
  getModelConfig,
  createDefaultChatOptions,
  GLM_MODELS,
  isGLM46Response,
  hasReasoningContent,
  type ThinkingConfig,
} from '../../src/grok/types.js';
import { parseReasoningSteps } from '../../src/ui/components/reasoning-display.js';

describe('GLM-4.6 Type Validation', () => {
  describe('validateTemperature', () => {
    it('should accept valid temperature for glm-4.6 (0.6-1.0)', () => {
      expect(() => validateTemperature(0.6, 'glm-4.6')).not.toThrow();
      expect(() => validateTemperature(0.7, 'glm-4.6')).not.toThrow();
      expect(() => validateTemperature(1.0, 'glm-4.6')).not.toThrow();
    });

    it('should reject temperature below range for glm-4.6', () => {
      expect(() => validateTemperature(0.5, 'glm-4.6')).toThrow(/out of range/);
      expect(() => validateTemperature(0.0, 'glm-4.6')).toThrow(/out of range/);
    });

    it('should reject temperature above range for glm-4.6', () => {
      expect(() => validateTemperature(1.1, 'glm-4.6')).toThrow(/out of range/);
      expect(() => validateTemperature(2.0, 'glm-4.6')).toThrow(/out of range/);
    });

    it('should accept valid temperature for grok-code-fast-1 (0.0-2.0)', () => {
      expect(() => validateTemperature(0.0, 'grok-code-fast-1')).not.toThrow();
      expect(() => validateTemperature(1.0, 'grok-code-fast-1')).not.toThrow();
      expect(() => validateTemperature(2.0, 'grok-code-fast-1')).not.toThrow();
    });

    it('should reject temperature outside grok-code-fast-1 range', () => {
      expect(() => validateTemperature(-0.1, 'grok-code-fast-1')).toThrow(/out of range/);
      expect(() => validateTemperature(2.1, 'grok-code-fast-1')).toThrow(/out of range/);
    });

    it('should use default model config for unknown model', () => {
      // Should use glm-4.6 defaults
      expect(() => validateTemperature(0.7, 'unknown-model')).not.toThrow();
      expect(() => validateTemperature(2.0, 'unknown-model')).toThrow(/out of range/);
    });
  });

  describe('validateMaxTokens', () => {
    it('should accept valid max tokens for glm-4.6', () => {
      expect(() => validateMaxTokens(1, 'glm-4.6')).not.toThrow();
      expect(() => validateMaxTokens(8192, 'glm-4.6')).not.toThrow();
      expect(() => validateMaxTokens(128000, 'glm-4.6')).not.toThrow();
    });

    it('should reject max tokens exceeding glm-4.6 limit', () => {
      expect(() => validateMaxTokens(128001, 'glm-4.6')).toThrow(/exceeds model limit/);
      expect(() => validateMaxTokens(200000, 'glm-4.6')).toThrow(/exceeds model limit/);
    });

    it('should reject zero or negative max tokens', () => {
      expect(() => validateMaxTokens(0, 'glm-4.6')).toThrow(/must be at least 1/);
      expect(() => validateMaxTokens(-1, 'glm-4.6')).toThrow(/must be at least 1/);
    });

    it('should accept valid max tokens for grok-code-fast-1', () => {
      expect(() => validateMaxTokens(1, 'grok-code-fast-1')).not.toThrow();
      expect(() => validateMaxTokens(4096, 'grok-code-fast-1')).not.toThrow();
    });

    it('should reject max tokens exceeding grok-code-fast-1 limit', () => {
      expect(() => validateMaxTokens(4097, 'grok-code-fast-1')).toThrow(/exceeds model limit/);
    });
  });

  describe('validateThinking', () => {
    it('should accept thinking enabled for glm-4.6', () => {
      const thinking: ThinkingConfig = { type: 'enabled' };
      expect(() => validateThinking(thinking, 'glm-4.6')).not.toThrow();
    });

    it('should accept thinking disabled for any model', () => {
      const thinking: ThinkingConfig = { type: 'disabled' };
      expect(() => validateThinking(thinking, 'glm-4.6')).not.toThrow();
      expect(() => validateThinking(thinking, 'grok-code-fast-1')).not.toThrow();
    });

    it('should accept undefined thinking for any model', () => {
      expect(() => validateThinking(undefined, 'glm-4.6')).not.toThrow();
      expect(() => validateThinking(undefined, 'grok-code-fast-1')).not.toThrow();
    });

    it('should reject thinking enabled for models without support', () => {
      const thinking: ThinkingConfig = { type: 'enabled' };
      expect(() => validateThinking(thinking, 'grok-code-fast-1')).toThrow(/not supported/);
      expect(() => validateThinking(thinking, 'glm-4-air')).toThrow(/not supported/);
    });
  });

  describe('getModelConfig', () => {
    it('should return correct config for glm-4.6', () => {
      const config = getModelConfig('glm-4.6');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxOutputTokens).toBe(128000);
      expect(config.supportsThinking).toBe(true);
      expect(config.temperatureRange).toEqual({ min: 0.6, max: 1.0 });
    });

    it('should return correct config for grok-code-fast-1', () => {
      const config = getModelConfig('grok-code-fast-1');
      expect(config.contextWindow).toBe(128000);
      expect(config.maxOutputTokens).toBe(4096);
      expect(config.supportsThinking).toBe(false);
      expect(config.temperatureRange).toEqual({ min: 0.0, max: 2.0 });
    });

    it('should return default config for unknown model', () => {
      const config = getModelConfig('unknown-model');
      expect(config).toEqual(GLM_MODELS['glm-4.6']);
    });
  });

  describe('createDefaultChatOptions', () => {
    it('should create default options for glm-4.6', () => {
      const options = createDefaultChatOptions('glm-4.6');
      expect(options.model).toBe('glm-4.6');
      expect(options.temperature).toBe(0.7);
      expect(options.maxTokens).toBe(8192);
      expect(options.stream).toBe(false);
    });

    it('should create default options for grok-code-fast-1', () => {
      const options = createDefaultChatOptions('grok-code-fast-1');
      expect(options.model).toBe('grok-code-fast-1');
      expect(options.temperature).toBe(0.7);
      expect(options.maxTokens).toBe(Math.min(8192, GLM_MODELS['grok-code-fast-1'].maxOutputTokens));
      expect(options.stream).toBe(false);
    });

    it('should use glm-4.6 as default when no model specified', () => {
      const options = createDefaultChatOptions();
      expect(options.model).toBe('glm-4.6');
    });

    it('should cap max tokens at model limit', () => {
      const options = createDefaultChatOptions('glm-4-airx');
      expect(options.maxTokens).toBeLessThanOrEqual(GLM_MODELS['glm-4-airx'].maxOutputTokens);
    });
  });

  describe('isGLM46Response', () => {
    it('should return true for valid GLM-4.6 response', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello',
          },
          finish_reason: 'stop',
        }],
      };
      expect(isGLM46Response(response)).toBe(true);
    });

    it('should return true for response with reasoning_content', () => {
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Answer',
            reasoning_content: 'Thinking...',
          },
          finish_reason: 'stop',
        }],
      };
      expect(isGLM46Response(response)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isGLM46Response(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isGLM46Response(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isGLM46Response('not an object')).toBe(false);
      expect(isGLM46Response(123)).toBe(false);
    });

    it('should return false for object without choices', () => {
      expect(isGLM46Response({})).toBe(false);
      expect(isGLM46Response({ data: 'value' })).toBe(false);
    });

    it('should return false for object with non-array choices', () => {
      expect(isGLM46Response({ choices: 'not-array' })).toBe(false);
    });
  });

  describe('hasReasoningContent', () => {
    it('should return true for chunk with reasoning_content', () => {
      const chunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'glm-4.6',
        choices: [{
          index: 0,
          delta: {
            reasoning_content: 'Step 1: Analyze...',
          },
        }],
      };
      expect(hasReasoningContent(chunk)).toBe(true);
    });

    it('should return false for chunk without reasoning_content', () => {
      const chunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'glm-4.6',
        choices: [{
          index: 0,
          delta: {
            content: 'Hello',
          },
        }],
      };
      expect(hasReasoningContent(chunk)).toBe(false);
    });

    it('should return false for chunk with empty reasoning_content', () => {
      const chunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'glm-4.6',
        choices: [{
          index: 0,
          delta: {
            reasoning_content: '',
          },
        }],
      };
      expect(hasReasoningContent(chunk)).toBe(false);
    });

    it('should return false for chunk with no choices', () => {
      const chunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'glm-4.6',
        choices: [],
      };
      expect(hasReasoningContent(chunk)).toBe(false);
    });
  });

  describe('parseReasoningSteps', () => {
    it('should parse "Step N:" pattern', () => {
      const content = `Step 1: First thing
Step 2: Second thing
Step 3: Third thing`;
      const steps = parseReasoningSteps(content);
      expect(steps).toHaveLength(3);
      expect(steps[0]).toContain('Step 1');
      expect(steps[1]).toContain('Step 2');
      expect(steps[2]).toContain('Step 3');
    });

    it('should parse numbered list pattern', () => {
      const content = `1. First item
2. Second item
3. Third item`;
      const steps = parseReasoningSteps(content);
      expect(steps).toHaveLength(3);
      expect(steps[0]).toContain('1.');
      expect(steps[1]).toContain('2.');
    });

    it('should parse dash list pattern', () => {
      const content = `- First point
- Second point
- Third point`;
      const steps = parseReasoningSteps(content);
      expect(steps).toHaveLength(3);
    });

    it('should parse asterisk list pattern', () => {
      const content = `* First point
* Second point
* Third point`;
      const steps = parseReasoningSteps(content);
      expect(steps).toHaveLength(3);
    });

    it('should split by paragraphs when no pattern found', () => {
      const content = `First paragraph here.

Second paragraph here.

Third paragraph here.`;
      const steps = parseReasoningSteps(content);
      expect(steps.length).toBeGreaterThan(1);
    });

    it('should return single step for simple content', () => {
      const content = 'Simple reasoning without steps';
      const steps = parseReasoningSteps(content);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toBe(content);
    });

    it('should return empty array for empty content', () => {
      expect(parseReasoningSteps('')).toEqual([]);
      expect(parseReasoningSteps('   ')).toEqual([]);
    });

    it('should handle mixed content', () => {
      const content = `Let me think about this:

Step 1: First analyze the problem
Step 2: Then identify solutions
Step 3: Finally choose the best approach`;
      const steps = parseReasoningSteps(content);
      expect(steps.length).toBeGreaterThan(1);
    });
  });
});
