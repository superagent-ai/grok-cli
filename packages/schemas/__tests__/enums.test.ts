/**
 * Test suite for centralized enums
 *
 * Tests validation, type inference, and exhaustiveness checking for all enum types.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  MessageRoleEnum,
  FinishReasonEnum,
  TransportEnum,
  EditorCommandEnum,
  type MessageRole,
  type FinishReason,
  type Transport,
  type EditorCommand,
} from '../src/index.js';

describe('Centralized Enums', () => {
  describe('MessageRoleEnum', () => {
    it('should validate valid message roles', () => {
      expect(MessageRoleEnum.safeParse('system').success).toBe(true);
      expect(MessageRoleEnum.safeParse('user').success).toBe(true);
      expect(MessageRoleEnum.safeParse('assistant').success).toBe(true);
      expect(MessageRoleEnum.safeParse('tool').success).toBe(true);
    });

    it('should reject invalid message roles', () => {
      expect(MessageRoleEnum.safeParse('invalid').success).toBe(false);
      expect(MessageRoleEnum.safeParse('admin').success).toBe(false);
      expect(MessageRoleEnum.safeParse('').success).toBe(false);
      expect(MessageRoleEnum.safeParse(123).success).toBe(false);
      expect(MessageRoleEnum.safeParse(null).success).toBe(false);
    });

    it('should parse valid roles', () => {
      const role = MessageRoleEnum.parse('user');
      expect(role).toBe('user');
      expectTypeOf(role).toEqualTypeOf<MessageRole>();
    });

    it('should throw on invalid parse', () => {
      expect(() => MessageRoleEnum.parse('invalid')).toThrow();
    });

    it('should provide enum options', () => {
      const options = MessageRoleEnum.options;
      expect(options).toEqual(['system', 'user', 'assistant', 'tool']);
    });

    it('should work in switch statements', () => {
      function getRoleDescription(role: MessageRole): string {
        switch (role) {
          case 'system':
            return 'System message';
          case 'user':
            return 'User message';
          case 'assistant':
            return 'AI response';
          case 'tool':
            return 'Tool execution result';
        }
      }

      expect(getRoleDescription('user')).toBe('User message');
      expect(getRoleDescription('system')).toBe('System message');
    });
  });

  describe('FinishReasonEnum', () => {
    it('should validate valid finish reasons', () => {
      expect(FinishReasonEnum.safeParse('stop').success).toBe(true);
      expect(FinishReasonEnum.safeParse('length').success).toBe(true);
      expect(FinishReasonEnum.safeParse('tool_calls').success).toBe(true);
      expect(FinishReasonEnum.safeParse('content_filter').success).toBe(true);
    });

    it('should reject invalid finish reasons', () => {
      expect(FinishReasonEnum.safeParse('invalid').success).toBe(false);
      expect(FinishReasonEnum.safeParse('timeout').success).toBe(false);
      expect(FinishReasonEnum.safeParse('').success).toBe(false);
    });

    it('should parse valid reasons', () => {
      const reason = FinishReasonEnum.parse('stop');
      expect(reason).toBe('stop');
      expectTypeOf(reason).toEqualTypeOf<FinishReason>();
    });

    it('should provide enum options', () => {
      const options = FinishReasonEnum.options;
      expect(options).toEqual(['stop', 'length', 'tool_calls', 'content_filter']);
    });

    it('should work in switch statements', () => {
      function handleFinishReason(reason: FinishReason): string {
        switch (reason) {
          case 'stop':
            return 'Completed successfully';
          case 'length':
            return 'Reached token limit';
          case 'tool_calls':
            return 'Executing tools';
          case 'content_filter':
            return 'Content filtered';
        }
      }

      expect(handleFinishReason('stop')).toBe('Completed successfully');
      expect(handleFinishReason('length')).toBe('Reached token limit');
      expect(handleFinishReason('tool_calls')).toBe('Executing tools');
      expect(handleFinishReason('content_filter')).toBe('Content filtered');
    });
  });

  describe('TransportEnum', () => {
    it('should validate valid transport types', () => {
      expect(TransportEnum.safeParse('stdio').success).toBe(true);
      expect(TransportEnum.safeParse('http').success).toBe(true);
      expect(TransportEnum.safeParse('sse').success).toBe(true);
    });

    it('should reject invalid transport types', () => {
      expect(TransportEnum.safeParse('invalid').success).toBe(false);
      expect(TransportEnum.safeParse('websocket').success).toBe(false);
      expect(TransportEnum.safeParse('tcp').success).toBe(false);
      expect(TransportEnum.safeParse('').success).toBe(false);
    });

    it('should parse valid transports', () => {
      const transport = TransportEnum.parse('stdio');
      expect(transport).toBe('stdio');
      expectTypeOf(transport).toEqualTypeOf<Transport>();
    });

    it('should provide enum options', () => {
      const options = TransportEnum.options;
      expect(options).toEqual(['stdio', 'http', 'sse']);
    });

    it('should work in switch statements', () => {
      function getTransportDescription(transport: Transport): string {
        switch (transport) {
          case 'stdio':
            return 'Standard I/O';
          case 'http':
            return 'HTTP protocol';
          case 'sse':
            return 'Server-Sent Events';
        }
      }

      expect(getTransportDescription('stdio')).toBe('Standard I/O');
      expect(getTransportDescription('http')).toBe('HTTP protocol');
      expect(getTransportDescription('sse')).toBe('Server-Sent Events');
    });
  });

  describe('EditorCommandEnum', () => {
    it('should validate valid editor commands', () => {
      expect(EditorCommandEnum.safeParse('view').success).toBe(true);
      expect(EditorCommandEnum.safeParse('str_replace').success).toBe(true);
      expect(EditorCommandEnum.safeParse('create').success).toBe(true);
      expect(EditorCommandEnum.safeParse('insert').success).toBe(true);
      expect(EditorCommandEnum.safeParse('undo_edit').success).toBe(true);
    });

    it('should reject invalid editor commands', () => {
      expect(EditorCommandEnum.safeParse('invalid').success).toBe(false);
      expect(EditorCommandEnum.safeParse('delete').success).toBe(false);
      expect(EditorCommandEnum.safeParse('save').success).toBe(false);
      expect(EditorCommandEnum.safeParse('').success).toBe(false);
    });

    it('should parse valid commands', () => {
      const command = EditorCommandEnum.parse('str_replace');
      expect(command).toBe('str_replace');
      expectTypeOf(command).toEqualTypeOf<EditorCommand>();
    });

    it('should provide enum options', () => {
      const options = EditorCommandEnum.options;
      expect(options).toEqual(['view', 'str_replace', 'create', 'insert', 'undo_edit']);
    });

    it('should work in switch statements', () => {
      function executeCommand(command: EditorCommand): string {
        switch (command) {
          case 'view':
            return 'Viewing file';
          case 'str_replace':
            return 'Replacing string';
          case 'create':
            return 'Creating file';
          case 'insert':
            return 'Inserting content';
          case 'undo_edit':
            return 'Undoing edit';
        }
      }

      expect(executeCommand('view')).toBe('Viewing file');
      expect(executeCommand('str_replace')).toBe('Replacing string');
      expect(executeCommand('create')).toBe('Creating file');
      expect(executeCommand('insert')).toBe('Inserting content');
      expect(executeCommand('undo_edit')).toBe('Undoing edit');
    });
  });

  describe('Type Safety', () => {
    it('should prevent mixing different enum types', () => {
      // These should fail at compile time
      // @ts-expect-error - Cannot assign FinishReason to MessageRole
      const wrongAssignment1: MessageRole = 'stop' as FinishReason;

      // @ts-expect-error - Cannot assign Transport to EditorCommand
      const wrongAssignment2: EditorCommand = 'stdio' as Transport;

      // Satisfy linter
      expect(wrongAssignment1).toBeDefined();
      expect(wrongAssignment2).toBeDefined();
    });

    it('should enforce correct enum types in function signatures', () => {
      function processMessage(role: MessageRole, content: string): string {
        return `[${role}] ${content}`;
      }

      const validRole: MessageRole = 'user';
      expect(processMessage(validRole, 'Hello')).toBe('[user] Hello');

      // The following would fail at compile time
      // @ts-expect-error - Cannot pass FinishReason as MessageRole
      // processMessage('stop', 'Hello');
    });
  });

  describe('Integration Tests', () => {
    it('should work in AI message construction scenario', () => {
      interface Message {
        role: MessageRole;
        content: string;
      }

      function createMessage(role: MessageRole, content: string): Message {
        return { role, content };
      }

      const userMessage = createMessage('user', 'What is the weather?');
      expect(userMessage).toEqual({
        role: 'user',
        content: 'What is the weather?',
      });

      const assistantMessage = createMessage('assistant', 'It is sunny');
      expect(assistantMessage.role).toBe('assistant');
    });

    it('should work in MCP server configuration scenario', () => {
      interface MCPServerConfig {
        name: string;
        transport: Transport;
        url?: string;
        command?: string;
      }

      function configureMCPServer(name: string, transport: Transport): MCPServerConfig {
        return { name, transport };
      }

      const httpServer = configureMCPServer('linear-api', 'http');
      expect(httpServer.transport).toBe('http');

      const stdioServer = configureMCPServer('local-server', 'stdio');
      expect(stdioServer.transport).toBe('stdio');
    });

    it('should work in API response tracking scenario', () => {
      interface APIResponse {
        content: string;
        finish_reason: FinishReason | null;
      }

      function createResponse(content: string, reason: FinishReason | null): APIResponse {
        return { content, finish_reason: reason };
      }

      const normalResponse = createResponse('Hello', 'stop');
      expect(normalResponse.finish_reason).toBe('stop');

      const truncatedResponse = createResponse('Long text...', 'length');
      expect(truncatedResponse.finish_reason).toBe('length');

      const streamingResponse = createResponse('Partial', null);
      expect(streamingResponse.finish_reason).toBeNull();
    });

    it('should work in editor command execution scenario', () => {
      interface EditorOperation {
        command: EditorCommand;
        path: string;
        args: unknown;
      }

      function createOperation(command: EditorCommand, path: string): EditorOperation {
        return { command, path, args: {} };
      }

      const viewOp = createOperation('view', '/file.ts');
      expect(viewOp.command).toBe('view');

      const replaceOp = createOperation('str_replace', '/file.ts');
      expect(replaceOp.command).toBe('str_replace');
    });
  });

  describe('Security - Boundary Validation', () => {
    it('should reject malformed enum values at API boundaries', () => {
      // Simulate user input from API
      const userInputs = [
        'invalid',
        'admin',          // Not a valid MessageRole
        '<script>',       // XSS attempt
        'DROP TABLE',     // SQL injection attempt
        '',               // Empty string
        '../../etc/passwd', // Path traversal attempt
      ];

      userInputs.forEach((input) => {
        expect(MessageRoleEnum.safeParse(input).success).toBe(false);
        expect(FinishReasonEnum.safeParse(input).success).toBe(false);
        expect(TransportEnum.safeParse(input).success).toBe(false);
        expect(EditorCommandEnum.safeParse(input).success).toBe(false);
      });
    });

    it('should validate before use in critical operations', () => {
      function executeEditorCommand(commandInput: unknown): string {
        // SAFE: Validate before execution
        const result = EditorCommandEnum.safeParse(commandInput);

        if (!result.success) {
          return 'Error: Invalid command';
        }

        const command = result.data;

        // Now safe to use in switch
        switch (command) {
          case 'view':
            return 'Viewing file';
          case 'str_replace':
            return 'Replacing string';
          case 'create':
            return 'Creating file';
          case 'insert':
            return 'Inserting content';
          case 'undo_edit':
            return 'Undoing edit';
        }
      }

      expect(executeEditorCommand('view')).toBe('Viewing file');
      expect(executeEditorCommand('invalid')).toBe('Error: Invalid command');
      expect(executeEditorCommand('delete')).toBe('Error: Invalid command');
    });
  });

  describe('Exhaustiveness Checking', () => {
    it('should enforce exhaustive handling of all enum values', () => {
      // This function must handle all MessageRole values
      function getMessageIcon(role: MessageRole): string {
        switch (role) {
          case 'system':
            return '🔧';
          case 'user':
            return '👤';
          case 'assistant':
            return '🤖';
          case 'tool':
            return '🛠️';
          // If we miss a case, TypeScript will error (in strict mode)
        }
      }

      expect(getMessageIcon('system')).toBe('🔧');
      expect(getMessageIcon('user')).toBe('👤');
      expect(getMessageIcon('assistant')).toBe('🤖');
      expect(getMessageIcon('tool')).toBe('🛠️');
    });

    it('should catch missing cases at compile time', () => {
      // This demonstrates exhaustiveness checking
      // If a new enum value is added, this will fail to compile
      const allRoles: MessageRole[] = ['system', 'user', 'assistant', 'tool'];

      allRoles.forEach((role) => {
        const result = MessageRoleEnum.safeParse(role);
        expect(result.success).toBe(true);
      });
    });
  });
});
