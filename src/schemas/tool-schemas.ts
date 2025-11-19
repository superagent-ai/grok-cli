/**
 * Zod schemas for runtime validation of tool arguments
 * Prevents crashes from malformed AI-generated data
 */

import { z } from 'zod';

// Bash Tool Schemas
export const BashExecuteSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  timeout: z.number().positive().optional(),
});

export const BashListFilesSchema = z.object({
  directory: z.string().optional().default('.'),
});

export const BashFindFilesSchema = z.object({
  pattern: z.string().min(1, 'Pattern cannot be empty'),
  directory: z.string().optional().default('.'),
});

export const BashGrepSchema = z.object({
  pattern: z.string().min(1, 'Pattern cannot be empty'),
  files: z.string().optional().default('.'),
});

// Text Editor Schemas
export const ReadFileSchema = z.object({
  file_path: z.string().min(1, 'File path cannot be empty'),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
});

export const WriteFileSchema = z.object({
  file_path: z.string().min(1, 'File path cannot be empty'),
  file_text: z.string(),
});

export const StrReplaceSchema = z.object({
  file_path: z.string().min(1, 'File path cannot be empty'),
  old_str: z.string().min(1, 'old_str cannot be empty'),
  new_str: z.string(),
  replace_all: z.boolean().optional().default(false),
});

export const InsertSchema = z.object({
  file_path: z.string().min(1, 'File path cannot be empty'),
  insert_line: z.number().int().positive(),
  new_str: z.string(),
});

export const UndoEditSchema = z.object({
  file_path: z.string().min(1, 'File path cannot be empty'),
});

// Search Tool Schemas
export const SearchSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  searchType: z.enum(['text', 'files', 'both']).optional(),
  includePattern: z.string().optional(),
  excludePattern: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  regex: z.boolean().optional(),
  maxResults: z.number().int().positive().optional(),
  fileTypes: z.array(z.string()).optional(),
  excludeFiles: z.array(z.string()).optional(),
  includeHidden: z.boolean().optional(),
});

// Todo Tool Schemas
export const TodoItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
});

export const CreateTodoListSchema = z.object({
  todos: z.array(TodoItemSchema).min(1, 'At least one todo item required'),
});

export const TodoUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  content: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});

export const UpdateTodoListSchema = z.object({
  updates: z.array(TodoUpdateSchema).min(1, 'At least one update required'),
});

// Export types
export type BashExecuteArgs = z.infer<typeof BashExecuteSchema>;
export type ReadFileArgs = z.infer<typeof ReadFileSchema>;
export type WriteFileArgs = z.infer<typeof WriteFileSchema>;
export type StrReplaceArgs = z.infer<typeof StrReplaceSchema>;
export type SearchArgs = z.infer<typeof SearchSchema>;
export type CreateTodoListArgs = z.infer<typeof CreateTodoListSchema>;
export type UpdateTodoListArgs = z.infer<typeof UpdateTodoListSchema>;
