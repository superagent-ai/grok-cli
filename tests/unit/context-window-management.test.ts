import { GrokAgent } from '../../src/agent/grok-agent';
import { ConversationTurn } from '../../src/types';
import { createTempTestDir, cleanupTempDir } from '../setup';

// Mock the Grok client and dependencies
jest.mock('../../src/grok/client', () => ({
  GrokClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
    chatStream: jest.fn(),
    getCurrentModel: jest.fn(() => 'grok-4-latest'),
    setModel: jest.fn(),
  })),
}));

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

jest.mock('../../src/utils/custom-instructions', () => ({
  loadCustomInstructions: jest.fn(() => 'Test instructions'),
}));

describe('Context Window Management', () => {
  let agent: GrokAgent;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempTestDir('context-window');
    agent = new GrokAgent('test-api-key');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Context Window Enforcement', () => {
    it('should not prune when under token limit', () => {
      // Set very high token limit
      (agent as any).contextConfig.maxTokens = 100000;
      (agent as any).contextConfig.bufferTokens = 1000;

      const originalMessages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      (agent as any).messages = [...originalMessages];
      
      // Mock token counter to return low count
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 500);

      (agent as any).manageContextWindow();

      expect((agent as any).messages).toHaveLength(originalMessages.length);
      expect((agent as any).messages).toEqual(originalMessages);
    });

    it('should prune messages when over token limit', () => {
      // Set low token limit to force pruning
      (agent as any).contextConfig.maxTokens = 1000;
      (agent as any).contextConfig.bufferTokens = 200;
      (agent as any).contextConfig.systemPromptTokens = 100;
      (agent as any).contextConfig.minRecentTurns = 1;

      // Create conversation with multiple turns
      const messages = [
        { role: 'system', content: 'You are helpful' },
        // Old turn
        { role: 'user', content: 'Tell me about the weather yesterday' },
        { role: 'assistant', content: 'Yesterday was sunny with clear skies...' },
        // Recent turn
        { role: 'user', content: 'What about today?' },
        { role: 'assistant', content: 'Today looks cloudy...' },
      ];

      (agent as any).messages = [...messages];

      // Mock token counter to return high count initially, then lower after pruning
      let callCount = 0;
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => {
        callCount++;
        return callCount === 1 ? 1500 : 400; // First call high, second low
      });

      // Mock groupMessagesIntoTurns to return turns
      const mockTurns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'Tell me about the weather yesterday' },
          agentWorkSession: [
            {
              type: 'assistant_message',
              message: { role: 'assistant', content: 'Yesterday was sunny...' },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 400,
          timestamp: new Date()
        },
        {
          id: 'turn-2',
          userMessage: { role: 'user', content: 'What about today?' },
          agentWorkSession: [
            {
              type: 'assistant_message',
              message: { role: 'assistant', content: 'Today looks cloudy...' },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 300,
          timestamp: new Date()
        }
      ];

      (agent as any).groupMessagesIntoTurns = jest.fn(() => mockTurns);
      (agent as any).calculateActiveFileContextTokens = jest.fn(() => 50);
      (agent as any).rebuildMessagesFromTurns = jest.fn();

      (agent as any).manageContextWindow();

      expect((agent as any).rebuildMessagesFromTurns).toHaveBeenCalledWith([mockTurns[1]]); // Only recent turn
    });

    it('should respect minimum recent turns', () => {
      (agent as any).contextConfig.maxTokens = 1000;
      (agent as any).contextConfig.bufferTokens = 200;
      (agent as any).contextConfig.minRecentTurns = 2;

      const mockTurns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'First' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        },
        {
          id: 'turn-2', 
          userMessage: { role: 'user', content: 'Second' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        }
      ];

      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 1500);
      (agent as any).groupMessagesIntoTurns = jest.fn(() => mockTurns);
      (agent as any).calculateActiveFileContextTokens = jest.fn(() => 0);
      (agent as any).rebuildMessagesFromTurns = jest.fn();

      (agent as any).manageContextWindow();

      // Should keep both turns due to minRecentTurns = 2
      expect((agent as any).rebuildMessagesFromTurns).toHaveBeenCalledWith(mockTurns);
    });

    it('should not prune if only minimum turns exist', () => {
      (agent as any).contextConfig.minRecentTurns = 2;

      const mockTurns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'First' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        }
      ];

      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 1500);
      (agent as any).groupMessagesIntoTurns = jest.fn(() => mockTurns);
      (agent as any).rebuildMessagesFromTurns = jest.fn();

      // Should return early without calling rebuildMessagesFromTurns
      (agent as any).manageContextWindow();

      expect((agent as any).rebuildMessagesFromTurns).not.toHaveBeenCalled();
    });
  });

  describe('Active File Context Management', () => {
    it('should calculate tokens for active files', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'Edit file' },
          agentWorkSession: [
            {
              type: 'tool_result',
              message: {
                role: 'tool',
                content: 'console.log("file content");',
                tool_call_id: 'call_1'
              },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date(),
          activeFiles: ['test.js']
        }
      ];

      (agent as any).tokenCounter.countTokens = jest.fn(() => 50);
      (agent as any).getLatestFileContent = jest.fn(() => 'console.log("file content");');

      const tokens = (agent as any).calculateActiveFileContextTokens(turns);

      expect(tokens).toBeGreaterThan(0);
      expect((agent as any).getLatestFileContent).toHaveBeenCalledWith('test.js', turns);
    });

    it('should not double-count same file in multiple turns', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'View file' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date(),
          activeFiles: ['same.js']
        },
        {
          id: 'turn-2',
          userMessage: { role: 'user', content: 'Edit same file' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date(),
          activeFiles: ['same.js']
        }
      ];

      (agent as any).tokenCounter.countTokens = jest.fn(() => 50);
      (agent as any).getLatestFileContent = jest.fn(() => 'file content');

      const tokens = (agent as any).calculateActiveFileContextTokens(turns);

      // Should only count the file once
      expect((agent as any).getLatestFileContent).toHaveBeenCalledTimes(1);
      expect((agent as any).tokenCounter.countTokens).toHaveBeenCalledTimes(1);
    });

    it('should get latest file content from most recent turn', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'View file' },
          agentWorkSession: [
            {
              type: 'tool_call',
              message: { 
                role: 'assistant',
                tool_calls: [{ 
                  id: 'call_1', 
                  function: { name: 'view_file', arguments: '{"path": "test.js"}' }
                }]
              },
              toolCall: { 
                id: 'call_1', 
                function: { name: 'view_file', arguments: '{"path": "test.js"}' }
              },
              timestamp: new Date()
            },
            {
              type: 'tool_result',
              message: {
                role: 'tool',
                content: 'old content',
                tool_call_id: 'call_1'
              },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        },
        {
          id: 'turn-2',
          userMessage: { role: 'user', content: 'Edit file' },
          agentWorkSession: [
            {
              type: 'tool_call',
              message: { 
                role: 'assistant',
                tool_calls: [{ 
                  id: 'call_2', 
                  function: { name: 'str_replace_editor', arguments: '{"path": "test.js"}' }
                }]
              },
              toolCall: { 
                id: 'call_2', 
                function: { name: 'str_replace_editor', arguments: '{"path": "test.js"}' }
              },
              timestamp: new Date()
            },
            {
              type: 'tool_result',
              message: {
                role: 'tool',
                content: 'new content',
                tool_call_id: 'call_2'
              },
              toolResult: {
                success: true,
                output: 'new content'
              },
              timestamp: new Date()
            }
          ],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        }
      ];

      const latestContent = (agent as any).getLatestFileContent('test.js', turns);

      // Should return the latest content from turn-2
      expect(latestContent).toBe('new content');
    });

    it('should return null for file not found', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          userMessage: { role: 'user', content: 'Hello' },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        }
      ];

      const content = (agent as any).getLatestFileContent('nonexistent.js', turns);
      expect(content).toBeNull();
    });
  });

  describe('Context Window Integration', () => {
    it('should call context management before processing user messages', async () => {
      const manageContextSpy = jest.spyOn(agent as any, 'manageContextWindow');
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Test response'
          }
        }]
      };

      (agent as any).grokClient.chat = jest.fn().mockResolvedValue(mockResponse);

      await agent.processUserMessage('Test message');

      expect(manageContextSpy).toHaveBeenCalled();
    });

    it('should call context management before streaming messages', async () => {
      const manageContextSpy = jest.spyOn(agent as any, 'manageContextWindow');
      
      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Test' } }] };
        }
      };

      (agent as any).grokClient.chatStream = jest.fn().mockReturnValue(mockStream);

      const generator = agent.processUserMessageStream('Test message');
      await generator.next(); // Start processing

      expect(manageContextSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle token counting errors gracefully', () => {
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => {
        throw new Error('Token counting failed');
      });

      // Should not throw error
      expect(() => {
        (agent as any).manageContextWindow();
      }).not.toThrow();
    });

    it('should handle turn grouping errors gracefully', () => {
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 2000);
      (agent as any).groupMessagesIntoTurns = jest.fn(() => {
        throw new Error('Turn grouping failed');
      });

      // Should not throw error
      expect(() => {
        (agent as any).manageContextWindow();
      }).not.toThrow();
    });

    it('should handle message rebuilding errors gracefully', () => {
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 2000);
      (agent as any).groupMessagesIntoTurns = jest.fn(() => []);
      (agent as any).rebuildMessagesFromTurns = jest.fn(() => {
        throw new Error('Rebuilding failed');
      });

      // Should not throw error  
      expect(() => {
        (agent as any).manageContextWindow();
      }).not.toThrow();
    });
  });
});