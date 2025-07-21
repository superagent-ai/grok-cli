import { GrokAgent } from '../../src/agent/grok-agent';
import { TodoTool } from '../../src/tools/todo-tool';
import { BashTool } from '../../src/tools/bash';
import { getPersistenceManager } from '../../src/utils/persistence-manager';
import { getUserSettingsManager } from '../../src/utils/user-settings';
import { createTempTestDir, cleanupTempDir } from '../setup';
import * as path from 'path';

// Mock Grok client to avoid real API calls
jest.mock('../../src/grok/client', () => ({
  GrokClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue({
      choices: [{
        message: {
          role: 'assistant',
          content: 'Mock response',
          tool_calls: []
        }
      }]
    }),
    chatStream: jest.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'Mock ' } }] };
        yield { choices: [{ delta: { content: 'streaming ' } }] };
        yield { choices: [{ delta: { content: 'response' } }] };
      }
    }),
    getCurrentModel: jest.fn(() => 'grok-4-latest'),
    setModel: jest.fn(),
  })),
}));

jest.mock('../../src/utils/custom-instructions', () => ({
  loadCustomInstructions: jest.fn(() => 'Integration test instructions'),
}));

// Mock process.chdir to avoid actually changing directories
const originalChdir = process.chdir;
const mockChdir = jest.fn();

describe('Context Management Integration Tests', () => {
  let agent: GrokAgent;
  let tempDir: string;
  let persistenceManager: ReturnType<typeof getPersistenceManager>;
  let userSettingsManager: ReturnType<typeof getUserSettingsManager>;

  beforeEach(async () => {
    tempDir = await createTempTestDir('integration-tests');
    
    // Initialize persistence with temp directory
    persistenceManager = getPersistenceManager({
      baseDir: path.join(tempDir, '.grok'),
      enabled: true,
      backupCount: 3
    });

    userSettingsManager = getUserSettingsManager();
    await userSettingsManager.initialize();

    // Mock chdir
    process.chdir = mockChdir;

    agent = new GrokAgent('test-api-key');
  });

  afterEach(async () => {
    process.chdir = originalChdir;
    await cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('End-to-End Context Management', () => {
    it('should manage context through multiple conversation turns', async () => {
      // Configure small context window for testing
      (agent as any).contextConfig = {
        maxTokens: 2000,
        bufferTokens: 500,
        systemPromptTokens: 200,
        minRecentTurns: 2,
      };

      // Simulate a longer conversation that should trigger context management
      const conversations = [
        'Hello, how are you?',
        'Tell me about JavaScript',
        'What is React?',
        'Explain async/await',
        'Show me a code example',
      ];

      const responses: any[] = [];

      for (const message of conversations) {
        const response = await agent.processUserMessage(message);
        responses.push(response);

        // Verify response structure
        expect(response).toBeDefined();
        expect(Array.isArray(response)).toBe(true);
        expect(response.length).toBeGreaterThan(0);
      }

      // Context should have been managed at some point
      const currentMessages = (agent as any).messages;
      expect(currentMessages.length).toBeGreaterThan(1); // At least system + recent
      
      // Should still have system message
      expect(currentMessages[0].role).toBe('system');
    });

    it('should handle streaming conversation with context management', async () => {
      // Configure for context management
      (agent as any).contextConfig.maxTokens = 1500;
      (agent as any).contextConfig.bufferTokens = 300;

      const conversations = [
        'First message that is somewhat long to consume tokens',
        'Second message asking about programming concepts',
        'Third message requesting code examples and explanations',
      ];

      for (const message of conversations) {
        const generator = agent.processUserMessageStream(message);
        const chunks: any[] = [];

        for await (const chunk of generator) {
          chunks.push(chunk);
          
          if (chunk.type === 'done') {
            break;
          }
        }

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[chunks.length - 1].type).toBe('done');
      }

      // Context should be managed appropriately
      const currentMessages = (agent as any).messages;
      expect(currentMessages[0].role).toBe('system');
    });
  });

  describe('Tool Integration with Context Management', () => {
    it('should persist todo list across context pruning', async () => {
      const todoTool = new TodoTool();
      
      // Create initial todo list
      const initialTodos = [
        {
          id: 'todo-1',
          content: 'Implement feature A',
          status: 'pending' as const,
          priority: 'high' as const
        },
        {
          id: 'todo-2', 
          content: 'Review code B',
          status: 'in_progress' as const,
          priority: 'medium' as const
        }
      ];

      const createResult = await todoTool.createTodoList(initialTodos);
      expect(createResult.success).toBe(true);

      // Simulate context pruning by creating a new TodoTool instance
      const newTodoTool = new TodoTool();
      
      // Give it time to load from persistence
      await new Promise(resolve => setTimeout(resolve, 100));

      const viewResult = await newTodoTool.viewTodoList();
      expect(viewResult.success).toBe(true);
      expect(viewResult.output).toContain('Implement feature A');
      expect(viewResult.output).toContain('Review code B');
    });

    it.skip('should persist bash working directory across sessions', async () => {
      const bashTool = new BashTool();
      const testDir = '/tmp/test-directory';
      
      mockChdir.mockImplementation(() => {
        process.cwd = jest.fn(() => testDir);
      });

      // Change directory
      const cdResult = await bashTool.execute(`cd ${testDir}`);
      expect(cdResult.success).toBe(true);

      // Create new BashTool instance (simulating new session)
      const newBashTool = new BashTool();
      
      // Give it time to load from persistence
      await new Promise(resolve => setTimeout(resolve, 500));

      const currentDir = newBashTool.getCurrentDirectory();
      expect(currentDir).toBe(testDir);
    });
  });

  describe('User Settings Integration', () => {
    it('should respect user settings for context management', async () => {
      // Configure user settings
      await userSettingsManager.setContextSettings({
        maxTokens: 1000,
        bufferTokens: 200,
        minRecentTurns: 1,
        enablePersistence: true
      });

      // Create new agent to pick up settings
      const configuredAgent = new GrokAgent('test-api-key');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that settings are applied
      const contextConfig = (configuredAgent as any).contextConfig;
      expect(contextConfig.maxTokens).toBe(1000);
      expect(contextConfig.bufferTokens).toBe(200);
      expect(contextConfig.minRecentTurns).toBe(1);
    });

    it('should persist confirmation preferences', async () => {
      // Set confirmation preferences
      await userSettingsManager.setConfirmationPreferences({
        fileOperations: 'always',
        bashCommands: 'never',
        allOperations: 'ask',
        rememberSessionChoices: true
      });

      // Verify preferences are persisted
      const preferences = userSettingsManager.getConfirmationPreferences();
      expect(preferences.fileOperations).toBe('always');
      expect(preferences.bashCommands).toBe('never');
      expect(preferences.allOperations).toBe('ask');
      expect(preferences.rememberSessionChoices).toBe(true);

      // Create new settings manager instance (simulating app restart)
      const newSettingsManager = getUserSettingsManager();
      await newSettingsManager.initialize();

      const reloadedPreferences = newSettingsManager.getConfirmationPreferences();
      expect(reloadedPreferences).toEqual(preferences);
    });
  });

  describe('File Context Management', () => {
    it('should track and prioritize active files in context window', async () => {
      // Configure small context window
      (agent as any).contextConfig.maxTokens = 3000;
      (agent as any).contextConfig.bufferTokens = 500;

      // Mock file operations to track active files
      const fileContents = {
        'file1.js': 'console.log("File 1 content with lots of text to consume tokens");',
        'file2.js': 'console.log("File 2 content with different implementation details");',
        'file3.js': 'console.log("File 3 content with additional functionality");'
      };

      // Mock text editor tool to return file contents
      (agent as any).textEditor.view = jest.fn().mockImplementation(async (path: string) => ({
        success: true,
        output: fileContents[path as keyof typeof fileContents] || 'File not found'
      }));

      // Simulate file operations that should be tracked
      const mockToolCall = {
        id: 'call_1',
        function: {
          name: 'view_file',
          arguments: JSON.stringify({ path: 'file1.js' })
        }
      };

      // Build messages that include file operations
      (agent as any).messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Show me file1.js' },
        { 
          role: 'assistant', 
          content: 'I\'ll show you the file',
          tool_calls: [mockToolCall]
        },
        { 
          role: 'tool',
          content: fileContents['file1.js'],
          tool_call_id: 'call_1'
        },
        { role: 'assistant', content: 'Here\'s the file content...' },
      ];

      // Force context management
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 4000); // Over limit
      
      const groupMessagesIntoTurnsSpy = jest.spyOn(agent as any, 'groupMessagesIntoTurns');
      const calculateActiveFileTokensSpy = jest.spyOn(agent as any, 'calculateActiveFileContextTokens');

      (agent as any).manageContextWindow();

      expect(groupMessagesIntoTurnsSpy).toHaveBeenCalled();
      expect(calculateActiveFileTokensSpy).toHaveBeenCalled();
    });

    it('should remove superseded file views from context', async () => {
      // Create conversation where same file is viewed then edited
      const messages = [
        { role: 'system', content: 'System prompt' },
        // First view
        { role: 'user', content: 'Show me test.js' },
        { 
          role: 'assistant',
          tool_calls: [{ 
            id: 'call_1',
            function: { name: 'view_file', arguments: '{"path": "test.js"}' }
          }]
        },
        { role: 'tool', content: 'original content', tool_call_id: 'call_1' },
        { role: 'assistant', content: 'Here\'s the original file' },
        // Then edit
        { role: 'user', content: 'Edit line 1' },
        {
          role: 'assistant',
          tool_calls: [{
            id: 'call_2',
            function: { name: 'str_replace_editor', arguments: '{"path": "test.js"}' }
          }]
        },
        { role: 'tool', content: 'edited content', tool_call_id: 'call_2' },
        { role: 'assistant', content: 'File updated successfully' },
      ];

      (agent as any).messages = messages;

      const turns = (agent as any).groupMessagesIntoTurns();
      
      // Should have active file tracked in both turns
      expect(turns[0].activeFiles).toContain('test.js');
      expect(turns[1].activeFiles).toContain('test.js');

      // When getting latest file content, should return the edited version
      const latestContent = (agent as any).getLatestFileContent('test.js', turns);
      expect(latestContent).toBe('edited content');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle persistence failures gracefully', async () => {
      // Mock persistence manager to fail
      const mockPersistenceManager = {
        initialize: jest.fn().mockRejectedValue(new Error('Persistence failed')),
        save: jest.fn().mockResolvedValue(false),
        load: jest.fn().mockResolvedValue(null),
        isEnabled: jest.fn().mockReturnValue(false)
      };

      // Create tools that depend on persistence
      const todoTool = new TodoTool();
      (todoTool as any).persistenceManager = mockPersistenceManager;

      // Should still work without persistence
      const result = await todoTool.createTodoList([{
        id: 'test-1',
        content: 'Test todo',
        status: 'pending',
        priority: 'medium'
      }]);

      expect(result.success).toBe(true);
    });

    it('should recover from context management errors', async () => {
      // Mock token counter to throw error
      (agent as any).tokenCounter.countMessageTokens = jest.fn()
        .mockImplementationOnce(() => { throw new Error('Token counting failed'); })
        .mockReturnValue(100);

      // Should not crash on context management error
      expect(() => {
        (agent as any).manageContextWindow();
      }).not.toThrow();

      // Should continue working normally
      const response = await agent.processUserMessage('Test message after error');
      expect(response).toBeDefined();
      expect(Array.isArray(response)).toBe(true);
    });

    it('should handle corrupted persistence files', async () => {
      const persistenceManager = getPersistenceManager();
      await persistenceManager.initialize();

      // Create corrupted file
      const corruptedFile = persistenceManager.getFilePath('corrupted.json');
      await require('fs-extra').writeFile(corruptedFile, '{invalid json');

      // Should return default value and not crash
      const loaded = await persistenceManager.load('corrupted.json', { default: 'value' });
      expect(loaded).toEqual({ default: 'value' });
    });
  });

  describe('Performance Under Load', () => {
    it('should handle rapid message processing efficiently', async () => {
      const startTime = Date.now();
      const messageCount = 20;
      const responses: any[] = [];

      // Process many messages rapidly
      const promises = Array.from({ length: messageCount }, (_, i) => 
        agent.processUserMessage(`Message number ${i + 1}`)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(messageCount);
      expect(results.every(result => Array.isArray(result) && result.length > 0)).toBe(true);

      // Should complete in reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should manage memory usage with large context windows', async () => {
      // Configure larger but still manageable context
      (agent as any).contextConfig.maxTokens = 50000;
      (agent as any).contextConfig.bufferTokens = 5000;

      // Generate large conversation
      for (let i = 0; i < 100; i++) {
        await agent.processUserMessage(`This is message number ${i} with some additional content to make it longer and consume more tokens in the context window`);
        
        // Verify messages array doesn't grow unboundedly
        const messageCount = (agent as any).messages.length;
        expect(messageCount).toBeLessThan(500); // Reasonable upper bound
      }

      // Should still be responsive
      const finalResponse = await agent.processUserMessage('Final test message');
      expect(finalResponse).toBeDefined();
    });
  });
});