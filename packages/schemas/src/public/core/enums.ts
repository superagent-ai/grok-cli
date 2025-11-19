/**
 * Centralized Enums for @ax-cli/schemas
 *
 * This file contains all enumeration types used across the ax-cli ecosystem.
 * Using Zod enums provides:
 * - Runtime validation
 * - TypeScript type inference
 * - Exhaustiveness checking
 * - Auto-completion support
 *
 * SECURITY: Always validate enum values at system boundaries (API, file I/O, CLI args).
 *
 * @module enums
 */

import { z } from 'zod';

/**
 * Message Role Enum - Roles for chat messages in AI conversations
 *
 * Used in:
 * - GrokMessageSchema (src/grok/types.ts)
 * - Chat message payloads
 * - Message history tracking
 *
 * @security MUST validate at API boundaries when accepting message objects
 *
 * @example
 * ```typescript
 * const roleResult = MessageRoleEnum.safeParse(userInput);
 * if (roleResult.success) {
 *   const role = roleResult.data; // 'system' | 'user' | 'assistant' | 'tool'
 * }
 * ```
 */
export const MessageRoleEnum = z.enum(['system', 'user', 'assistant', 'tool']);

/**
 * Extract the TypeScript type from MessageRoleEnum
 */
export type MessageRole = z.infer<typeof MessageRoleEnum>;

/**
 * Finish Reason Enum - Reasons why an AI response completed
 *
 * Used in:
 * - GrokResponseSchema (src/grok/types.ts)
 * - API response tracking
 * - Usage analytics
 *
 * Values:
 * - `stop`: Natural completion (model decided to stop)
 * - `length`: Stopped due to max token limit
 * - `tool_calls`: Stopped to execute tool calls
 * - `content_filter`: Stopped due to content policy violation
 *
 * @security MUST validate at API boundaries
 *
 * @example
 * ```typescript
 * const result = FinishReasonEnum.safeParse(response.finish_reason);
 * if (result.success) {
 *   switch (result.data) {
 *     case 'stop':
 *       // Natural completion
 *       break;
 *     case 'length':
 *       // Truncated response
 *       break;
 *     case 'tool_calls':
 *       // Need to execute tools
 *       break;
 *     case 'content_filter':
 *       // Content policy violation
 *       break;
 *   }
 * }
 * ```
 */
export const FinishReasonEnum = z.enum([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
]);

/**
 * Extract the TypeScript type from FinishReasonEnum
 */
export type FinishReason = z.infer<typeof FinishReasonEnum>;

/**
 * Transport Enum - Communication protocols for MCP servers
 *
 * Used in:
 * - MCPServerConfigSchema (src/mcp/config.ts)
 * - MCP server initialization
 * - Transport layer selection
 *
 * Values:
 * - `stdio`: Standard input/output (for local processes)
 * - `http`: HTTP protocol (for remote servers)
 * - `sse`: Server-Sent Events (for streaming)
 *
 * @security MUST validate at MCP configuration boundaries
 *
 * @example
 * ```typescript
 * const config = {
 *   transport: TransportEnum.parse('stdio'),
 *   command: 'node',
 *   args: ['server.js']
 * };
 * ```
 */
export const TransportEnum = z.enum(['stdio', 'http', 'sse']);

/**
 * Extract the TypeScript type from TransportEnum
 */
export type Transport = z.infer<typeof TransportEnum>;

/**
 * Editor Command Enum - Commands for text editor tool
 *
 * Used in:
 * - EditorCommand interface (src/tools/text-editor.ts)
 * - Text editing operations
 * - Command validation
 *
 * Values:
 * - `view`: View file contents (read-only)
 * - `str_replace`: Replace string in file (search and replace)
 * - `create`: Create new file with content
 * - `insert`: Insert content at specific line
 * - `undo_edit`: Undo the last edit operation
 *
 * @security MUST validate at tool execution boundaries
 * @security Command execution should be sandboxed to prevent file system abuse
 *
 * @example
 * ```typescript
 * const command = EditorCommandEnum.parse('str_replace');
 * switch (command) {
 *   case 'view':
 *     return viewFile(path);
 *   case 'str_replace':
 *     return replaceString(path, oldStr, newStr);
 *   case 'create':
 *     return createFile(path, content);
 *   case 'insert':
 *     return insertContent(path, line, content);
 *   case 'undo_edit':
 *     return undoLastEdit();
 * }
 * ```
 */
export const EditorCommandEnum = z.enum([
  'view',
  'str_replace',
  'create',
  'insert',
  'undo_edit',
]);

/**
 * Extract the TypeScript type from EditorCommandEnum
 */
export type EditorCommand = z.infer<typeof EditorCommandEnum>;

/**
 * EXHAUSTIVENESS CHECKING EXAMPLES
 *
 * Zod enums enable TypeScript exhaustiveness checking via switch statements:
 *
 * ```typescript
 * function handleFinishReason(reason: FinishReason): string {
 *   switch (reason) {
 *     case 'stop':
 *       return 'Completed successfully';
 *     case 'length':
 *       return 'Reached token limit';
 *     case 'tool_calls':
 *       return 'Executing tools';
 *     case 'content_filter':
 *       return 'Content filtered';
 *     // TypeScript will error if any case is missing!
 *   }
 * }
 * ```
 *
 * VALIDATION AT BOUNDARIES
 *
 * Always validate enum values from external sources:
 *
 * ```typescript
 * // API endpoint
 * app.post('/api/message', (req, res) => {
 *   const roleResult = MessageRoleEnum.safeParse(req.body.role);
 *   if (!roleResult.success) {
 *     return res.status(400).json({
 *       error: 'Invalid message role',
 *       details: roleResult.error
 *     });
 *   }
 *
 *   // Safe to use - validated
 *   const message = createMessage(roleResult.data, req.body.content);
 * });
 * ```
 *
 * MIGRATION FROM STRING LITERALS
 *
 * Before (unsafe):
 * ```typescript
 * type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
 * const role: MessageRole = userInput as MessageRole; // No runtime validation!
 * ```
 *
 * After (safe):
 * ```typescript
 * const roleResult = MessageRoleEnum.safeParse(userInput);
 * if (roleResult.success) {
 *   const role: MessageRole = roleResult.data; // Validated!
 * }
 * ```
 */

/**
 * BEST PRACTICES SUMMARY
 *
 * 1. **Always validate at boundaries:**
 *    - Use `.safeParse()` for user input
 *    - Use `.parse()` when you want to throw on invalid input
 *
 * 2. **Use exhaustive switch statements:**
 *    - TypeScript will warn if you miss a case
 *    - Helps catch bugs when enums are extended
 *
 * 3. **Document enum usage:**
 *    - List where each enum is used
 *    - Explain what each value means
 *    - Note security implications
 *
 * 4. **Never cast to enum types:**
 *    - ❌ `const role = userInput as MessageRole`
 *    - ✅ `const role = MessageRoleEnum.parse(userInput)`
 */
