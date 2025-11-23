import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface FileSnapshot {
  path: string;
  content: string;
  existed: boolean;
}

export interface Checkpoint {
  id: string;
  timestamp: Date;
  description: string;
  files: FileSnapshot[];
  workingDirectory: string;
}

export interface CheckpointManagerOptions {
  maxCheckpoints?: number;
  autoCheckpoint?: boolean;
}

/**
 * Checkpoint Manager for saving and restoring file states
 */
export class CheckpointManager extends EventEmitter {
  private checkpoints: Checkpoint[] = [];
  private maxCheckpoints: number;
  private autoCheckpoint: boolean;
  private workingDirectory: string;

  constructor(options: CheckpointManagerOptions = {}) {
    super();
    this.maxCheckpoints = options.maxCheckpoints || 50;
    this.autoCheckpoint = options.autoCheckpoint ?? true;
    this.workingDirectory = process.cwd();
  }

  /**
   * Create a new checkpoint
   */
  createCheckpoint(description: string, files?: string[]): Checkpoint {
    const checkpoint: Checkpoint = {
      id: this.generateId(),
      timestamp: new Date(),
      description,
      files: [],
      workingDirectory: this.workingDirectory
    };

    if (files && files.length > 0) {
      checkpoint.files = this.snapshotFiles(files);
    }

    this.checkpoints.push(checkpoint);

    // Trim old checkpoints if exceeding max
    while (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift();
    }

    this.emit('checkpoint-created', checkpoint);
    return checkpoint;
  }

  /**
   * Create a checkpoint before modifying a file
   */
  checkpointBeforeEdit(filePath: string, description?: string): Checkpoint {
    const resolvedPath = path.resolve(this.workingDirectory, filePath);
    const desc = description || `Before editing: ${path.basename(filePath)}`;

    const checkpoint = this.createCheckpoint(desc, [resolvedPath]);
    return checkpoint;
  }

  /**
   * Create a checkpoint before creating a file
   */
  checkpointBeforeCreate(filePath: string, description?: string): Checkpoint {
    const resolvedPath = path.resolve(this.workingDirectory, filePath);
    const desc = description || `Before creating: ${path.basename(filePath)}`;

    // Snapshot the file (will mark it as non-existent if it doesn't exist)
    const checkpoint = this.createCheckpoint(desc, [resolvedPath]);
    return checkpoint;
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
              existed: true
            });
          }
        } else {
          // File doesn't exist yet
          snapshots.push({
            path: resolvedPath,
            content: '',
            existed: false
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return snapshots;
  }

  /**
   * Rewind to a specific checkpoint
   */
  rewindTo(checkpointId: string): { success: boolean; restored: string[]; errors: string[] } {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);

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
      } catch (error: any) {
        errors.push(`Failed to restore ${snapshot.path}: ${error.message}`);
      }
    }

    // Remove checkpoints created after this one
    const checkpointIndex = this.checkpoints.indexOf(checkpoint);
    if (checkpointIndex >= 0) {
      this.checkpoints = this.checkpoints.slice(0, checkpointIndex + 1);
    }

    this.emit('rewind', checkpoint, restored, errors);

    return {
      success: errors.length === 0,
      restored,
      errors
    };
  }

  /**
   * Rewind to the last checkpoint
   */
  rewindToLast(): { success: boolean; restored: string[]; errors: string[]; checkpoint?: Checkpoint } {
    if (this.checkpoints.length === 0) {
      return {
        success: false,
        restored: [],
        errors: ['No checkpoints available']
      };
    }

    const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];
    const result = this.rewindTo(lastCheckpoint.id);

    return {
      ...result,
      checkpoint: lastCheckpoint
    };
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): Checkpoint[] {
    return [...this.checkpoints];
  }

  /**
   * Get a specific checkpoint by ID
   */
  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.find(cp => cp.id === id);
  }

  /**
   * Get the last N checkpoints
   */
  getRecentCheckpoints(count: number = 10): Checkpoint[] {
    return this.checkpoints.slice(-count);
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints = [];
    this.emit('checkpoints-cleared');
  }

  /**
   * Delete a specific checkpoint
   */
  deleteCheckpoint(id: string): boolean {
    const index = this.checkpoints.findIndex(cp => cp.id === id);
    if (index >= 0) {
      this.checkpoints.splice(index, 1);
      return true;
    }
    return false;
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
   * Format checkpoint for display
   */
  formatCheckpoint(checkpoint: Checkpoint): string {
    const time = checkpoint.timestamp.toLocaleTimeString();
    const filesCount = checkpoint.files.length;
    return `[${checkpoint.id.slice(0, 8)}] ${time} - ${checkpoint.description} (${filesCount} file${filesCount !== 1 ? 's' : ''})`;
  }

  /**
   * Format all checkpoints for display
   */
  formatCheckpointList(): string {
    if (this.checkpoints.length === 0) {
      return 'No checkpoints available.';
    }

    const header = 'Checkpoints:\n' + '─'.repeat(50) + '\n';
    const list = this.checkpoints
      .map((cp, index) => `${index + 1}. ${this.formatCheckpoint(cp)}`)
      .join('\n');

    return header + list;
  }

  /**
   * Generate a unique checkpoint ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `cp_${timestamp}_${random}`;
  }

  /**
   * Get statistics about checkpoints
   */
  getStats(): { count: number; totalFiles: number; oldestTimestamp?: Date; newestTimestamp?: Date } {
    const totalFiles = this.checkpoints.reduce((sum, cp) => sum + cp.files.length, 0);

    return {
      count: this.checkpoints.length,
      totalFiles,
      oldestTimestamp: this.checkpoints[0]?.timestamp,
      newestTimestamp: this.checkpoints[this.checkpoints.length - 1]?.timestamp
    };
  }
}

// Singleton instance
let checkpointManagerInstance: CheckpointManager | null = null;

export function getCheckpointManager(options?: CheckpointManagerOptions): CheckpointManager {
  if (!checkpointManagerInstance) {
    checkpointManagerInstance = new CheckpointManager(options);
  }
  return checkpointManagerInstance;
}

export function resetCheckpointManager(): void {
  checkpointManagerInstance = null;
}
