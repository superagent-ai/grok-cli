import { GrokAgent } from '../../src/agent/grok-agent';
import { PersistenceManager } from '../../src/utils/persistence-manager';
import { ConversationTurn } from '../../src/types';
import { createTempTestDir, cleanupTempDir } from '../setup';

// Mock dependencies
jest.mock('../../src/grok/client', () => ({
  GrokClient: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Response' } }]
    }),
    chatStream: jest.fn(),
    getCurrentModel: jest.fn(() => 'grok-4-latest'),
    setModel: jest.fn(),
  })),
}));

jest.mock('../../src/tools', () => ({
  TextEditorTool: jest.fn().mockImplementation(() => ({
    view: jest.fn().mockResolvedValue({ success: true, output: 'Mock file content' }),
    create: jest.fn().mockResolvedValue({ success: true }),
    strReplace: jest.fn().mockResolvedValue({ success: true }),
  })),
  BashTool: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, output: 'Mock output' }),
    getCurrentDirectory: jest.fn(() => '/test/dir'),
  })),
  TodoTool: jest.fn().mockImplementation(() => ({
    createTodoList: jest.fn().mockResolvedValue({ success: true }),
    updateTodoList: jest.fn().mockResolvedValue({ success: true }),
  })),
  ConfirmationTool: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/utils/custom-instructions', () => ({
  loadCustomInstructions: jest.fn(() => 'Performance test instructions'),
}));

describe('Performance Tests', () => {
  let agent: GrokAgent;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempTestDir('performance-tests');
    agent = new GrokAgent('test-api-key');
    
    // Configure for performance testing
    (agent as any).contextConfig = {
      maxTokens: 10000,
      bufferTokens: 1000,
      systemPromptTokens: 100,
      minRecentTurns: 2,
    };
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Context Window Management Performance', () => {
    it('should perform turn grouping efficiently with large conversation', () => {
      // Generate large conversation
      const messageCount = 1000;
      const messages = [
        { role: 'system', content: 'System prompt' }
      ];

      for (let i = 0; i < messageCount; i++) {
        messages.push(
          { role: 'user', content: `User message ${i}` },
          { role: 'assistant', content: `Assistant response ${i}` }
        );
      }

      (agent as any).messages = messages;

      const startTime = performance.now();
      const turns = (agent as any).groupMessagesIntoTurns();
      const endTime = performance.now();

      expect(turns).toHaveLength(messageCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete under 1 second
    });

    it('should handle token calculation efficiently for complex turns', () => {
      const complexTurn: ConversationTurn = {
        id: 'complex-turn',
        userMessage: { 
          role: 'user', 
          content: 'A very long user message that contains multiple sentences and detailed explanations about what they want the AI to do. This message is intentionally verbose to simulate real-world usage where users provide extensive context and requirements.'
        },
        agentWorkSession: Array.from({ length: 50 }, (_, i) => ({
          type: 'assistant_message' as const,
          message: { 
            role: 'assistant', 
            content: `This is assistant message ${i} with substantial content that would realistically be generated in a complex conversation involving multiple tool calls and detailed responses.`
          },
          timestamp: new Date()
        })),
        isComplete: true,
        tokenCount: 0,
        timestamp: new Date()
      };

      const startTime = performance.now();
      const tokenCount = (agent as any).calculateTurnTokens(complexTurn);
      const endTime = performance.now();

      expect(tokenCount).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });

    it('should prune context efficiently when over limit', () => {
      // Create many turns to exceed context limit
      const turnCount = 100;
      const mockTurns: ConversationTurn[] = Array.from({ length: turnCount }, (_, i) => ({
        id: `turn-${i}`,
        userMessage: { role: 'user', content: `Message ${i}` },
        agentWorkSession: [{
          type: 'assistant_message',
          message: { role: 'assistant', content: `Response ${i}` },
          timestamp: new Date()
        }],
        isComplete: true,
        tokenCount: 100 + i, // Increasing token counts
        timestamp: new Date()
      }));

      // Mock methods for performance test
      (agent as any).tokenCounter.countMessageTokens = jest.fn(() => 15000); // Over limit
      (agent as any).groupMessagesIntoTurns = jest.fn(() => mockTurns);
      (agent as any).calculateActiveFileContextTokens = jest.fn(() => 500);
      (agent as any).rebuildMessagesFromTurns = jest.fn();

      const startTime = performance.now();
      (agent as any).manageContextWindow();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(500); // Should complete quickly
      expect((agent as any).rebuildMessagesFromTurns).toHaveBeenCalled();
    });

    it('should handle file content extraction efficiently', () => {
      const turnWithManyFiles: ConversationTurn = {
        id: 'file-turn',
        userMessage: { role: 'user', content: 'Process multiple files' },
        agentWorkSession: Array.from({ length: 20 }, (_, i) => ({
          type: 'tool_result' as const,
          message: {
            role: 'tool',
            content: `File ${i} content `.repeat(100), // Simulate large file content
            tool_call_id: `call_${i}`
          },
          timestamp: new Date()
        })),
        isComplete: true,
        tokenCount: 2000,
        timestamp: new Date(),
        activeFiles: Array.from({ length: 20 }, (_, i) => `file${i}.js`)
      };

      const startTime = performance.now();
      const tokens = (agent as any).calculateActiveFileContextTokens([turnWithManyFiles]);
      const endTime = performance.now();

      expect(typeof tokens).toBe('number');
      expect(endTime - startTime).toBeLessThan(200); // Should handle many files quickly
    });
  });

  describe('Persistence Performance', () => {
    let persistenceManager: PersistenceManager;

    beforeEach(async () => {
      persistenceManager = new PersistenceManager({
        baseDir: tempDir,
        enabled: true,
        backupCount: 3
      });
      await persistenceManager.initialize();
    });

    it('should handle large data saves efficiently', async () => {
      const largeData = {
        conversations: Array.from({ length: 1000 }, (_, i) => ({
          id: `conv-${i}`,
          messages: Array.from({ length: 50 }, (_, j) => ({
            id: `msg-${j}`,
            content: `Message content ${j} `.repeat(10),
            timestamp: new Date().toISOString()
          }))
        }))
      };

      const startTime = performance.now();
      const saved = await persistenceManager.save('large-data.json', largeData);
      const endTime = performance.now();

      expect(saved).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should save large data reasonably quickly
    });

    it('should handle concurrent saves efficiently', async () => {
      const concurrentSaveCount = 50;
      const saveData = { id: Math.random(), data: 'test'.repeat(100) };

      const startTime = performance.now();
      
      const savePromises = Array.from({ length: concurrentSaveCount }, (_, i) =>
        persistenceManager.save(`concurrent-${i}.json`, { ...saveData, id: i })
      );

      const results = await Promise.all(savePromises);
      const endTime = performance.now();

      expect(results.every(result => result === true)).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000); // Should handle concurrent saves efficiently
    });

    it('should handle large file loads efficiently', async () => {
      const largeData = {
        items: Array.from({ length: 5000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: `Description for item ${i} `.repeat(20),
          metadata: {
            created: new Date().toISOString(),
            tags: [`tag-${i % 10}`, `category-${i % 5}`],
            properties: Object.fromEntries(
              Array.from({ length: 10 }, (_, j) => [`prop${j}`, `value${j}`])
            )
          }
        }))
      };

      // First save the large data
      await persistenceManager.save('large-load-test.json', largeData);

      const startTime = performance.now();
      const loaded = await persistenceManager.load('large-load-test.json');
      const endTime = performance.now();

      expect(loaded).toBeDefined();
      expect((loaded as any).items).toHaveLength(5000);
      expect(endTime - startTime).toBeLessThan(1000); // Should load large data quickly
    });

    it('should handle backup creation efficiently', async () => {
      const testData = { version: 1, data: 'initial' };
      
      // Initial save
      await persistenceManager.save('backup-test.json', testData);

      const updateCount = 20;
      const startTime = performance.now();

      // Multiple updates to trigger backup creation
      for (let i = 2; i <= updateCount; i++) {
        await persistenceManager.save('backup-test.json', { version: i, data: `update ${i}` });
      }

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should handle backup creation efficiently
      
      const finalData = await persistenceManager.load('backup-test.json');
      expect((finalData as any).version).toBe(updateCount);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated context management', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        // Simulate context management operations
        const mockTurns: ConversationTurn[] = Array.from({ length: 10 }, (_, j) => ({
          id: `turn-${i}-${j}`,
          userMessage: { role: 'user', content: `Message ${j}` },
          agentWorkSession: [{
            type: 'assistant_message',
            message: { role: 'assistant', content: `Response ${j}` },
            timestamp: new Date()
          }],
          isComplete: true,
          tokenCount: 50,
          timestamp: new Date()
        }));

        (agent as any).conversationTurns = mockTurns;
        (agent as any).rebuildMessagesFromTurns(mockTurns.slice(-3)); // Keep recent turns

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle large turn arrays without excessive memory usage', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create very large turn array
      const largeTurnArray: ConversationTurn[] = Array.from({ length: 10000 }, (_, i) => ({
        id: `large-turn-${i}`,
        userMessage: { role: 'user', content: `Large message ${i} with substantial content` },
        agentWorkSession: Array.from({ length: 5 }, (_, j) => ({
          type: 'assistant_message' as const,
          message: { role: 'assistant', content: `Work item ${j}` },
          timestamp: new Date()
        })),
        isComplete: true,
        tokenCount: 100 + (i % 50),
        timestamp: new Date()
      }));

      // Simulate operations on large array
      const filtered = largeTurnArray.filter(turn => turn.tokenCount > 120);
      const mapped = filtered.map(turn => ({ ...turn, processed: true }));
      const reduced = mapped.reduce((sum, turn) => sum + turn.tokenCount, 0);

      expect(filtered.length).toBeGreaterThan(0);
      expect(mapped.length).toBe(filtered.length);
      expect(reduced).toBeGreaterThan(0);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Should handle large arrays without excessive memory usage
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Scalability', () => {
    it('should scale context window management linearly with conversation size', () => {
      const testSizes = [10, 50, 100, 200, 500];
      const timings: number[] = [];

      for (const size of testSizes) {
        const messages = Array.from({ length: size * 2 + 1 }, (_, i) => {
          if (i === 0) return { role: 'system', content: 'System' };
          return i % 2 === 1
            ? { role: 'user', content: `User ${Math.floor(i / 2)}` }
            : { role: 'assistant', content: `Assistant ${Math.floor(i / 2)}` };
        });

        (agent as any).messages = messages;

        const startTime = performance.now();
        const turns = (agent as any).groupMessagesIntoTurns();
        const endTime = performance.now();

        expect(turns).toHaveLength(size);
        timings.push(endTime - startTime);
      }

      // Check that timing growth is reasonable (not exponential)
      for (let i = 1; i < timings.length; i++) {
        const ratio = timings[i] / timings[i - 1];
        const sizeRatio = testSizes[i] / testSizes[i - 1];
        
        // Timing ratio should not be much larger than size ratio
        expect(ratio).toBeLessThan(sizeRatio * 2);
      }
    });

    it('should handle increasing context window limits efficiently', () => {
      const contextLimits = [1000, 5000, 10000, 25000, 50000];
      const timings: number[] = [];

      for (const limit of contextLimits) {
        (agent as any).contextConfig.maxTokens = limit;
        (agent as any).contextConfig.bufferTokens = limit * 0.1;

        // Create conversation that would exceed all limits
        const mockTurns = Array.from({ length: 200 }, (_, i) => ({
          id: `scale-turn-${i}`,
          userMessage: { role: 'user', content: `Message ${i}` },
          agentWorkSession: [],
          isComplete: true,
          tokenCount: 100,
          timestamp: new Date()
        }));

        (agent as any).tokenCounter.countMessageTokens = jest.fn(() => limit + 1000);
        (agent as any).groupMessagesIntoTurns = jest.fn(() => mockTurns);
        (agent as any).calculateActiveFileContextTokens = jest.fn(() => 0);
        (agent as any).rebuildMessagesFromTurns = jest.fn();

        const startTime = performance.now();
        (agent as any).manageContextWindow();
        const endTime = performance.now();

        timings.push(endTime - startTime);
      }

      // All operations should complete quickly regardless of context limit
      for (const timing of timings) {
        expect(timing).toBeLessThan(500);
      }
    });
  });
});