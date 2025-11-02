import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

// We'll use dynamic import for better-sqlite3 to handle it gracefully
type Database = any;
type Statement = any;

export interface Conversation {
  id?: number;
  task_id: string;
  type: 'decomposition' | 'subtask' | 'aggregation';
  messages: string; // JSON stringified
  model: string;
  tokens: number;
  cost: number;
  created_at?: string;
}

export interface Document {
  id?: number;
  task_id: string;
  title: string;
  content: string;
  format: 'markdown' | 'text' | 'json';
  created_at?: string;
}

export interface Prompt {
  id?: number;
  name: string;
  template: string;
  variables: string; // JSON stringified
  description?: string;
  created_at?: string;
}

export interface Agent {
  id?: number;
  task_id: string;
  agent_type: 'super' | 'sub';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  created_at?: string;
  completed_at?: string;
}

export class OrchestrationDatabase {
  private db: Database | null = null;
  private dbPath: string;
  private isInitialized: boolean = false;

  constructor(dbPath?: string) {
    const supergrokDir = path.join(homedir(), '.supergrok');

    // Ensure directory exists
    if (!fs.existsSync(supergrokDir)) {
      fs.mkdirSync(supergrokDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(supergrokDir, 'orchestration.db');
  }

  /**
   * Initialize database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import of better-sqlite3
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.createTables();

      this.isInitialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;

    // Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        messages TEXT NOT NULL,
        model TEXT NOT NULL,
        tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        format TEXT DEFAULT 'markdown',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prompts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        template TEXT NOT NULL,
        variables TEXT DEFAULT '[]',
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_task_id ON conversations(task_id);
      CREATE INDEX IF NOT EXISTS idx_documents_task_id ON documents(task_id);
      CREATE INDEX IF NOT EXISTS idx_agents_task_id ON agents(task_id);
    `);
  }

  /**
   * Save conversation
   */
  saveConversation(conversation: Conversation): number {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO conversations (task_id, type, messages, model, tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      conversation.task_id,
      conversation.type,
      conversation.messages,
      conversation.model,
      conversation.tokens,
      conversation.cost
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get conversations by task ID
   */
  getConversations(taskId: string): Conversation[] {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM conversations WHERE task_id = ? ORDER BY created_at DESC
    `);

    return stmt.all(taskId) as Conversation[];
  }

  /**
   * Save document
   */
  saveDocument(document: Document): number {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO documents (task_id, title, content, format)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      document.task_id,
      document.title,
      document.content,
      document.format
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get documents by task ID
   */
  getDocuments(taskId: string): Document[] {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM documents WHERE task_id = ? ORDER BY created_at DESC
    `);

    return stmt.all(taskId) as Document[];
  }

  /**
   * Get all documents
   */
  getAllDocuments(limit: number = 50): Document[] {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM documents ORDER BY created_at DESC LIMIT ?
    `);

    return stmt.all(limit) as Document[];
  }

  /**
   * Save prompt template
   */
  savePrompt(prompt: Prompt): number {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO prompts (name, template, variables, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        template = excluded.template,
        variables = excluded.variables,
        description = excluded.description
    `);

    const result = stmt.run(
      prompt.name,
      prompt.template,
      prompt.variables,
      prompt.description || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get prompt by name
   */
  getPrompt(name: string): Prompt | undefined {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM prompts WHERE name = ?
    `);

    return stmt.get(name) as Prompt | undefined;
  }

  /**
   * Get all prompts
   */
  getAllPrompts(): Prompt[] {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM prompts ORDER BY name
    `);

    return stmt.all() as Prompt[];
  }

  /**
   * Delete prompt
   */
  deletePrompt(name: string): void {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      DELETE FROM prompts WHERE name = ?
    `);

    stmt.run(name);
  }

  /**
   * Save agent
   */
  saveAgent(agent: Agent): number {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO agents (task_id, agent_type, status, result, error)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      agent.task_id,
      agent.agent_type,
      agent.status,
      agent.result || null,
      agent.error || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(
    agentId: number,
    status: string,
    result?: string,
    error?: string
  ): void {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      UPDATE agents
      SET status = ?, result = ?, error = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(status, result || null, error || null, agentId);
  }

  /**
   * Get agents by task ID
   */
  getAgents(taskId: string): Agent[] {
    this.ensureInitialized();

    const stmt = this.db!.prepare(`
      SELECT * FROM agents WHERE task_id = ? ORDER BY created_at DESC
    `);

    return stmt.all(taskId) as Agent[];
  }

  /**
   * Get database statistics
   */
  getStats(): {
    conversations: number;
    documents: number;
    prompts: number;
    agents: number;
  } {
    this.ensureInitialized();

    const conversations = this.db!.prepare('SELECT COUNT(*) as count FROM conversations').get() as any;
    const documents = this.db!.prepare('SELECT COUNT(*) as count FROM documents').get() as any;
    const prompts = this.db!.prepare('SELECT COUNT(*) as count FROM prompts').get() as any;
    const agents = this.db!.prepare('SELECT COUNT(*) as count FROM agents').get() as any;

    return {
      conversations: conversations.count,
      documents: documents.count,
      prompts: prompts.count,
      agents: agents.count,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Ensure database is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  /**
   * Get database path
   */
  getDatabasePath(): string {
    return this.dbPath;
  }
}
