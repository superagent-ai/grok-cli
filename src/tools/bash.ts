import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolResult } from '../types';
import { ConfirmationService } from '../utils/confirmation-service';
import {
  InvalidCommandError,
  CommandExecutionError,
  TimeoutError,
  withTimeout,
  getErrorMessage
} from '../utils/errors';
import { BASH_CONFIG } from '../config/constants';

const execAsync = promisify(exec);

export class BashTool {
  private currentDirectory: string = process.cwd();
  private confirmationService = ConfirmationService.getInstance();

  /**
   * Validates a command to check if it's safe to execute
   * @throws {InvalidCommandError} if command is blocked or dangerous
   */
  private validateCommand(command: string): void {
    const trimmedCommand = command.trim();

    if (!trimmedCommand) {
      throw new InvalidCommandError('Empty command', command);
    }

    // Check for blocked commands
    for (const blocked of BASH_CONFIG.BLOCKED_COMMANDS) {
      if (trimmedCommand.includes(blocked)) {
        throw new InvalidCommandError(
          `Blocked command detected: ${blocked}`,
          command
        );
      }
    }

    // Extract the base command (first word)
    const baseCommand = trimmedCommand.split(/\s+/)[0].split('/').pop() || '';

    // Check for dangerous commands
    if (BASH_CONFIG.DANGEROUS_COMMANDS.includes(baseCommand)) {
      // These will require explicit user confirmation
      return;
    }
  }

  /**
   * Checks if a command is considered dangerous
   */
  private isDangerousCommand(command: string): boolean {
    const trimmedCommand = command.trim();
    const baseCommand = trimmedCommand.split(/\s+/)[0].split('/').pop() || '';
    return BASH_CONFIG.DANGEROUS_COMMANDS.includes(baseCommand);
  }

  async execute(command: string, timeout: number = BASH_CONFIG.COMMAND_TIMEOUT): Promise<ToolResult> {
    try {
      // Validate command before execution
      this.validateCommand(command);

      // Check if user has already accepted bash commands for this session
      const sessionFlags = this.confirmationService.getSessionFlags();
      const isDangerous = this.isDangerousCommand(command);

      // Always require confirmation for dangerous commands, or if not already approved
      if (isDangerous || (!sessionFlags.bashCommands && !sessionFlags.allOperations)) {
        const operation = isDangerous ? '⚠️  Run DANGEROUS bash command' : 'Run bash command';

        // Request confirmation showing the command
        const confirmationResult = await this.confirmationService.requestConfirmation({
          operation,
          filename: command,
          showVSCodeOpen: false,
          content: `Command: ${command}\nWorking directory: ${this.currentDirectory}${
            isDangerous ? '\n\n⚠️  WARNING: This command can potentially cause data loss or system damage!' : ''
          }`
        }, isDangerous ? 'dangerous-bash' : 'bash');

        if (!confirmationResult.confirmed) {
          return {
            success: false,
            error: confirmationResult.feedback || 'Command execution cancelled by user'
          };
        }
      }

      // Handle cd command specially
      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        try {
          process.chdir(newDir);
          this.currentDirectory = process.cwd();
          return {
            success: true,
            output: `Changed directory to: ${this.currentDirectory}`
          };
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          return {
            success: false,
            error: `Cannot change directory to '${newDir}': ${errorMessage}`
          };
        }
      }

      // Execute command with timeout
      try {
        const result = await withTimeout(
          execAsync(command, {
            cwd: this.currentDirectory,
            timeout,
            maxBuffer: BASH_CONFIG.MAX_OUTPUT_SIZE
          }),
          timeout,
          `Command execution timed out after ${timeout}ms`
        );

        const output = result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : '');

        return {
          success: true,
          output: output.trim() || 'Command executed successfully (no output)'
        };
      } catch (error) {
        if (error instanceof TimeoutError) {
          return {
            success: false,
            error: error.message
          };
        }

        // Handle exec errors with exit codes
        if (error && typeof error === 'object' && 'code' in error) {
          const execError = error as any;
          const stderr = execError.stderr?.trim() || '';
          const stdout = execError.stdout?.trim() || '';
          const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');

          return {
            success: false,
            error: `Command failed with exit code ${execError.code}${
              output ? `:\n${output}` : ''
            }`
          };
        }

        throw error;
      }
    } catch (error) {
      // Handle validation errors and other errors
      if (error instanceof InvalidCommandError) {
        return {
          success: false,
          error: error.message
        };
      }

      const errorMessage = getErrorMessage(error);
      return {
        success: false,
        error: `Command execution failed: ${errorMessage}`
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