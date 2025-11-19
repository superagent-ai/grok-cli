import { describe, it, expect } from 'vitest';
import {
  UserSettingsSchema,
  ProjectSettingsSchema,
  MCPServerConfigSchema,
  ToolExecutionSchema,
  APIResponseSchema,
  validateUserSettings,
  validateProjectSettings,
  validateMCPServerConfig,
  safeValidateUserSettings,
  safeValidateProjectSettings,
} from '../../src/schemas/index';
import { z } from 'zod';

describe('Schema Validation', () => {
  describe('UserSettingsSchema', () => {
    it('should validate valid user settings', () => {
      const validSettings = {
        apiKey: 'sk-test-key',
        baseURL: 'https://api.example.com',
        defaultModel: 'gpt-4',
        models: ['gpt-4', 'gpt-3.5-turbo'],
      };
      expect(() => UserSettingsSchema.parse(validSettings)).not.toThrow();
    });

    it('should validate empty user settings', () => {
      expect(() => UserSettingsSchema.parse({})).not.toThrow();
    });

    it('should reject invalid URL in baseURL', () => {
      const invalidSettings = {
        baseURL: 'not-a-url',
      };
      expect(() => UserSettingsSchema.parse(invalidSettings)).toThrow();
    });

    it('should accept optional fields', () => {
      const settings = {
        apiKey: 'sk-test',
      };
      const result = UserSettingsSchema.parse(settings);
      expect(result.apiKey).toBe('sk-test');
      expect(result.baseURL).toBeUndefined();
    });
  });

  describe('ProjectSettingsSchema', () => {
    it('should validate valid project settings', () => {
      const validSettings = {
        model: 'gpt-4',
        mcpServers: {
          'test-server': {
            name: 'Test Server',
            transport: 'stdio' as const,
            command: 'node',
            args: ['server.js'],
            env: { KEY: 'value' },
          },
        },
      };
      expect(() => ProjectSettingsSchema.parse(validSettings)).not.toThrow();
    });

    it('should validate empty project settings', () => {
      expect(() => ProjectSettingsSchema.parse({})).not.toThrow();
    });

    it('should validate http transport server', () => {
      const settings = {
        mcpServers: {
          'http-server': {
            name: 'HTTP Server',
            transport: 'http' as const,
            url: 'https://api.example.com',
          },
        },
      };
      expect(() => ProjectSettingsSchema.parse(settings)).not.toThrow();
    });
  });

  describe('MCPServerConfigSchema', () => {
    it('should validate stdio transport config', () => {
      const config = {
        name: 'Test Server',
        transport: 'stdio' as const,
        command: 'node',
        args: ['index.js'],
      };
      expect(() => MCPServerConfigSchema.parse(config)).not.toThrow();
    });

    it('should validate http transport config', () => {
      const config = {
        name: 'HTTP Server',
        transport: 'http' as const,
        url: 'https://api.example.com',
      };
      expect(() => MCPServerConfigSchema.parse(config)).not.toThrow();
    });

    it('should validate sse transport config', () => {
      const config = {
        name: 'SSE Server',
        transport: 'sse' as const,
        url: 'https://api.example.com/sse',
      };
      expect(() => MCPServerConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject stdio without command', () => {
      const config = {
        name: 'Test',
        transport: 'stdio' as const,
      };
      expect(() => MCPServerConfigSchema.parse(config)).toThrow();
    });

    it('should reject http without url', () => {
      const config = {
        name: 'Test',
        transport: 'http' as const,
      };
      expect(() => MCPServerConfigSchema.parse(config)).toThrow();
    });

    it('should reject empty name', () => {
      const config = {
        name: '',
        transport: 'stdio' as const,
        command: 'node',
      };
      expect(() => MCPServerConfigSchema.parse(config)).toThrow();
    });
  });

  describe('ToolExecutionSchema', () => {
    it('should validate tool execution', () => {
      const execution = {
        name: 'search',
        arguments: {
          query: 'test',
          limit: 10,
        },
      };
      expect(() => ToolExecutionSchema.parse(execution)).not.toThrow();
    });

    it('should validate with empty arguments', () => {
      const execution = {
        name: 'ping',
        arguments: {},
      };
      expect(() => ToolExecutionSchema.parse(execution)).not.toThrow();
    });

    it('should reject missing name', () => {
      const execution = {
        arguments: {},
      };
      expect(() => ToolExecutionSchema.parse(execution)).toThrow();
    });
  });

  describe('APIResponseSchema', () => {
    it('should validate complete API response', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Hello!',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };
      expect(() => APIResponseSchema.parse(response)).not.toThrow();
    });

    it('should validate response with tool calls', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function' as const,
                  function: {
                    name: 'search',
                    arguments: '{"query":"test"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls' as const,
          },
        ],
      };
      expect(() => APIResponseSchema.parse(response)).not.toThrow();
    });

    it('should accept null content', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: null,
            },
            finish_reason: null,
          },
        ],
      };
      expect(() => APIResponseSchema.parse(response)).not.toThrow();
    });
  });

  describe('validateUserSettings', () => {
    it('should validate and return user settings', () => {
      const settings = { apiKey: 'test' };
      const result = validateUserSettings(settings);
      expect(result.apiKey).toBe('test');
    });

    it('should throw on invalid settings', () => {
      const settings = { baseURL: 'invalid' };
      expect(() => validateUserSettings(settings)).toThrow();
    });
  });

  describe('validateProjectSettings', () => {
    it('should validate and return project settings', () => {
      const settings = { model: 'gpt-4' };
      const result = validateProjectSettings(settings);
      expect(result.model).toBe('gpt-4');
    });
  });

  describe('validateMCPServerConfig', () => {
    it('should validate and return server config', () => {
      const config = {
        name: 'Test',
        transport: 'stdio' as const,
        command: 'node',
      };
      const result = validateMCPServerConfig(config);
      expect(result.name).toBe('Test');
    });

    it('should throw on invalid config', () => {
      const config = {
        name: 'Test',
        transport: 'stdio' as const,
        // Missing command
      };
      expect(() => validateMCPServerConfig(config)).toThrow();
    });
  });

  describe('safeValidateUserSettings', () => {
    it('should return success for valid settings', () => {
      const settings = { apiKey: 'test' };
      const result = safeValidateUserSettings(settings);
      expect(result.success).toBe(true);
      expect(result.data?.apiKey).toBe('test');
    });

    it('should return error for invalid settings', () => {
      const settings = { baseURL: 'invalid' };
      const result = safeValidateUserSettings(settings);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(z.ZodError);
    });
  });

  describe('safeValidateProjectSettings', () => {
    it('should return success for valid settings', () => {
      const settings = { model: 'gpt-4' };
      const result = safeValidateProjectSettings(settings);
      expect(result.success).toBe(true);
      expect(result.data?.model).toBe('gpt-4');
    });

    it('should return error for invalid settings', () => {
      const settings = {
        mcpServers: {
          test: {
            name: '',
            transport: 'invalid',
          },
        },
      };
      const result = safeValidateProjectSettings(settings);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(z.ZodError);
    });
  });
});
