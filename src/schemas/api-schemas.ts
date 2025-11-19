/**
 * Zod schemas for API request/response validation
 * Ensures type safety for external API interactions
 */

import { z } from 'zod';
import { MessageRoleEnum, ToolCallIdSchema, ModelIdSchema } from '@ax-cli/schemas';

// Grok Tool Call Schema
export const GrokToolCallSchema = z.object({
  id: ToolCallIdSchema,
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

export type GrokToolCall = z.infer<typeof GrokToolCallSchema>;

// Grok Message Schema
export const GrokMessageSchema = z.object({
  role: MessageRoleEnum,
  content: z.string().nullable(),
  tool_calls: z.array(GrokToolCallSchema).optional(),
  tool_call_id: ToolCallIdSchema.optional(),
  name: z.string().optional(),
});

export type GrokMessage = z.infer<typeof GrokMessageSchema>;

// Grok Response Schema
export const GrokResponseSchema = z.object({
  id: z.string().optional(),
  object: z.string().optional(),
  created: z.number().optional(),
  model: ModelIdSchema.optional(),
  choices: z.array(
    z.object({
      index: z.number().optional(),
      message: z.object({
        role: z.string(),
        content: z.string().nullable(),
        tool_calls: z.array(GrokToolCallSchema).optional(),
      }),
      finish_reason: z.string().nullable(),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
});

export type GrokResponse = z.infer<typeof GrokResponseSchema>;

// Search Parameters Schema
export const SearchParametersSchema = z.object({
  mode: z.enum(['auto', 'on', 'off']).optional(),
});

export type SearchParameters = z.infer<typeof SearchParametersSchema>;

// Search Options Schema
export const SearchOptionsSchema = z.object({
  search_parameters: SearchParametersSchema.optional(),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

// Streaming Chunk Schema
export const StreamingChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('content'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('tool_calls'),
    toolCalls: z.array(GrokToolCallSchema),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolCall: GrokToolCallSchema,
    toolResult: z.object({
      success: z.boolean(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('token_count'),
    tokenCount: z.number(),
  }),
  z.object({
    type: z.literal('done'),
  }),
]);

export type StreamingChunk = z.infer<typeof StreamingChunkSchema>;

// Chat Entry Schema
export const ChatEntrySchema = z.object({
  type: z.enum(['user', 'assistant', 'tool_result', 'tool_call']),
  content: z.string(),
  timestamp: z.date(),
  toolCalls: z.array(GrokToolCallSchema).optional(),
  toolCall: GrokToolCallSchema.optional(),
  toolResult: z
    .object({
      success: z.boolean(),
      output: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  isStreaming: z.boolean().optional(),
});

export type ChatEntry = z.infer<typeof ChatEntrySchema>;

/**
 * Validation helper functions
 */

export function validateGrokResponse(data: unknown): GrokResponse {
  return GrokResponseSchema.parse(data);
}

export function safeValidateGrokResponse(data: unknown): {
  success: boolean;
  data?: GrokResponse;
  error?: z.ZodError;
} {
  const result = GrokResponseSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function validateToolCall(data: unknown): GrokToolCall {
  return GrokToolCallSchema.parse(data);
}

export function validateChatEntry(data: unknown): ChatEntry {
  return ChatEntrySchema.parse(data);
}
