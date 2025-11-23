import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface BackgroundTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
  workingDirectory: string;
  model?: string;
  maxToolRounds?: number;
  tags?: string[];
}

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  filesModified?: string[];
  duration?: number;
}

export interface TaskListOptions {
  status?: TaskStatus;
  limit?: number;
  includeCompleted?: boolean;
}

/**
 * Background Tasks Manager - Inspired by Codex CLI Cloud
 * Allows running AI tasks in the background
 */
export class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private tasksDir: string;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.tasksDir = path.join(os.homedir(), '.grok', 'tasks');
    this.ensureTasksDir();
    this.loadTasks();
  }

  /**
   * Ensure tasks directory exists
   */
  private ensureTasksDir(): void {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
    }
  }

  /**
   * Load existing tasks from disk
   */
  private loadTasks(): void {
    try {
      const files = fs.readdirSync(this.tasksDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const taskPath = path.join(this.tasksDir, file);
          const task: BackgroundTask = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
          task.createdAt = new Date(task.createdAt);
          if (task.startedAt) task.startedAt = new Date(task.startedAt);
          if (task.completedAt) task.completedAt = new Date(task.completedAt);

          // Reset running tasks to pending (they were interrupted)
          if (task.status === 'running') {
            task.status = 'pending';
          }

          this.tasks.set(task.id, task);
        } catch (error) {
          // Skip invalid task files
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
  }

  /**
   * Save task to disk
   */
  private saveTask(task: BackgroundTask): void {
    const taskPath = path.join(this.tasksDir, `${task.id}.json`);
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  }

  /**
   * Delete task from disk
   */
  private deleteTaskFile(taskId: string): void {
    const taskPath = path.join(this.tasksDir, `${taskId}.json`);
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }
  }

  /**
   * Generate unique task ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `task_${timestamp}_${random}`;
  }

  /**
   * Create a new background task
   */
  createTask(
    prompt: string,
    options: {
      priority?: TaskPriority;
      workingDirectory?: string;
      model?: string;
      maxToolRounds?: number;
      tags?: string[];
      runImmediately?: boolean;
    } = {}
  ): BackgroundTask {
    const task: BackgroundTask = {
      id: this.generateId(),
      prompt,
      status: 'pending',
      priority: options.priority || 'normal',
      createdAt: new Date(),
      workingDirectory: options.workingDirectory || process.cwd(),
      model: options.model,
      maxToolRounds: options.maxToolRounds,
      tags: options.tags
    };

    this.tasks.set(task.id, task);
    this.saveTask(task);

    this.emit('task-created', task);

    if (options.runImmediately) {
      this.runTask(task.id);
    }

    return task;
  }

  /**
   * Run a task in background
   */
  async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === 'running') {
      throw new Error(`Task is already running: ${taskId}`);
    }

    // Check concurrent limit
    const runningCount = Array.from(this.tasks.values())
      .filter(t => t.status === 'running').length;

    if (runningCount >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent tasks (${this.maxConcurrent}) reached. Wait for a task to complete.`);
    }

    task.status = 'running';
    task.startedAt = new Date();
    this.saveTask(task);

    this.emit('task-started', task);

    // Run grok in headless mode as a child process
    const args = [
      '--prompt', task.prompt,
      '--directory', task.workingDirectory
    ];

    if (task.model) {
      args.push('--model', task.model);
    }

    if (task.maxToolRounds) {
      args.push('--max-tool-rounds', task.maxToolRounds.toString());
    }

    // Find grok executable
    const grokPath = process.argv[1]; // Current script path

    const child = spawn('node', [grokPath, ...args], {
      cwd: task.workingDirectory,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.runningProcesses.set(taskId, child);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      this.emit('task-output', { taskId, data: data.toString() });
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      this.runningProcesses.delete(taskId);

      const updatedTask = this.tasks.get(taskId);
      if (updatedTask) {
        updatedTask.completedAt = new Date();
        updatedTask.status = code === 0 ? 'completed' : 'failed';
        updatedTask.result = {
          success: code === 0,
          output: stdout,
          error: stderr || undefined,
          duration: updatedTask.startedAt
            ? Date.now() - updatedTask.startedAt.getTime()
            : undefined
        };

        this.saveTask(updatedTask);
        this.emit('task-completed', updatedTask);
      }
    });

    child.on('error', (error) => {
      this.runningProcesses.delete(taskId);

      const updatedTask = this.tasks.get(taskId);
      if (updatedTask) {
        updatedTask.completedAt = new Date();
        updatedTask.status = 'failed';
        updatedTask.result = {
          success: false,
          error: error.message
        };

        this.saveTask(updatedTask);
        this.emit('task-failed', updatedTask, error);
      }
    });
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);

    if (!task) {
      return false;
    }

    const process = this.runningProcesses.get(taskId);

    if (process) {
      process.kill('SIGTERM');
      this.runningProcesses.delete(taskId);
    }

    task.status = 'cancelled';
    task.completedAt = new Date();
    this.saveTask(task);

    this.emit('task-cancelled', task);

    return true;
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getTasks(options: TaskListOptions = {}): BackgroundTask[] {
    let tasks = Array.from(this.tasks.values());

    // Filter by status
    if (options.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }

    // Filter completed tasks if not explicitly included
    if (!options.includeCompleted) {
      tasks = tasks.filter(t => !['completed', 'cancelled'].includes(t.status));
    }

    // Sort by priority and creation time
    tasks.sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Apply limit
    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    return tasks;
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);

    if (!task) {
      return false;
    }

    // Cancel if running
    if (task.status === 'running') {
      this.cancelTask(taskId);
    }

    this.tasks.delete(taskId);
    this.deleteTaskFile(taskId);

    this.emit('task-deleted', taskId);

    return true;
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): number {
    const completed = Array.from(this.tasks.values())
      .filter(t => ['completed', 'cancelled', 'failed'].includes(t.status));

    for (const task of completed) {
      this.tasks.delete(task.id);
      this.deleteTaskFile(task.id);
    }

    return completed.length;
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): BackgroundTask | null {
    const originalTask = this.tasks.get(taskId);

    if (!originalTask || originalTask.status !== 'failed') {
      return null;
    }

    const newTask = this.createTask(originalTask.prompt, {
      priority: originalTask.priority,
      workingDirectory: originalTask.workingDirectory,
      model: originalTask.model,
      maxToolRounds: originalTask.maxToolRounds,
      tags: [...(originalTask.tags || []), 'retry'],
      runImmediately: true
    });

    return newTask;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = Array.from(this.tasks.values());

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length
    };
  }

  /**
   * Format task for display
   */
  formatTask(task: BackgroundTask): string {
    const statusEmojis: Record<TaskStatus, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫'
    };

    const priorityEmojis: Record<TaskPriority, string> = {
      high: '🔴',
      normal: '🟡',
      low: '🟢'
    };

    let output = `${statusEmojis[task.status]} [${task.id.slice(0, 8)}] ${priorityEmojis[task.priority]}\n`;
    output += `   ${task.prompt.substring(0, 60)}${task.prompt.length > 60 ? '...' : ''}\n`;
    output += `   Created: ${task.createdAt.toLocaleString()}`;

    if (task.result?.duration) {
      output += ` | Duration: ${Math.round(task.result.duration / 1000)}s`;
    }

    return output;
  }

  /**
   * Format tasks list for display
   */
  formatTasksList(options: TaskListOptions = { includeCompleted: true, limit: 20 }): string {
    const tasks = this.getTasks(options);

    if (tasks.length === 0) {
      return 'No background tasks.\n\n💡 Create one with: grok task "your prompt" --background';
    }

    let output = '📋 Background Tasks\n' + '═'.repeat(60) + '\n\n';

    for (const task of tasks) {
      output += this.formatTask(task) + '\n\n';
    }

    const stats = this.getStats();
    output += '─'.repeat(60) + '\n';
    output += `Total: ${stats.total} | Running: ${stats.running} | Pending: ${stats.pending} | Completed: ${stats.completed}\n`;
    output += '\n💡 Commands: /tasks, /task run <id>, /task cancel <id>, /task clear';

    return output;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Cancel all running tasks
    for (const [taskId] of this.runningProcesses) {
      this.cancelTask(taskId);
    }
  }
}

// Singleton instance
let backgroundTaskManagerInstance: BackgroundTaskManager | null = null;

export function getBackgroundTaskManager(maxConcurrent?: number): BackgroundTaskManager {
  if (!backgroundTaskManagerInstance) {
    backgroundTaskManagerInstance = new BackgroundTaskManager(maxConcurrent);
  }
  return backgroundTaskManagerInstance;
}

export function resetBackgroundTaskManager(): void {
  if (backgroundTaskManagerInstance) {
    backgroundTaskManagerInstance.dispose();
  }
  backgroundTaskManagerInstance = null;
}
