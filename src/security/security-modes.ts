import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

/**
 * Security Modes - Inspired by OpenAI Codex CLI
 * Three levels of autonomy with different approval requirements
 */
export type SecurityMode = 'suggest' | 'auto-edit' | 'full-auto';

export interface SecurityModeConfig {
  mode: SecurityMode;
  networkDisabled: boolean;
  directoryRestricted: boolean;
  allowedDirectories: string[];
  blockedCommands: string[];
  blockedPaths: string[];
  requireApproval: {
    fileRead: boolean;
    fileWrite: boolean;
    fileCreate: boolean;
    fileDelete: boolean;
    bashCommand: boolean;
    networkRequest: boolean;
  };
}

export interface ApprovalRequest {
  type: 'file-read' | 'file-write' | 'file-create' | 'file-delete' | 'bash' | 'network';
  resource: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ApprovalResult {
  approved: boolean;
  remember?: boolean;
  reason?: string;
}

const MODE_CONFIGS: Record<SecurityMode, Partial<SecurityModeConfig>> = {
  /**
   * Suggest Mode (Default - Most Restrictive)
   * - Read-only by default
   * - Requires approval for ALL write operations and commands
   * - Best for reviewing AI suggestions before applying
   */
  'suggest': {
    networkDisabled: false,
    directoryRestricted: true,
    requireApproval: {
      fileRead: false,
      fileWrite: true,
      fileCreate: true,
      fileDelete: true,
      bashCommand: true,
      networkRequest: false
    }
  },

  /**
   * Auto Edit Mode (Balanced)
   * - Automatically applies file edits
   * - Still requires approval for bash commands
   * - Good balance between automation and safety
   */
  'auto-edit': {
    networkDisabled: false,
    directoryRestricted: true,
    requireApproval: {
      fileRead: false,
      fileWrite: false,
      fileCreate: false,
      fileDelete: true,
      bashCommand: true,
      networkRequest: false
    }
  },

  /**
   * Full Auto Mode (Most Permissive but Sandboxed)
   * - Fully autonomous operation
   * - Network disabled by default for safety
   * - Directory sandboxed
   * - Use with caution
   */
  'full-auto': {
    networkDisabled: true,
    directoryRestricted: true,
    requireApproval: {
      fileRead: false,
      fileWrite: false,
      fileCreate: false,
      fileDelete: false,
      bashCommand: false,
      networkRequest: true
    }
  }
};

/**
 * Dangerous commands that always require approval regardless of mode
 */
const ALWAYS_BLOCK_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'rm -rf ~/*',
  'dd if=',
  'mkfs',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
  ':(){:|:&};:',
  'wget.*|.*sh',
  'curl.*|.*sh',
  'sudo rm',
  'sudo dd',
  'sudo mkfs'
];

/**
 * Paths that are always blocked from modification
 */
const ALWAYS_BLOCK_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '~/.ssh',
  '~/.gnupg',
  '~/.aws/credentials',
  '~/.config/gcloud',
  '/boot',
  '/sys',
  '/proc'
];

/**
 * Security Mode Manager
 */
export class SecurityModeManager extends EventEmitter {
  private mode: SecurityMode;
  private config: SecurityModeConfig;
  private workingDirectory: string;
  private approvedOperations: Set<string> = new Set();
  private deniedOperations: Set<string> = new Set();

  constructor(workingDirectory: string = process.cwd(), initialMode: SecurityMode = 'suggest') {
    super();
    this.workingDirectory = workingDirectory;
    this.mode = initialMode;
    this.config = this.buildConfig(initialMode);
    this.loadSavedConfig();
  }

  /**
   * Build configuration for a mode
   */
  private buildConfig(mode: SecurityMode): SecurityModeConfig {
    const modeConfig = MODE_CONFIGS[mode];

    return {
      mode,
      networkDisabled: modeConfig.networkDisabled ?? false,
      directoryRestricted: modeConfig.directoryRestricted ?? true,
      allowedDirectories: [this.workingDirectory],
      blockedCommands: [...ALWAYS_BLOCK_COMMANDS],
      blockedPaths: [...ALWAYS_BLOCK_PATHS],
      requireApproval: modeConfig.requireApproval ?? {
        fileRead: false,
        fileWrite: true,
        fileCreate: true,
        fileDelete: true,
        bashCommand: true,
        networkRequest: false
      }
    };
  }

  /**
   * Load saved configuration from file
   */
  private loadSavedConfig(): void {
    const configPath = path.join(this.workingDirectory, '.grok', 'security.json');

    if (fs.existsSync(configPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (saved.mode && MODE_CONFIGS[saved.mode as SecurityMode]) {
          this.mode = saved.mode;
          this.config = this.buildConfig(this.mode);

          // Merge custom settings
          if (saved.allowedDirectories) {
            this.config.allowedDirectories = [
              ...this.config.allowedDirectories,
              ...saved.allowedDirectories
            ];
          }
          if (saved.blockedCommands) {
            this.config.blockedCommands = [
              ...this.config.blockedCommands,
              ...saved.blockedCommands
            ];
          }
          if (saved.blockedPaths) {
            this.config.blockedPaths = [
              ...this.config.blockedPaths,
              ...saved.blockedPaths
            ];
          }
        }
      } catch (error) {
        // Use defaults if config can't be loaded
      }
    }
  }

  /**
   * Save current configuration
   */
  saveConfig(): void {
    const configPath = path.join(this.workingDirectory, '.grok', 'security.json');
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configToSave = {
      mode: this.mode,
      allowedDirectories: this.config.allowedDirectories.filter(
        d => d !== this.workingDirectory
      ),
      blockedCommands: this.config.blockedCommands.filter(
        c => !ALWAYS_BLOCK_COMMANDS.includes(c)
      ),
      blockedPaths: this.config.blockedPaths.filter(
        p => !ALWAYS_BLOCK_PATHS.includes(p)
      )
    };

    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
  }

  /**
   * Get current security mode
   */
  getMode(): SecurityMode {
    return this.mode;
  }

  /**
   * Set security mode
   */
  setMode(mode: SecurityMode): void {
    if (!MODE_CONFIGS[mode]) {
      throw new Error(`Invalid security mode: ${mode}`);
    }

    this.mode = mode;
    this.config = this.buildConfig(mode);
    this.approvedOperations.clear();
    this.deniedOperations.clear();

    this.emit('mode-changed', mode);
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityModeConfig {
    return { ...this.config };
  }

  /**
   * Check if an operation requires approval
   */
  requiresApproval(request: ApprovalRequest): boolean {
    // Check if already approved/denied this session
    const operationKey = `${request.type}:${request.resource}`;

    if (this.approvedOperations.has(operationKey)) {
      return false;
    }
    if (this.deniedOperations.has(operationKey)) {
      return true; // Will be denied again
    }

    // Check based on operation type
    switch (request.type) {
      case 'file-read':
        return this.config.requireApproval.fileRead;
      case 'file-write':
        return this.config.requireApproval.fileWrite;
      case 'file-create':
        return this.config.requireApproval.fileCreate;
      case 'file-delete':
        return this.config.requireApproval.fileDelete;
      case 'bash':
        // Always require approval for dangerous commands
        if (this.isBlockedCommand(request.resource)) {
          return true;
        }
        return this.config.requireApproval.bashCommand;
      case 'network':
        return this.config.requireApproval.networkRequest || this.config.networkDisabled;
      default:
        return true;
    }
  }

  /**
   * Validate an operation
   */
  validateOperation(request: ApprovalRequest): { valid: boolean; reason?: string } {
    // Check blocked commands
    if (request.type === 'bash' && this.isBlockedCommand(request.resource)) {
      return {
        valid: false,
        reason: `Command is blocked for security: ${request.resource}`
      };
    }

    // Check blocked paths
    if (['file-write', 'file-create', 'file-delete'].includes(request.type)) {
      if (this.isBlockedPath(request.resource)) {
        return {
          valid: false,
          reason: `Path is blocked for security: ${request.resource}`
        };
      }
    }

    // Check directory restrictions
    if (this.config.directoryRestricted &&
        ['file-write', 'file-create', 'file-delete'].includes(request.type)) {
      if (!this.isInAllowedDirectory(request.resource)) {
        return {
          valid: false,
          reason: `Path is outside allowed directories: ${request.resource}`
        };
      }
    }

    // Check network restrictions
    if (request.type === 'network' && this.config.networkDisabled) {
      return {
        valid: false,
        reason: 'Network access is disabled in current security mode'
      };
    }

    return { valid: true };
  }

  /**
   * Record an approval decision
   */
  recordApproval(request: ApprovalRequest, result: ApprovalResult): void {
    const operationKey = `${request.type}:${request.resource}`;

    if (result.approved) {
      if (result.remember) {
        this.approvedOperations.add(operationKey);
      }
    } else {
      if (result.remember) {
        this.deniedOperations.add(operationKey);
      }
    }

    this.emit('approval-recorded', { request, result });
  }

  /**
   * Check if a command is blocked
   */
  private isBlockedCommand(command: string): boolean {
    const normalizedCommand = command.toLowerCase().trim();

    return this.config.blockedCommands.some(blocked => {
      // Support regex patterns
      if (blocked.includes('.*')) {
        try {
          const regex = new RegExp(blocked, 'i');
          return regex.test(normalizedCommand);
        } catch {
          return normalizedCommand.includes(blocked);
        }
      }
      return normalizedCommand.includes(blocked.toLowerCase());
    });
  }

  /**
   * Check if a path is blocked
   */
  private isBlockedPath(filePath: string): boolean {
    const normalizedPath = path.resolve(filePath);
    const homedir = os.homedir();

    return this.config.blockedPaths.some(blocked => {
      const expandedBlocked = blocked.replace(/^~/, homedir);
      const normalizedBlocked = path.resolve(expandedBlocked);

      return normalizedPath.startsWith(normalizedBlocked) ||
             normalizedPath === normalizedBlocked;
    });
  }

  /**
   * Check if a path is in allowed directories
   */
  private isInAllowedDirectory(filePath: string): boolean {
    const normalizedPath = path.resolve(filePath);

    return this.config.allowedDirectories.some(allowed => {
      const normalizedAllowed = path.resolve(allowed);
      return normalizedPath.startsWith(normalizedAllowed);
    });
  }

  /**
   * Add an allowed directory
   */
  addAllowedDirectory(directory: string): void {
    const normalizedDir = path.resolve(directory);
    if (!this.config.allowedDirectories.includes(normalizedDir)) {
      this.config.allowedDirectories.push(normalizedDir);
    }
  }

  /**
   * Add a blocked command pattern
   */
  addBlockedCommand(command: string): void {
    if (!this.config.blockedCommands.includes(command)) {
      this.config.blockedCommands.push(command);
    }
  }

  /**
   * Add a blocked path
   */
  addBlockedPath(pathPattern: string): void {
    if (!this.config.blockedPaths.includes(pathPattern)) {
      this.config.blockedPaths.push(pathPattern);
    }
  }

  /**
   * Clear session approvals
   */
  clearSessionApprovals(): void {
    this.approvedOperations.clear();
    this.deniedOperations.clear();
  }

  /**
   * Get risk level for an operation
   */
  getRiskLevel(request: ApprovalRequest): 'low' | 'medium' | 'high' {
    // File deletion is always high risk
    if (request.type === 'file-delete') {
      return 'high';
    }

    // Bash commands can be high risk
    if (request.type === 'bash') {
      const cmd = request.resource.toLowerCase();
      if (cmd.includes('rm') || cmd.includes('sudo') || cmd.includes('chmod') ||
          cmd.includes('chown') || cmd.includes('dd') || cmd.includes('mv')) {
        return 'high';
      }
      if (cmd.includes('npm') || cmd.includes('pip') || cmd.includes('git push') ||
          cmd.includes('git commit')) {
        return 'medium';
      }
      return 'low';
    }

    // Network requests can be medium/high risk
    if (request.type === 'network') {
      return 'medium';
    }

    // File writes are medium risk
    if (request.type === 'file-write' || request.type === 'file-create') {
      // Writing to config files is higher risk
      if (request.resource.includes('config') || request.resource.includes('.env') ||
          request.resource.endsWith('.json') || request.resource.endsWith('.yaml')) {
        return 'medium';
      }
      return 'low';
    }

    return 'low';
  }

  /**
   * Format status for display
   */
  formatStatus(): string {
    const modeEmojis: Record<SecurityMode, string> = {
      'suggest': '🔒',
      'auto-edit': '⚡',
      'full-auto': '🚀'
    };

    const modeDescriptions: Record<SecurityMode, string> = {
      'suggest': 'Suggest Mode - All changes require approval',
      'auto-edit': 'Auto Edit Mode - Files auto-edit, bash requires approval',
      'full-auto': 'Full Auto Mode - Autonomous but sandboxed'
    };

    let output = '🛡️ Security Mode Status\n' + '═'.repeat(50) + '\n\n';
    output += `Current Mode: ${modeEmojis[this.mode]} ${this.mode.toUpperCase()}\n`;
    output += `${modeDescriptions[this.mode]}\n\n`;

    output += '📋 Approval Requirements:\n';
    output += `  • File Read: ${this.config.requireApproval.fileRead ? '✋ Required' : '✅ Auto'}\n`;
    output += `  • File Write: ${this.config.requireApproval.fileWrite ? '✋ Required' : '✅ Auto'}\n`;
    output += `  • File Create: ${this.config.requireApproval.fileCreate ? '✋ Required' : '✅ Auto'}\n`;
    output += `  • File Delete: ${this.config.requireApproval.fileDelete ? '✋ Required' : '✅ Auto'}\n`;
    output += `  • Bash Command: ${this.config.requireApproval.bashCommand ? '✋ Required' : '✅ Auto'}\n`;
    output += `  • Network: ${this.config.requireApproval.networkRequest ? '✋ Required' : '✅ Auto'}\n\n`;

    output += '🔐 Restrictions:\n';
    output += `  • Network: ${this.config.networkDisabled ? '🚫 Disabled' : '✅ Enabled'}\n`;
    output += `  • Directory: ${this.config.directoryRestricted ? '📁 Restricted' : '🌐 Unrestricted'}\n`;

    output += '\n💡 Change mode with: /security <suggest|auto-edit|full-auto>';

    return output;
  }
}

// Singleton instance
let securityModeManagerInstance: SecurityModeManager | null = null;

export function getSecurityModeManager(workingDirectory?: string, initialMode?: SecurityMode): SecurityModeManager {
  if (!securityModeManagerInstance || workingDirectory) {
    securityModeManagerInstance = new SecurityModeManager(workingDirectory, initialMode);
  }
  return securityModeManagerInstance;
}

export function resetSecurityModeManager(): void {
  securityModeManagerInstance = null;
}
