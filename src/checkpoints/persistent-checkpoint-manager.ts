import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';

export interface FileSnapshot {
  path: string;
  content: string;
  existed: boolean;
  hash: string;
}

export interface PersistentCheckpoint {
  id: string;
  timestamp: Date;
  description: string;
  files: FileSnapshot[];
  workingDirectory: string;
  projectHash: string;
}

export interface CheckpointIndex {
  projectHash: string;
  projectPath: string;
  checkpoints: string[]; // List of checkpoint IDs
  lastUpdated: Date;
}

export interface PersistentCheckpointManagerOptions {
  maxCheckpoints?: number;
  autoCheckpoint?: boolean;
  historyDir?: string;
}

/**
 * Persistent Checkpoint Manager - Inspired by Gemini CLI
 * Stores checkpoints in ~/.grok/history/<project_hash>/ for cross-session persistence
 */
export class PersistentCheckpointManager extends EventEmitter {
  private maxCheckpoints: number;
  private autoCheckpoint: boolean;
  private workingDirectory: string;
  private historyDir: string;
  private projectHash: string;
  private projectHistoryDir: string;
  private indexPath: string;
  private checkpointCache: Map<string, PersistentCheckpoint> = new Map();

  constructor(options: PersistentCheckpointManagerOptions = {}) {
    super();
    this.maxCheckpoints = options.maxCheckpoints || 100;
    this.autoCheckpoint = options.autoCheckpoint ?? true;
    this.workingDirectory = process.cwd();
    this.historyDir = options.historyDir || path.join(os.homedir(), '.grok', 'history');
    this.projectHash = this.generateProjectHash(this.workingDirectory);
    this.projectHistoryDir = path.join(this.historyDir, this.projectHash);
    this.indexPath = path.join(this.projectHistoryDir, 'index.json');

    // Ensure history directory exists
    this.ensureHistoryDir();
  }

  /**
   * Generate a unique hash for the project based on its path
   */
  private generateProjectHash(projectPath: string): string {
    return crypto.createHash('sha256')
      .update(projectPath)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Ensure the history directory structure exists
   */
  private ensureHistoryDir(): void {
    try {
      if (!fs.existsSync(this.projectHistoryDir)) {
        fs.mkdirSync(this.projectHistoryDir, { recursive: true });
      }

      // Create or update index
      if (!fs.existsSync(this.indexPath)) {
        this.saveIndex({
          projectHash: this.projectHash,
          projectPath: this.workingDirectory,
          checkpoints: [],
          lastUpdated: new Date()
        });
      }
    } catch (error) {
      console.warn('Failed to create history directory:', error);
    }
  }

  /**
   * Load checkpoint index
   */
  private loadIndex(): CheckpointIndex {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        const index = JSON.parse(data);
        index.lastUpdated = new Date(index.lastUpdated);
        return index;
      }
    } catch (error) {
      console.warn('Failed to load checkpoint index:', error);
    }

    return {
      projectHash: this.projectHash,
      projectPath: this.workingDirectory,
      checkpoints: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Save checkpoint index
   */
  private saveIndex(index: CheckpointIndex): void {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.warn('Failed to save checkpoint index:', error);
    }
  }

  /**
   * Get checkpoint file path
   */
  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.projectHistoryDir, `${checkpointId}.json`);
  }

  /**
   * Generate file content hash
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Create a new persistent checkpoint
   */
  createCheckpoint(description: string, files?: string[]): PersistentCheckpoint {
    const checkpoint: PersistentCheckpoint = {
      id: this.generateCheckpointId(),
      timestamp: new Date(),
      description,
      files: [],
      workingDirectory: this.workingDirectory,
      projectHash: this.projectHash
    };

    if (files && files.length > 0) {
      checkpoint.files = this.snapshotFiles(files);
    }

    // Save checkpoint to disk
    this.saveCheckpoint(checkpoint);

    // Update index
    const index = this.loadIndex();
    index.checkpoints.push(checkpoint.id);
    index.lastUpdated = new Date();

    // Trim old checkpoints if exceeding max
    while (index.checkpoints.length > this.maxCheckpoints) {
      const oldId = index.checkpoints.shift();
      if (oldId) {
        this.deleteCheckpointFile(oldId);
      }
    }

    this.saveIndex(index);

    // Update cache
    this.checkpointCache.set(checkpoint.id, checkpoint);

    this.emit('checkpoint-created', checkpoint);
    return checkpoint;
  }

  /**
   * Save checkpoint to disk
   */
  private saveCheckpoint(checkpoint: PersistentCheckpoint): void {
    try {
      const checkpointPath = this.getCheckpointPath(checkpoint.id);
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      console.warn('Failed to save checkpoint:', error);
    }
  }

  /**
   * Load checkpoint from disk
   */
  private loadCheckpoint(checkpointId: string): PersistentCheckpoint | null {
    // Check cache first
    if (this.checkpointCache.has(checkpointId)) {
      return this.checkpointCache.get(checkpointId)!;
    }

    try {
      const checkpointPath = this.getCheckpointPath(checkpointId);
      if (fs.existsSync(checkpointPath)) {
        const data = fs.readFileSync(checkpointPath, 'utf-8');
        const checkpoint = JSON.parse(data);
        checkpoint.timestamp = new Date(checkpoint.timestamp);
        this.checkpointCache.set(checkpointId, checkpoint);
        return checkpoint;
      }
    } catch (error) {
      console.warn('Failed to load checkpoint:', error);
    }

    return null;
  }

  /**
   * Delete checkpoint file
   */
  private deleteCheckpointFile(checkpointId: string): void {
    try {
      const checkpointPath = this.getCheckpointPath(checkpointId);
      if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath);
      }
      this.checkpointCache.delete(checkpointId);
    } catch (error) {
      console.warn('Failed to delete checkpoint file:', error);
    }
  }

  /**
   * Create a checkpoint before modifying a file
   */
  checkpointBeforeEdit(filePath: string, description?: string): PersistentCheckpoint {
    const resolvedPath = path.resolve(this.workingDirectory, filePath);
    const desc = description || `Before editing: ${path.basename(filePath)}`;
    return this.createCheckpoint(desc, [resolvedPath]);
  }

  /**
   * Create a checkpoint before creating a file
   */
  checkpointBeforeCreate(filePath: string, description?: string): PersistentCheckpoint {
    const resolvedPath = path.resolve(this.workingDirectory, filePath);
    const desc = description || `Before creating: ${path.basename(filePath)}`;
    return this.createCheckpoint(desc, [resolvedPath]);
  }

  /**
   * Snapshot multiple files
   */
  private snapshotFiles(filePaths: string[]): FileSnapshot[] {
    const snapshots: FileSnapshot[] = [];

    for (const filePath of filePaths) {
      try {
        const resolvedPath = path.resolve(this.workingDirectory, filePath);

        if (fs.existsSync(resolvedPath)) {
          const stat = fs.statSync(resolvedPath);
          if (stat.isFile()) {
            const content = fs.readFileSync(resolvedPath, 'utf-8');
            snapshots.push({
              path: resolvedPath,
              content,
              existed: true,
              hash: this.hashContent(content)
            });
          }
        } else {
          snapshots.push({
            path: resolvedPath,
            content: '',
            existed: false,
            hash: ''
          });
        }
      } catch (_error) {
        // Skip files that can't be read
      }
    }

    return snapshots;
  }

  /**
   * Restore to a specific checkpoint (like Gemini CLI's /restore)
   */
  restore(checkpointId: string): { success: boolean; restored: string[]; errors: string[]; checkpoint?: PersistentCheckpoint } {
    const checkpoint = this.loadCheckpoint(checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        restored: [],
        errors: [`Checkpoint not found: ${checkpointId}`]
      };
    }

    const restored: string[] = [];
    const errors: string[] = [];

    for (const snapshot of checkpoint.files) {
      try {
        if (snapshot.existed) {
          // Restore file content
          const dir = path.dirname(snapshot.path);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(snapshot.path, snapshot.content);
          restored.push(snapshot.path);
        } else {
          // File didn't exist, delete it if it exists now
          if (fs.existsSync(snapshot.path)) {
            fs.unlinkSync(snapshot.path);
            restored.push(`Deleted: ${snapshot.path}`);
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to restore ${snapshot.path}: ${errorMessage}`);
      }
    }

    this.emit('restore', checkpoint, restored, errors);

    return {
      success: errors.length === 0,
      restored,
      errors,
      checkpoint
    };
  }

  /**
   * Restore to the last checkpoint
   */
  restoreLast(): { success: boolean; restored: string[]; errors: string[]; checkpoint?: PersistentCheckpoint } {
    const index = this.loadIndex();

    if (index.checkpoints.length === 0) {
      return {
        success: false,
        restored: [],
        errors: ['No checkpoints available']
      };
    }

    const lastCheckpointId = index.checkpoints[index.checkpoints.length - 1];
    return this.restore(lastCheckpointId);
  }

  /**
   * Get all checkpoints for this project
   */
  getCheckpoints(): PersistentCheckpoint[] {
    const index = this.loadIndex();
    const checkpoints: PersistentCheckpoint[] = [];

    for (const id of index.checkpoints) {
      const checkpoint = this.loadCheckpoint(id);
      if (checkpoint) {
        checkpoints.push(checkpoint);
      }
    }

    return checkpoints;
  }

  /**
   * Get checkpoint by ID
   */
  getCheckpoint(id: string): PersistentCheckpoint | null {
    return this.loadCheckpoint(id);
  }

  /**
   * Get recent checkpoints
   */
  getRecentCheckpoints(count: number = 10): PersistentCheckpoint[] {
    const index = this.loadIndex();
    const recentIds = index.checkpoints.slice(-count);
    const checkpoints: PersistentCheckpoint[] = [];

    for (const id of recentIds) {
      const checkpoint = this.loadCheckpoint(id);
      if (checkpoint) {
        checkpoints.push(checkpoint);
      }
    }

    return checkpoints;
  }

  /**
   * Clear all checkpoints for this project
   */
  clearCheckpoints(): void {
    const index = this.loadIndex();

    for (const id of index.checkpoints) {
      this.deleteCheckpointFile(id);
    }

    index.checkpoints = [];
    index.lastUpdated = new Date();
    this.saveIndex(index);

    this.checkpointCache.clear();
    this.emit('checkpoints-cleared');
  }

  /**
   * Delete a specific checkpoint
   */
  deleteCheckpoint(id: string): boolean {
    const index = this.loadIndex();
    const idx = index.checkpoints.indexOf(id);

    if (idx >= 0) {
      index.checkpoints.splice(idx, 1);
      index.lastUpdated = new Date();
      this.saveIndex(index);
      this.deleteCheckpointFile(id);
      return true;
    }

    return false;
  }

  /**
   * Format checkpoint for display
   */
  formatCheckpoint(checkpoint: PersistentCheckpoint): string {
    const time = checkpoint.timestamp.toLocaleString();
    const filesCount = checkpoint.files.length;
    return `[${checkpoint.id.slice(0, 8)}] ${time} - ${checkpoint.description} (${filesCount} file${filesCount !== 1 ? 's' : ''})`;
  }

  /**
   * Format all checkpoints for display (interactive restore menu)
   */
  formatCheckpointList(): string {
    const checkpoints = this.getCheckpoints();

    if (checkpoints.length === 0) {
      return 'No checkpoints available.';
    }

    const header = '📸 Checkpoints (persistent):\n' + '─'.repeat(60) + '\n';
    const list = checkpoints
      .map((cp, index) => `${index + 1}. ${this.formatCheckpoint(cp)}`)
      .join('\n');

    const footer = '\n' + '─'.repeat(60) + '\n' +
      `Use /restore <number> or /restore <checkpoint-id> to restore\n` +
      `Storage: ${this.projectHistoryDir}`;

    return header + list + footer;
  }

  /**
   * Generate a unique checkpoint ID
   */
  private generateCheckpointId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `cp_${timestamp}_${random}`;
  }

  /**
   * Get statistics about checkpoints
   */
  getStats(): {
    count: number;
    totalFiles: number;
    storageSize: number;
    oldestTimestamp?: Date;
    newestTimestamp?: Date;
    storagePath: string;
  } {
    const checkpoints = this.getCheckpoints();
    const totalFiles = checkpoints.reduce((sum, cp) => sum + cp.files.length, 0);

    // Calculate storage size
    let storageSize = 0;
    try {
      const files = fs.readdirSync(this.projectHistoryDir);
      for (const file of files) {
        const stat = fs.statSync(path.join(this.projectHistoryDir, file));
        storageSize += stat.size;
      }
    } catch (_error) {
      // Ignore errors
    }

    return {
      count: checkpoints.length,
      totalFiles,
      storageSize,
      oldestTimestamp: checkpoints[0]?.timestamp,
      newestTimestamp: checkpoints[checkpoints.length - 1]?.timestamp,
      storagePath: this.projectHistoryDir
    };
  }

  /**
   * Check if auto-checkpoint is enabled
   */
  isAutoCheckpointEnabled(): boolean {
    return this.autoCheckpoint;
  }

  /**
   * Enable or disable auto-checkpoint
   */
  setAutoCheckpoint(enabled: boolean): void {
    this.autoCheckpoint = enabled;
  }

  /**
   * Get the history directory path
   */
  getHistoryDir(): string {
    return this.projectHistoryDir;
  }
}

// Singleton instance
let persistentCheckpointManagerInstance: PersistentCheckpointManager | null = null;

export function getPersistentCheckpointManager(options?: PersistentCheckpointManagerOptions): PersistentCheckpointManager {
  if (!persistentCheckpointManagerInstance) {
    persistentCheckpointManagerInstance = new PersistentCheckpointManager(options);
  }
  return persistentCheckpointManagerInstance;
}

export function resetPersistentCheckpointManager(): void {
  persistentCheckpointManagerInstance = null;
}
