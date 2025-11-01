import { OrchestrationDatabase } from '../../src/storage/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

/**
 * Test suite for OrchestrationDatabase
 *
 * Tests the SQLite database system including:
 * - Database initialization
 * - Table creation
 * - CRUD operations for conversations, documents, prompts, agents
 * - Statistics
 */

describe('OrchestrationDatabase', () => {
  let db: OrchestrationDatabase;
  const testDbPath = path.join(homedir(), '.supergrok', 'test-orchestration.db');

  beforeEach(async () => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new OrchestrationDatabase(testDbPath);
    await db.initialize();
  });

  afterEach(() => {
    db.close();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    it('should initialize database and create tables', async () => {
      const stats = db.getStats();

      expect(stats.conversations).toBe(0);
      expect(stats.documents).toBe(0);
      expect(stats.prompts).toBe(0);
      expect(stats.agents).toBe(0);
    });

    it('should create database file', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should return database path', () => {
      expect(db.getDatabasePath()).toBe(testDbPath);
    });
  });

  describe('Conversations', () => {
    it('should save conversation', () => {
      const conversation = {
        task_id: 'task-1',
        type: 'decomposition' as const,
        messages: JSON.stringify([{ role: 'user', content: 'Test' }]),
        model: 'grok-3-fast',
        tokens: 100,
        cost: 0.008,
      };

      const id = db.saveConversation(conversation);
      expect(id).toBeGreaterThan(0);
    });

    it('should retrieve conversations by task ID', () => {
      const conversation = {
        task_id: 'task-1',
        type: 'decomposition' as const,
        messages: JSON.stringify([{ role: 'user', content: 'Test' }]),
        model: 'grok-3-fast',
        tokens: 100,
        cost: 0.008,
      };

      db.saveConversation(conversation);

      const conversations = db.getConversations('task-1');
      expect(conversations).toHaveLength(1);
      expect(conversations[0].task_id).toBe('task-1');
      expect(conversations[0].type).toBe('decomposition');
    });
  });

  describe('Documents', () => {
    it('should save document', () => {
      const document = {
        task_id: 'task-1',
        title: 'Test Document',
        content: 'Document content',
        format: 'markdown' as const,
      };

      const id = db.saveDocument(document);
      expect(id).toBeGreaterThan(0);
    });

    it('should retrieve documents by task ID', () => {
      const document = {
        task_id: 'task-1',
        title: 'Test Document',
        content: 'Document content',
        format: 'markdown' as const,
      };

      db.saveDocument(document);

      const documents = db.getDocuments('task-1');
      expect(documents).toHaveLength(1);
      expect(documents[0].title).toBe('Test Document');
    });

    it('should retrieve all documents', () => {
      db.saveDocument({
        task_id: 'task-1',
        title: 'Doc 1',
        content: 'Content 1',
        format: 'markdown' as const,
      });

      db.saveDocument({
        task_id: 'task-2',
        title: 'Doc 2',
        content: 'Content 2',
        format: 'text' as const,
      });

      const documents = db.getAllDocuments(10);
      expect(documents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Prompts', () => {
    it('should save prompt template', () => {
      const prompt = {
        name: 'test-prompt',
        template: 'This is a {{variable}} template',
        variables: JSON.stringify(['variable']),
        description: 'Test prompt',
      };

      const id = db.savePrompt(prompt);
      expect(id).toBeGreaterThan(0);
    });

    it('should retrieve prompt by name', () => {
      const prompt = {
        name: 'test-prompt',
        template: 'This is a {{variable}} template',
        variables: JSON.stringify(['variable']),
        description: 'Test prompt',
      };

      db.savePrompt(prompt);

      const retrieved = db.getPrompt('test-prompt');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('test-prompt');
      expect(retrieved!.template).toContain('{{variable}}');
    });

    it('should update existing prompt on conflict', () => {
      const prompt1 = {
        name: 'test-prompt',
        template: 'Original template',
        variables: JSON.stringify([]),
      };

      const prompt2 = {
        name: 'test-prompt',
        template: 'Updated template',
        variables: JSON.stringify([]),
      };

      db.savePrompt(prompt1);
      db.savePrompt(prompt2);

      const retrieved = db.getPrompt('test-prompt');
      expect(retrieved!.template).toBe('Updated template');
    });

    it('should list all prompts', () => {
      db.savePrompt({
        name: 'prompt-1',
        template: 'Template 1',
        variables: JSON.stringify([]),
      });

      db.savePrompt({
        name: 'prompt-2',
        template: 'Template 2',
        variables: JSON.stringify([]),
      });

      const prompts = db.getAllPrompts();
      expect(prompts.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete prompt', () => {
      const prompt = {
        name: 'test-prompt',
        template: 'Template',
        variables: JSON.stringify([]),
      };

      db.savePrompt(prompt);
      db.deletePrompt('test-prompt');

      const retrieved = db.getPrompt('test-prompt');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Agents', () => {
    it('should save agent', () => {
      const agent = {
        task_id: 'task-1',
        agent_type: 'super' as const,
        status: 'pending' as const,
      };

      const id = db.saveAgent(agent);
      expect(id).toBeGreaterThan(0);
    });

    it('should update agent status', () => {
      const agent = {
        task_id: 'task-1',
        agent_type: 'sub' as const,
        status: 'pending' as const,
      };

      const id = db.saveAgent(agent);

      db.updateAgentStatus(id, 'completed', 'Success result');

      const agents = db.getAgents('task-1');
      expect(agents[0].status).toBe('completed');
      expect(agents[0].result).toBe('Success result');
    });

    it('should retrieve agents by task ID', () => {
      db.saveAgent({
        task_id: 'task-1',
        agent_type: 'super' as const,
        status: 'running' as const,
      });

      const agents = db.getAgents('task-1');
      expect(agents).toHaveLength(1);
      expect(agents[0].agent_type).toBe('super');
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', () => {
      // Add test data
      db.saveConversation({
        task_id: 'task-1',
        type: 'decomposition' as const,
        messages: JSON.stringify([]),
        model: 'grok-4',
        tokens: 100,
        cost: 0.01,
      });

      db.saveDocument({
        task_id: 'task-1',
        title: 'Doc',
        content: 'Content',
        format: 'markdown' as const,
      });

      db.savePrompt({
        name: 'prompt',
        template: 'Template',
        variables: JSON.stringify([]),
      });

      db.saveAgent({
        task_id: 'task-1',
        agent_type: 'super' as const,
        status: 'pending' as const,
      });

      const stats = db.getStats();

      expect(stats.conversations).toBe(1);
      expect(stats.documents).toBe(1);
      expect(stats.prompts).toBe(1);
      expect(stats.agents).toBe(1);
    });
  });
});
