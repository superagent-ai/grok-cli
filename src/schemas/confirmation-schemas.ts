/**
 * Zod schemas for confirmation service validation
 * Ensures type safety for user confirmation dialogs
 */

import { z } from 'zod';

// Confirmation Options Schema
export const ConfirmationOptionsSchema = z.object({
  operation: z.string().min(1, 'Operation description required'),
  filename: z.string().min(1, 'Filename required'),
  showVSCodeOpen: z.boolean().optional(),
  content: z.string().optional(),
});

export type ConfirmationOptions = z.infer<typeof ConfirmationOptionsSchema>;

// Confirmation Result Schema
export const ConfirmationResultSchema = z.object({
  confirmed: z.boolean(),
  dontAskAgain: z.boolean().optional(),
  feedback: z.string().optional(),
});

export type ConfirmationResult = z.infer<typeof ConfirmationResultSchema>;

// Session Flags Schema
export const SessionFlagsSchema = z.object({
  fileOperations: z.boolean(),
  bashCommands: z.boolean(),
  allOperations: z.boolean(),
});

export type SessionFlags = z.infer<typeof SessionFlagsSchema>;

/**
 * Validation helper functions
 */

export function validateConfirmationOptions(
  data: unknown
): ConfirmationOptions {
  return ConfirmationOptionsSchema.parse(data);
}

export function safeValidateConfirmationOptions(data: unknown): {
  success: boolean;
  data?: ConfirmationOptions;
  error?: z.ZodError;
} {
  const result = ConfirmationOptionsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function validateConfirmationResult(data: unknown): ConfirmationResult {
  return ConfirmationResultSchema.parse(data);
}
