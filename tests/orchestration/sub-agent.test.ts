import { SubAgent } from '../../src/orchestration/sub-agent.js';
import { AccountManager } from '../../src/orchestration/account-manager.js';

/**
 * Test suite for SubAgent
 *
 * Tests the sub-agent system including:
 * - Task execution
 * - Model selection based on complexity
 * - Token and cost tracking
 * - Error handling
 */

describe('SubAgent', () => {
  const testAccounts = [
    { apiKey: 'test-key-1', name: 'account-1' },
  ];

  let accountManager: AccountManager;
  let subAgent: SubAgent;

  beforeEach(() => {
    accountManager = new AccountManager(testAccounts);
    subAgent = new SubAgent(accountManager);
  });

  describe('Model Selection', () => {
    it('should select grok-code-fast-1 for simple tasks', async () => {
      const task = {
        id: 'task-1',
        description: 'Simple task',
        complexity: 'simple' as const,
      };

      // Mock the client to avoid actual API calls
      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Result' } }],
        }),
      };

      const getClientSpy = jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      await subAgent.executeTask(task);

      expect(getClientSpy).toHaveBeenCalledWith('grok-code-fast-1');
    });

    it('should select grok-3-fast for medium complexity tasks', async () => {
      const task = {
        id: 'task-2',
        description: 'Medium task',
        complexity: 'medium' as const,
      };

      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Result' } }],
        }),
      };

      const getClientSpy = jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      await subAgent.executeTask(task);

      expect(getClientSpy).toHaveBeenCalledWith('grok-3-fast');
    });

    it('should select grok-4 for complex tasks', async () => {
      const task = {
        id: 'task-3',
        description: 'Complex task',
        complexity: 'complex' as const,
      };

      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Result' } }],
        }),
      };

      const getClientSpy = jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      await subAgent.executeTask(task);

      expect(getClientSpy).toHaveBeenCalledWith('grok-4');
    });
  });

  describe('Task Execution', () => {
    it('should execute a task and return result', async () => {
      const task = {
        id: 'task-1',
        description: 'Test task',
        complexity: 'simple' as const,
      };

      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test result' } }],
        }),
      };

      jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      const result = await subAgent.executeTask(task);

      expect(result.taskId).toBe('task-1');
      expect(result.result).toBe('Test result');
      expect(result.error).toBeUndefined();
    });

    it('should include task context in prompt', async () => {
      const task = {
        id: 'task-1',
        description: 'Test task',
        complexity: 'simple' as const,
        context: 'Additional context',
      };

      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Result' } }],
        }),
      };

      jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      await subAgent.executeTask(task);

      const chatCall = mockClient.chat.mock.calls[0];
      const userMessage = chatCall[0][1].content;

      expect(userMessage).toContain('Additional context');
    });
  });

  describe('Usage Tracking', () => {
    it('should track tokens and cost', async () => {
      const task = {
        id: 'task-1',
        description: 'Test task',
        complexity: 'simple' as const,
      };

      const mockClient = {
        chat: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Result' } }],
        }),
      };

      const recordUsageSpy = jest.spyOn(accountManager, 'recordUsage');

      jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      const result = await subAgent.executeTask(task);

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.cost).toBeGreaterThan(0);
      expect(recordUsageSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const task = {
        id: 'task-1',
        description: 'Test task',
        complexity: 'simple' as const,
      };

      const mockClient = {
        chat: jest.fn().mockRejectedValue(new Error('API Error')),
      };

      jest.spyOn(accountManager, 'getClient').mockReturnValue({
        client: mockClient as any,
        accountName: 'account-1',
      });

      const result = await subAgent.executeTask(task);

      expect(result.error).toBe('API Error');
      expect(result.tokens).toBe(0);
      expect(result.cost).toBe(0);
    });
  });

  describe('Complexity Analysis', () => {
    it('should analyze complexity as complex for design tasks', () => {
      const complexity = SubAgent.analyzeComplexity('Design a new architecture');
      expect(complexity).toBe('complex');
    });

    it('should analyze complexity as simple for typo fixes', () => {
      const complexity = SubAgent.analyzeComplexity('Fix typo in README');
      expect(complexity).toBe('simple');
    });

    it('should default to medium complexity', () => {
      const complexity = SubAgent.analyzeComplexity('Implement the feature');
      expect(complexity).toBe('medium');
    });
  });
});
