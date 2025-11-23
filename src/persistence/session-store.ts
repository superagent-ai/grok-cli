import fs from 'fs';
import path from 'path';
import os from 'os';
import { ChatEntry } from '../agent/grok-agent.js';

export interface Session {
  id: string;
  name: string;
  workingDirectory: string;
  model: string;
  messages: SessionMessage[];
  createdAt: Date;
  lastAccessedAt: Date;
  metadata?: Record<string, any>;
}

export interface SessionMessage {
  type: 'user' | 'assistant' | 'tool_result' | 'tool_call';
  content: string;
  timestamp: string;
  toolCallName?: string;
  toolCallSuccess?: boolean;
}

const SESSIONS_DIR = path.join(os.homedir(), '.grok', 'sessions');
const MAX_SESSIONS = 50;

/**
 * Session Store for persisting and restoring chat sessions
 */
export class SessionStore {
  private currentSessionId: string | null = null;
  private autoSave: boolean = true;

  constructor() {
    this.ensureSessionsDirectory();
  }

  /**
   * Ensure the sessions directory exists
   */
  private ensureSessionsDirectory(): void {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  /**
   * Create a new session
   */
  createSession(name?: string, model?: string): Session {
    const session: Session = {
      id: this.generateSessionId(),
      name: name || `Session ${new Date().toLocaleDateString()}`,
      workingDirectory: process.cwd(),
      model: model || 'grok-4-latest',
      messages: [],
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };

    this.saveSession(session);
    this.currentSessionId = session.id;

    return session;
  }

  /**
   * Save a session to disk
   */
  saveSession(session: Session): void {
    this.ensureSessionsDirectory();
    const filePath = this.getSessionFilePath(session.id);

    const data = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastAccessedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load a session from disk
   */
  loadSession(sessionId: string): Session | null {
    const filePath = this.getSessionFilePath(sessionId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        lastAccessedAt: new Date(data.lastAccessedAt)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Update the current session with new messages
   */
  updateCurrentSession(chatHistory: ChatEntry[]): void {
    if (!this.currentSessionId || !this.autoSave) return;

    const session = this.loadSession(this.currentSessionId);
    if (!session) return;

    session.messages = this.convertChatEntriesToMessages(chatHistory);
    session.lastAccessedAt = new Date();

    this.saveSession(session);
  }

  /**
   * Add a message to the current session
   */
  addMessageToCurrentSession(entry: ChatEntry): void {
    if (!this.currentSessionId || !this.autoSave) return;

    const session = this.loadSession(this.currentSessionId);
    if (!session) return;

    session.messages.push(this.convertChatEntryToMessage(entry));
    session.lastAccessedAt = new Date();

    this.saveSession(session);
  }

  /**
   * Convert ChatEntry to SessionMessage
   */
  private convertChatEntryToMessage(entry: ChatEntry): SessionMessage {
    return {
      type: entry.type,
      content: entry.content,
      timestamp: entry.timestamp.toISOString(),
      toolCallName: entry.toolCall?.function?.name,
      toolCallSuccess: entry.toolResult?.success
    };
  }

  /**
   * Convert ChatEntry array to SessionMessage array
   */
  private convertChatEntriesToMessages(entries: ChatEntry[]): SessionMessage[] {
    return entries.map(entry => this.convertChatEntryToMessage(entry));
  }

  /**
   * Convert SessionMessage array back to ChatEntry array
   */
  convertMessagesToChatEntries(messages: SessionMessage[]): ChatEntry[] {
    return messages.map(msg => ({
      type: msg.type as any,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      toolCall: msg.toolCallName ? {
        id: `restored_${Date.now()}`,
        type: 'function' as const,
        function: {
          name: msg.toolCallName,
          arguments: '{}'
        }
      } : undefined,
      toolResult: msg.toolCallSuccess !== undefined ? {
        success: msg.toolCallSuccess
      } : undefined
    }));
  }

  /**
   * List all saved sessions
   */
  listSessions(): Session[] {
    this.ensureSessionsDirectory();

    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const sessionId = f.replace('.json', '');
        return this.loadSession(sessionId);
      })
      .filter((s): s is Session => s !== null)
      .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

    return files;
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(count: number = 10): Session[] {
    return this.listSessions().slice(0, count);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const filePath = this.getSessionFilePath(sessionId);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }

      return true;
    }

    return false;
  }

  /**
   * Clean up old sessions (keep only MAX_SESSIONS most recent)
   */
  cleanupOldSessions(): number {
    const sessions = this.listSessions();
    let deleted = 0;

    if (sessions.length > MAX_SESSIONS) {
      const sessionsToDelete = sessions.slice(MAX_SESSIONS);

      for (const session of sessionsToDelete) {
        if (this.deleteSession(session.id)) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Export session to Markdown
   */
  exportToMarkdown(sessionId: string): string | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const lines: string[] = [
      `# ${session.name}`,
      '',
      `**Created:** ${session.createdAt.toLocaleString()}`,
      `**Last Accessed:** ${session.lastAccessedAt.toLocaleString()}`,
      `**Working Directory:** ${session.workingDirectory}`,
      `**Model:** ${session.model}`,
      '',
      '---',
      ''
    ];

    for (const message of session.messages) {
      const time = new Date(message.timestamp).toLocaleTimeString();

      if (message.type === 'user') {
        lines.push(`## User (${time})`);
        lines.push('');
        lines.push(message.content);
        lines.push('');
      } else if (message.type === 'assistant') {
        lines.push(`## Assistant (${time})`);
        lines.push('');
        lines.push(message.content);
        lines.push('');
      } else if (message.type === 'tool_result') {
        const status = message.toolCallSuccess ? '✅' : '❌';
        lines.push(`### Tool: ${message.toolCallName || 'unknown'} ${status}`);
        lines.push('');
        lines.push('```');
        lines.push(message.content.slice(0, 500));
        if (message.content.length > 500) {
          lines.push('... [truncated]');
        }
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Save session export to file
   */
  exportSessionToFile(sessionId: string, outputPath?: string): string | null {
    const markdown = this.exportToMarkdown(sessionId);
    if (!markdown) return null;

    const session = this.loadSession(sessionId);
    if (!session) return null;

    const fileName = outputPath || `grok-session-${session.id.slice(0, 8)}.md`;
    const fullPath = path.resolve(process.cwd(), fileName);

    fs.writeFileSync(fullPath, markdown);
    return fullPath;
  }

  /**
   * Resume a session (set as current)
   */
  resumeSession(sessionId: string): Session | null {
    const session = this.loadSession(sessionId);
    if (session) {
      this.currentSessionId = sessionId;
      session.lastAccessedAt = new Date();
      this.saveSession(session);
    }
    return session;
  }

  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get the current session
   */
  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.loadSession(this.currentSessionId);
  }

  /**
   * Set auto-save mode
   */
  setAutoSave(enabled: boolean): void {
    this.autoSave = enabled;
  }

  /**
   * Check if auto-save is enabled
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSave;
  }

  /**
   * Format session for display
   */
  formatSession(session: Session): string {
    const messageCount = session.messages.length;
    const date = session.lastAccessedAt.toLocaleDateString();
    const time = session.lastAccessedAt.toLocaleTimeString();
    return `[${session.id.slice(0, 8)}] ${session.name} - ${messageCount} messages - ${date} ${time}`;
  }

  /**
   * Format session list for display
   */
  formatSessionList(): string {
    const sessions = this.getRecentSessions(10);

    if (sessions.length === 0) {
      return 'No saved sessions.';
    }

    const header = 'Recent Sessions:\n' + '─'.repeat(50) + '\n';
    const list = sessions
      .map((s, index) => `${index + 1}. ${this.formatSession(s)}`)
      .join('\n');

    return header + list;
  }

  /**
   * Get session file path
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(SESSIONS_DIR, `${sessionId}.json`);
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Search sessions by content
   */
  searchSessions(query: string): Session[] {
    const sessions = this.listSessions();
    const lowerQuery = query.toLowerCase();

    return sessions.filter(session => {
      // Search in name
      if (session.name.toLowerCase().includes(lowerQuery)) return true;

      // Search in messages
      return session.messages.some(msg =>
        msg.content.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Get the most recent session
   */
  getLastSession(): Session | null {
    const sessions = this.listSessions();
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Resume the last session
   */
  resumeLastSession(): Session | null {
    const lastSession = this.getLastSession();
    if (lastSession) {
      return this.resumeSession(lastSession.id);
    }
    return null;
  }

  /**
   * Continue from last response (get last session and last message)
   */
  continueLastSession(): { session: Session; lastUserMessage: string } | null {
    const session = this.resumeLastSession();
    if (!session) return null;

    // Find the last user message
    const lastUserMessage = [...session.messages]
      .reverse()
      .find(m => m.type === 'user');

    return {
      session,
      lastUserMessage: lastUserMessage?.content || ''
    };
  }

  /**
   * Get session by partial ID match
   */
  getSessionByPartialId(partialId: string): Session | null {
    const sessions = this.listSessions();
    const match = sessions.find(s =>
      s.id.includes(partialId) || s.id.startsWith(partialId)
    );
    return match || null;
  }

  /**
   * Clone a session (for branching conversations)
   */
  cloneSession(sessionId: string, newName?: string): Session | null {
    const original = this.loadSession(sessionId);
    if (!original) return null;

    const cloned: Session = {
      ...original,
      id: this.generateSessionId(),
      name: newName || `${original.name} (copy)`,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messages: [...original.messages]
    };

    this.saveSession(cloned);
    return cloned;
  }

  /**
   * Branch session at a specific message index
   */
  branchSession(sessionId: string, atMessageIndex: number, newName?: string): Session | null {
    const original = this.loadSession(sessionId);
    if (!original) return null;

    const branchedMessages = original.messages.slice(0, atMessageIndex + 1);

    const branched: Session = {
      ...original,
      id: this.generateSessionId(),
      name: newName || `${original.name} (branch)`,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messages: branchedMessages,
      metadata: {
        ...original.metadata,
        branchedFrom: sessionId,
        branchedAt: atMessageIndex
      }
    };

    this.saveSession(branched);
    return branched;
  }

  /**
   * Format help for session commands
   */
  formatHelp(): string {
    return `
Session Management Commands:

  /sessions           List recent sessions
  /session <id>       Resume a specific session
  /session last       Resume the last session
  /session continue   Continue from last response
  /session export     Export current session to markdown
  /session delete <id> Delete a session
  /session clone <id> Clone a session
  /session branch <n> Branch at message index n
  /session search <q> Search sessions by content

CLI Flags:
  --resume            Resume the last session
  --continue          Continue from last response
  --session <id>      Load a specific session

Examples:
  grok --resume
  grok --session abc123
  /session clone abc123 "My experiment"
`;
  }
}

// Singleton instance
let sessionStoreInstance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new SessionStore();
  }
  return sessionStoreInstance;
}

export function resetSessionStore(): void {
  sessionStoreInstance = null;
}
