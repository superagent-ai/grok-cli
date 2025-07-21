import { GrokAgent } from '../../src/agent/grok-agent';
import { ConversationTurn, AgentWorkItem, ContextWindowConfig } from '../../src/types';
import { createTempTestDir, cleanupTempDir } from '../setup';

// Mock the Grok client to avoid real API calls
jest.mock('../../src/grok/client', () => ({
  GrokClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    chatStream: jest.fn(),
    getCurrentModel: jest.fn(() => 'grok-4-latest'),
    setModel: jest.fn(),
  })),
}));

// Mock tools to avoid file system operations
jest.mock('../../src/tools', () => ({
  TextEditorTool: jest.fn().mockImplementation(() => ({
    view: jest.fn(),
    create: jest.fn(),
    strReplace: jest.fn(),
  })),
  BashTool: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
    getCurrentDirectory: jest.fn(() => '/test/dir'),
  })),
  TodoTool: jest.fn().mockImplementation(() => ({
    createTodoList: jest.fn(),
    updateTodoList: jest.fn(),
  })),
  ConfirmationTool: jest.fn().mockImplementation(() => ({})),
}));

// Mock custom instructions
jest.mock('../../src/utils/custom-instructions', () => ({
  loadCustomInstructions: jest.fn(() => 'Test custom instructions'),
}));

describe('Context Management System', () => {
  let agent: GrokAgent;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempTestDir('context-management');
    agent = new GrokAgent('test-api-key');
    
    // Override config for testing
    (agent as any).contextConfig = {
      maxTokens: 1000, // Small limit for testing
      bufferTokens: 200,
      systemPromptTokens: 100,
      minRecentTurns: 1,
    };
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Turn Generation', () => {
    it('should generate unique turn IDs', () => {
      const id1 = (agent as any).generateTurnId();
      const id2 = (agent as any).generateTurnId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^turn_\d+_[a-z0-9]{9}$/);
    });
  });

  describe('Message to Turn Conversion', () => {
    it('should group simple user-assistant exchange into turn', () => {
      // Simulate a simple conversation
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      (agent as any).messages = messages;
      const turns = (agent as any).groupMessagesIntoTurns();

      expect(turns).toHaveLength(1);
      expect(turns[0].userMessage.content).toBe('Hello');
      expect(turns[0].agentWorkSession).toHaveLength(1);
      expect(turns[0].agentWorkSession[0].type).toBe('assistant_message');
      expect(turns[0].isComplete).toBe(true);
    });

    it('should group complex tool-calling conversation into turn', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Show me file.js' },
        { 
          role: 'assistant', 
          content: 'I\'ll show you the file',
          tool_calls: [{ 
            id: 'call_1', 
            function: { name: 'view_file', arguments: '{"path": "file.js"}' }
          }]
        },
        { 
          role: 'tool', 
          content: 'console.log("hello");',
          tool_call_id: 'call_1'
        },
        { role: 'assistant', content: 'Here\'s the content of file.js' },
      ];

      (agent as any).messages = messages;
      const turns = (agent as any).groupMessagesIntoTurns();

      expect(turns).toHaveLength(1);
      expect(turns[0].userMessage.content).toBe('Show me file.js');
      expect(turns[0].agentWorkSession).toHaveLength(3);
      expect(turns[0].agentWorkSession[0].type).toBe('tool_call');
      expect(turns[0].agentWorkSession[1].type).toBe('tool_result');
      expect(turns[0].agentWorkSession[2].type).toBe('assistant_message');
      expect(turns[0].activeFiles).toContain('file.js');
    });

    it('should handle multiple conversation turns', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        // First turn
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        // Second turn
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I\'m doing well!' },
      ];

      (agent as any).messages = messages;
      const turns = (agent as any).groupMessagesIntoTurns();

      expect(turns).toHaveLength(2);
      expect(turns[0].userMessage.content).toBe('Hello');
      expect(turns[1].userMessage.content).toBe('How are you?');
      expect(turns[0].isComplete).toBe(true);
      expect(turns[1].isComplete).toBe(true);
    });

    it('should handle incomplete turn (current conversation)', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];

      (agent as any).messages = messages;
      const turns = (agent as any).groupMessagesIntoTurns();

      expect(turns).toHaveLength(1);
      expect(turns[0].userMessage.content).toBe('Hello');
      expect(turns[0].agentWorkSession).toHaveLength(0);
      expect(turns[0].isComplete).toBe(false);
    });
  });

  describe('Active File Extraction', () => {
    it('should extract file paths from tool calls', () => {
      const turn: ConversationTurn = {
        id: 'test-turn',
        userMessage: { role: 'user', content: 'Edit file.js' },
        agentWorkSession: [],
        isComplete: false,
        tokenCount: 0,
        timestamp: new Date(),
        activeFiles: []
      };

      const message = {
        role: 'assistant',
        tool_calls: [{
          function: { 
            name: 'view_file', 
            arguments: '{"path": "src/test.js"}' 
          }
        }]
      };

      (agent as any).extractActiveFiles(message, turn);

      expect(turn.activeFiles).toContain('src/test.js');
    });

    it('should handle multiple files in one turn', () => {
      const turn: ConversationTurn = {
        id: 'test-turn',
        userMessage: { role: 'user', content: 'Compare files' },
        agentWorkSession: [],
        isComplete: false,
        tokenCount: 0,
        timestamp: new Date(),
        activeFiles: []
      };

      const message1 = {
        role: 'assistant',
        tool_calls: [{
          function: { 
            name: 'view_file', 
            arguments: '{"path": "file1.js"}' 
          }
        }]
      };

      const message2 = {
        role: 'assistant',
        tool_calls: [{
          function: { 
            name: 'str_replace_editor', 
            arguments: '{"path": "file2.js", "old_str": "old", "new_str": "new"}' 
          }
        }]
      };

      (agent as any).extractActiveFiles(message1, turn);
      (agent as any).extractActiveFiles(message2, turn);

      expect(turn.activeFiles).toContain('file1.js');
      expect(turn.activeFiles).toContain('file2.js');
      expect(turn.activeFiles).toHaveLength(2);
    });

    it('should not duplicate file paths', () => {
      const turn: ConversationTurn = {
        id: 'test-turn',
        userMessage: { role: 'user', content: 'Edit same file twice' },
        agentWorkSession: [],
        isComplete: false,
        tokenCount: 0,
        timestamp: new Date(),
        activeFiles: []
      };

      const message1 = {
        role: 'assistant',
        tool_calls: [{
          function: { 
            name: 'view_file', 
            arguments: '{"path": "file.js"}' 
          }
        }]
      };

      const message2 = {
        role: 'assistant',
        tool_calls: [{
          function: { 
            name: 'str_replace_editor', 
            arguments: '{"path": "file.js", "old_str": "old", "new_str": "new"}' 
          }
        }]
      };

      (agent as any).extractActiveFiles(message1, turn);
      (agent as any).extractActiveFiles(message2, turn);

      expect(turn.activeFiles).toContain('file.js');
      expect(turn.activeFiles).toHaveLength(1);
    });
  });

  describe('Token Calculation', () => {
    it('should calculate turn token count', () => {
      const turn: ConversationTurn = {
        id: 'test-turn',
        userMessage: { role: 'user', content: 'Hello world' },
        agentWorkSession: [
          {
            type: 'assistant_message',
            message: { role: 'assistant', content: 'Hi there, how are you?' },
            timestamp: new Date()
          }
        ],
        isComplete: true,
        tokenCount: 0,
        timestamp: new Date()
      };

      const tokenCount = (agent as any).calculateTurnTokens(turn);

      expect(tokenCount).toBeGreaterThan(0);
      expect(typeof tokenCount).toBe('number');
    });

    it('should calculate tokens for complex turn with tool calls', () => {
      const turn: ConversationTurn = {
        id: 'test-turn',
        userMessage: { role: 'user', content: 'Show me the file content please' },
        agentWorkSession: [
          {
            type: 'tool_call',
            message: { 
              role: 'assistant', 
              content: 'I\'ll show you the file',
              tool_calls: [{ 
                id: 'call_1', 
                function: { name: 'view_file', arguments: '{"path": "test.js"}' }
              }]
            },
            timestamp: new Date()
          },
          {
            type: 'tool_result',
            message: { 
              role: 'tool', 
              content: 'console.log("Hello World");',
              tool_call_id: 'call_1'
            },
            timestamp: new Date()
          }
        ],
        isComplete: true,
        tokenCount: 0,
        timestamp: new Date()
      };

      const tokenCount = (agent as any).calculateTurnTokens(turn);

      expect(tokenCount).toBeGreaterThan(0);
      // Should account for user message + both work items
      expect(tokenCount).toBeGreaterThan(10);
    });
  });

  describe('Turn Completion Detection', () => {
    beforeEach(() => {
      (agent as any).isExecutingTools = false;
    });

    it('should detect complete turn with assistant response', () => {
      (agent as any).messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const isComplete = (agent as any).isCurrentTurnComplete();
      expect(isComplete).toBe(true);
    });

    it('should detect incomplete turn with tool calls', () => {
      (agent as any).messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Show file' },
        { 
          role: 'assistant', 
          content: 'I\'ll show the file',
          tool_calls: [{ id: 'call_1', function: { name: 'view_file' } }]
        }
      ];

      const isComplete = (agent as any).isCurrentTurnComplete();
      expect(isComplete).toBe(false);
    });

    it('should detect incomplete turn when executing tools', () => {
      (agent as any).isExecutingTools = true;
      (agent as any).messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const isComplete = (agent as any).isCurrentTurnComplete();
      expect(isComplete).toBe(false);
    });
  });

  describe('Message Rebuilding', () => {
    it('should rebuild messages from turns maintaining order', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'Hello' },
          agentWorkSession: [
            {
              type: 'assistant_message',
              message: { role: 'assistant', content: 'Hi!' },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 50,
          timestamp: new Date()
        },
        {
          id: 'turn-2', 
          userMessage: { role: 'user', content: 'How are you?' },
          agentWorkSession: [
            {
              type: 'assistant_message',
              message: { role: 'assistant', content: 'Good!' },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 60,
          timestamp: new Date()
        }
      ];

      // Set initial messages with system prompt
      (agent as any).messages = [
        { role: 'system', content: 'You are helpful' }
      ];

      (agent as any).rebuildMessagesFromTurns(turns);

      const rebuiltMessages = (agent as any).messages;
      
      expect(rebuiltMessages).toHaveLength(5); // system + 2 turns * 2 messages each
      expect(rebuiltMessages[0].role).toBe('system');
      expect(rebuiltMessages[1].role).toBe('user');
      expect(rebuiltMessages[1].content).toBe('Hello');
      expect(rebuiltMessages[2].role).toBe('assistant');
      expect(rebuiltMessages[2].content).toBe('Hi!');
      expect(rebuiltMessages[3].role).toBe('user');
      expect(rebuiltMessages[3].content).toBe('How are you?');
      expect(rebuiltMessages[4].role).toBe('assistant');
      expect(rebuiltMessages[4].content).toBe('Good!');
    });

    it('should preserve system message when rebuilding', () => {
      const systemMessage = { role: 'system', content: 'You are a test assistant' };
      const turns: ConversationTurn[] = [{
        id: 'turn-1',
        userMessage: { role: 'user', content: 'Test' },
        agentWorkSession: [],
        isComplete: false,
        tokenCount: 20,
        timestamp: new Date()
      }];

      (agent as any).messages = [systemMessage];
      (agent as any).rebuildMessagesFromTurns(turns);

      const rebuiltMessages = (agent as any).messages;
      expect(rebuiltMessages[0]).toEqual(systemMessage);
    });
  });
});