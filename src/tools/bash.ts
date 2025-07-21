import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolResult } from '../types';
import { ConfirmationService } from '../utils/confirmation-service';
import { getPersistenceManager } from '../utils/persistence-manager';

const execAsync = promisify(exec);

interface SessionData {
  workingDirectory: string;
  timestamp: number;
}

export class BashTool {
  private currentDirectory: string = process.cwd();
  private confirmationService = ConfirmationService.getInstance();
  private persistenceManager = getPersistenceManager();
  private readonly SESSION_FILE = 'bash-session.json';
  private initialized = false;

  constructor() {
    this.initializePersistence();
  }

  private async initializePersistence(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.persistenceManager.initialize();
      await this.loadSessionData();
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize BashTool persistence:', error);
      this.initialized = true; // Continue without persistence
    }
  }

  private async loadSessionData(): Promise<void> {
    try {
      const sessionData = await this.persistenceManager.load<SessionData>(this.SESSION_FILE);
      
      if (sessionData?.workingDirectory) {
        // Verify the directory still exists before changing to it
        try {
          process.chdir(sessionData.workingDirectory);
          this.currentDirectory = process.cwd();
          console.log(`Restored working directory: ${this.currentDirectory}`);
        } catch (error) {
          console.warn(`Could not restore working directory ${sessionData.workingDirectory}, staying in ${process.cwd()}`);
        }
      }
    } catch (error) {
      console.warn('Failed to load bash session from persistence:', error);
    }
  }

  private async saveSessionData(): Promise<void> {
    try {
      const sessionData: SessionData = {
        workingDirectory: this.currentDirectory,
        timestamp: Date.now()
      };
      
      await this.persistenceManager.save(this.SESSION_FILE, sessionData);
    } catch (error) {
      console.warn('Failed to save bash session to persistence:', error);
    }
  }


  async execute(command: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      // Ensure persistence is initialized
      await this.initializePersistence();

      // Check if user has already accepted bash commands for this session
      const sessionFlags = this.confirmationService.getSessionFlags();
      if (!sessionFlags.bashCommands && !sessionFlags.allOperations) {
        // Request confirmation showing the command
        const confirmationResult = await this.confirmationService.requestConfirmation({
          operation: 'Run bash command',
          filename: command,
          showVSCodeOpen: false,
          content: `Command: ${command}\nWorking directory: ${this.currentDirectory}`
        }, 'bash');

        if (!confirmationResult.confirmed) {
          return {
            success: false,
            error: confirmationResult.feedback || 'Command execution cancelled by user'
          };
        }
      }

      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        try {
          process.chdir(newDir);
          this.currentDirectory = process.cwd();
          await this.saveSessionData(); // Persist directory change
          
          return {
            success: true,
            output: `Changed directory to: ${this.currentDirectory}`
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Cannot change directory: ${error.message}`
          };
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.currentDirectory,
        timeout,
        maxBuffer: 1024 * 1024
      });

      const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
      
      return {
        success: true,
        output: output.trim() || 'Command executed successfully (no output)'
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Command failed: ${error.message}`
      };
    }
  }

  getCurrentDirectory(): string {
    return this.currentDirectory;
  }

  async listFiles(directory: string = '.'): Promise<ToolResult> {
    return this.execute(`ls -la ${directory}`);
  }

  async findFiles(pattern: string, directory: string = '.'): Promise<ToolResult> {
    return this.execute(`find ${directory} -name "${pattern}" -type f`);
  }

  async grep(pattern: string, files: string = '.'): Promise<ToolResult> {
    return this.execute(`grep -r "${pattern}" ${files}`);
  }
}