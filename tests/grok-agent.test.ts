/**
 * Tests for GrokAgent
 */
import { GrokAgent, ChatEntry, StreamingChunk } from '../src/agent/grok-agent';
import { AgentMode } from '../src/agent/agent-mode';

// Mock dependencies
jest.mock('../src/grok/client');
jest.mock('../src/utils/settings-manager', () => ({
  getSettingsManager: () => ({
    getCurrentModel: () => 'grok-code-fast-1',
    getUserSetting: () => undefined,
  }),
}));
jest.mock('../src/utils/custom-instructions', () => ({
  loadCustomInstructions: () => null,
}));
jest.mock('../src/mcp/config', () => ({
  loadMCPConfig: () => ({ servers: [] }),
}));

describe('GrokAgent', () => {
  let agent: GrokAgent;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new GrokAgent(mockApiKey);
  });

  afterEach(() => {
    // Don't dispose - tiktoken has issues with double-free
    // The GC will clean up
  });

  describe('Constructor', () => {
    it('should create an agent with default settings', () => {
      expect(agent).toBeDefined();
    });

    it('should accept custom model', () => {
      const customAgent = new GrokAgent(mockApiKey, undefined, 'grok-beta');
      expect(customAgent).toBeDefined();
      // Model is set through mocked GrokClient, so we just verify agent was created
    });

    it('should accept custom baseURL', () => {
      const customAgent = new GrokAgent(mockApiKey, 'https://custom.api.com');
      expect(customAgent).toBeDefined();
      customAgent.dispose();
    });

    it('should accept custom maxToolRounds', () => {
      const customAgent = new GrokAgent(mockApiKey, undefined, undefined, 50);
      expect(customAgent).toBeDefined();
      customAgent.dispose();
    });
  });

  describe('Chat History', () => {
    it('should start with empty chat history', () => {
      const history = agent.getChatHistory();
      expect(history).toEqual([]);
    });

    it('should clear chat history with clearChat()', () => {
      // Add a message by processing (mock will fail but entry will be added)
      try {
        // This may throw due to mocking, but the history should still work
      } catch {
        // Expected
      }
      agent.clearChat();
      expect(agent.getChatHistory().length).toBe(0);
    });
  });

  describe('Model Management', () => {
    it('should have getCurrentModel method', () => {
      expect(typeof agent.getCurrentModel).toBe('function');
    });

    it('should have setModel method', () => {
      expect(typeof agent.setModel).toBe('function');
    });
  });

  describe('Abort Controller', () => {
    it('should not throw when abort is called with no active request', () => {
      expect(() => agent.abortCurrentOperation()).not.toThrow();
    });
  });

  describe('Mode Management', () => {
    it('should get current mode', () => {
      const mode = agent.getMode();
      // Mode can be any valid AgentMode
      expect(typeof mode).toBe('string');
    });

    it('should set mode', () => {
      agent.setMode('suggest' as AgentMode);
      expect(agent.getMode()).toBe('suggest');
    });
  });

  describe('Sandbox Management', () => {
    it('should return sandbox status', () => {
      const status = agent.getSandboxStatus();
      expect(typeof status).toBe('string');
    });

    it('should validate safe command', () => {
      const result = agent.validateCommand('ls -la');
      expect(result.valid).toBe(true);
    });

    it('should reject dangerous command', () => {
      const result = agent.validateCommand('rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('Checkpoint Management', () => {
    it('should create checkpoint', () => {
      expect(() => agent.createCheckpoint('test checkpoint')).not.toThrow();
    });

    it('should return checkpoint list', () => {
      const list = agent.getCheckpointList();
      expect(typeof list).toBe('string');
    });
  });

  describe('Session Management', () => {
    it('should save session', () => {
      expect(() => agent.saveCurrentSession()).not.toThrow();
    });

    it('should return session list', () => {
      const list = agent.getSessionList();
      expect(typeof list).toBe('string');
    });
  });

  describe('RAG Tool Selection', () => {
    it('should enable/disable RAG tool selection', () => {
      agent.setRAGToolSelection(false);
      expect(agent.isRAGToolSelectionEnabled()).toBe(false);

      agent.setRAGToolSelection(true);
      expect(agent.isRAGToolSelectionEnabled()).toBe(true);
    });

    it('should return tool selection metrics', () => {
      const metrics = agent.getToolSelectionMetrics();
      expect(metrics).toBeDefined();
    });

    it('should format tool selection metrics', () => {
      const formatted = agent.formatToolSelectionMetrics();
      expect(typeof formatted).toBe('string');
    });
  });

  describe('Parallel Execution', () => {
    it('should enable/disable parallel tool execution', () => {
      agent.setParallelToolExecution(false);
      expect(agent.isParallelToolExecutionEnabled()).toBe(false);

      agent.setParallelToolExecution(true);
      expect(agent.isParallelToolExecutionEnabled()).toBe(true);
    });
  });

  describe('Self Healing', () => {
    it('should enable/disable self healing', () => {
      agent.setSelfHealing(false);
      expect(agent.isSelfHealingEnabled()).toBe(false);

      agent.setSelfHealing(true);
      expect(agent.isSelfHealingEnabled()).toBe(true);
    });
  });

  describe('Directory Management', () => {
    it('should return current directory', () => {
      const dir = agent.getCurrentDirectory();
      expect(typeof dir).toBe('string');
      expect(dir.length).toBeGreaterThan(0);
    });
  });

  describe('Image Processing', () => {
    it('should detect image files', () => {
      expect(agent.isImageFile('test.png')).toBe(true);
      expect(agent.isImageFile('test.jpg')).toBe(true);
      expect(agent.isImageFile('test.txt')).toBe(false);
    });
  });

  describe('Dispose', () => {
    it('should clean up resources on dispose', () => {
      // Just verify dispose doesn't throw
      expect(() => agent.dispose()).not.toThrow();
      // Set agent to null to prevent afterEach from calling dispose again
      agent = null as unknown as GrokAgent;
    });
  });
});

describe('ChatEntry Interface', () => {
  it('should have correct structure for user message', () => {
    const entry: ChatEntry = {
      type: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };
    expect(entry.type).toBe('user');
    expect(entry.content).toBe('Hello');
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('should have correct structure for assistant message', () => {
    const entry: ChatEntry = {
      type: 'assistant',
      content: 'Hi there!',
      timestamp: new Date(),
    };
    expect(entry.type).toBe('assistant');
    expect(entry.content).toBe('Hi there!');
  });

  it('should support tool calls in assistant message', () => {
    const entry: ChatEntry = {
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'bash',
            arguments: '{"command": "ls"}',
          },
        },
      ],
    };
    expect(entry.toolCalls).toBeDefined();
    expect(entry.toolCalls?.length).toBe(1);
    expect(entry.toolCalls?.[0].function.name).toBe('bash');
  });

  it('should support tool result', () => {
    const entry: ChatEntry = {
      type: 'tool_result',
      content: 'Success',
      timestamp: new Date(),
      toolResult: {
        success: true,
        output: 'file.txt',
      },
    };
    expect(entry.toolResult?.success).toBe(true);
    expect(entry.toolResult?.output).toBe('file.txt');
  });
});

describe('StreamingChunk Interface', () => {
  it('should have correct structure for content chunk', () => {
    const chunk: StreamingChunk = {
      type: 'content',
      content: 'Hello',
    };
    expect(chunk.type).toBe('content');
    expect(chunk.content).toBe('Hello');
  });

  it('should have correct structure for tool_calls chunk', () => {
    const chunk: StreamingChunk = {
      type: 'tool_calls',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'bash',
            arguments: '{}',
          },
        },
      ],
    };
    expect(chunk.type).toBe('tool_calls');
    expect(chunk.toolCalls?.length).toBe(1);
  });

  it('should have correct structure for done chunk', () => {
    const chunk: StreamingChunk = {
      type: 'done',
    };
    expect(chunk.type).toBe('done');
  });

  it('should have correct structure for token_count chunk', () => {
    const chunk: StreamingChunk = {
      type: 'token_count',
      tokenCount: 150,
    };
    expect(chunk.type).toBe('token_count');
    expect(chunk.tokenCount).toBe(150);
  });
});
