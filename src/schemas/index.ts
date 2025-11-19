import { z } from 'zod';
import { MessageRoleEnum, FinishReasonEnum, TransportEnum, ModelIdSchema } from '@ax-cli/schemas';

/**
 * Configuration schemas using Zod for runtime validation
 */

// User settings schema
export const UserSettingsSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().url().optional(),
  defaultModel: ModelIdSchema.optional(),
  models: z.array(ModelIdSchema).optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

// Project settings schema
export const ProjectSettingsSchema = z.object({
  model: ModelIdSchema.optional(),
  mcpServers: z.record(z.string(), z.object({
    name: z.string(),
    transport: TransportEnum,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })).optional(),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

// MCP Server configuration schema
export const MCPServerConfigSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  transport: TransportEnum,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  env: z.record(z.string(), z.string()).optional(),
}).refine(
  (data) => {
    if (data.transport === 'stdio') {
      return !!data.command;
    }
    if (data.transport === 'http' || data.transport === 'sse') {
      return !!data.url;
    }
    return true;
  },
  {
    message: 'stdio transport requires command, http/sse requires url',
  }
);

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// Tool execution schema
export const ToolExecutionSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export type ToolExecution = z.infer<typeof ToolExecutionSchema>;

// API Response schema
export const APIResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: ModelIdSchema,
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: MessageRoleEnum,
      content: z.string().nullable(),
      tool_calls: z.array(z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })).optional(),
    }),
    finish_reason: FinishReasonEnum.nullable(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }).optional(),
});

export type APIResponse = z.infer<typeof APIResponseSchema>;

/**
 * Validation helper functions
 */

export function validateUserSettings(data: unknown): UserSettings {
  return UserSettingsSchema.parse(data);
}

export function validateProjectSettings(data: unknown): ProjectSettings {
  return ProjectSettingsSchema.parse(data);
}

export function validateMCPServerConfig(data: unknown): MCPServerConfig {
  return MCPServerConfigSchema.parse(data);
}

/**
 * Safe parsing with error handling
 */

export function safeValidateUserSettings(data: unknown): {
  success: boolean;
  data?: UserSettings;
  error?: z.ZodError;
} {
  const result = UserSettingsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeValidateProjectSettings(data: unknown): {
  success: boolean;
  data?: ProjectSettings;
  error?: z.ZodError;
} {
  const result = ProjectSettingsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
