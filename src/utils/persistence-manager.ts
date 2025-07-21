import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

export interface PersistenceConfig {
  baseDir: string;
  enabled: boolean;
  backupCount: number;
}

export class PersistenceManager {
  private config: PersistenceConfig;
  private grokDir: string;
  private initialized: boolean = false;
  private initializing: boolean = false;

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = {
      baseDir: path.join(os.homedir(), '.grok'),
      enabled: true,
      backupCount: 3,
      ...config,
    };
    
    this.grokDir = this.config.baseDir;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;
    try {
      await fs.ensureDir(this.grokDir);
      this.initialized = true;
      console.log(`Persistence manager initialized: ${this.grokDir}`);
    } catch (error) {
      console.warn(`Failed to initialize persistence directory: ${error}`);
      this.config.enabled = false;
    } finally {
      this.initializing = false;
    }
  }

  async save<T>(filename: string, data: T): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const filePath = path.join(this.grokDir, filename);
    
    try {
      // Create backup if file exists
      if (await fs.pathExists(filePath)) {
        await this.createBackup(filename);
      }

      // Save the data
      await fs.writeJson(filePath, data, { spaces: 2 });
      return true;
    } catch (error) {
      console.error(`Failed to save ${filename}:`, error);
      return false;
    }
  }

  async load<T>(filename: string, defaultValue?: T): Promise<T | null> {
    if (!this.config.enabled) {
      return defaultValue || null;
    }

    const filePath = path.join(this.grokDir, filename);
    
    try {
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJson(filePath);
        return data as T;
      } else {
        return defaultValue || null;
      }
    } catch (error) {
      console.error(`Failed to load ${filename}:`, error);
      
      // Try to restore from backup
      const restored = await this.restoreFromBackup(filename);
      if (restored) {
        return restored as T;
      }
      
      return defaultValue || null;
    }
  }

  async exists(filename: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const filePath = path.join(this.grokDir, filename);
    return await fs.pathExists(filePath);
  }

  async delete(filename: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const filePath = path.join(this.grokDir, filename);
    
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete ${filename}:`, error);
      return false;
    }
  }

  private async createBackup(filename: string): Promise<void> {
    const filePath = path.join(this.grokDir, filename);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.grokDir, `${filename}.backup.${timestamp}`);
    
    try {
      await fs.copy(filePath, backupPath);
      
      // Clean up old backups
      await this.cleanupOldBackups(filename);
    } catch (error) {
      console.warn(`Failed to create backup for ${filename}:`, error);
    }
  }

  private async cleanupOldBackups(filename: string): Promise<void> {
    try {
      const files = await fs.readdir(this.grokDir);
      const backupPattern = `${filename}.backup.`;
      const backupFiles = files
        .filter(file => file.startsWith(backupPattern))
        .map(file => ({
          name: file,
          path: path.join(this.grokDir, file),
          time: file.substring(backupPattern.length)
        }))
        .sort((a, b) => b.time.localeCompare(a.time)); // Sort by timestamp desc

      // Keep only the most recent backups
      const toDelete = backupFiles.slice(this.config.backupCount);
      
      for (const backup of toDelete) {
        await fs.remove(backup.path);
      }
    } catch (error) {
      console.warn(`Failed to cleanup old backups for ${filename}:`, error);
    }
  }

  private async restoreFromBackup(filename: string): Promise<any | null> {
    try {
      const files = await fs.readdir(this.grokDir);
      const backupPattern = `${filename}.backup.`;
      const backupFiles = files
        .filter(file => file.startsWith(backupPattern))
        .map(file => ({
          name: file,
          path: path.join(this.grokDir, file),
          time: file.substring(backupPattern.length)
        }))
        .sort((a, b) => b.time.localeCompare(a.time)); // Most recent first

      if (backupFiles.length > 0) {
        const latestBackup = backupFiles[0];
        console.log(`Restoring ${filename} from backup: ${latestBackup.name}`);
        
        const data = await fs.readJson(latestBackup.path);
        
        // Save the restored data
        const originalPath = path.join(this.grokDir, filename);
        await fs.writeJson(originalPath, data, { spaces: 2 });
        
        return data;
      }
    } catch (error) {
      console.error(`Failed to restore from backup for ${filename}:`, error);
    }
    
    return null;
  }

  getFilePath(filename: string): string {
    return path.join(this.grokDir, filename);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  disable(): void {
    this.config.enabled = false;
  }

  enable(): void {
    this.config.enabled = true;
  }
}

// Singleton instance
let persistenceManager: PersistenceManager | null = null;

export function getPersistenceManager(config?: Partial<PersistenceConfig>): PersistenceManager {
  if (!persistenceManager) {
    persistenceManager = new PersistenceManager(config);
  }
  return persistenceManager;
}