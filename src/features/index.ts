/**
 * Grok CLI Enhanced Features
 *
 * This module exports all the enhanced features inspired by:
 * - Claude Code (slash commands, hooks, MCP config)
 * - OpenAI Codex CLI (security modes, code review)
 * - Gemini CLI (persistent checkpoints, restore)
 * - Aider (voice input, multi-model)
 */

// Persistent Checkpoints (inspired by Gemini CLI)
import {
  PersistentCheckpointManager as _PersistentCheckpointManager,
  getPersistentCheckpointManager as _getPersistentCheckpointManager,
  resetPersistentCheckpointManager as _resetPersistentCheckpointManager,
} from '../checkpoints/persistent-checkpoint-manager.js';

export {
  _PersistentCheckpointManager as PersistentCheckpointManager,
  _getPersistentCheckpointManager as getPersistentCheckpointManager,
  _resetPersistentCheckpointManager as resetPersistentCheckpointManager,
};
export type {
  PersistentCheckpoint,
  FileSnapshot,
  CheckpointIndex,
  PersistentCheckpointManagerOptions
} from '../checkpoints/persistent-checkpoint-manager.js';

// Slash Commands (inspired by Claude Code)
import {
  SlashCommandManager as _SlashCommandManager,
  getSlashCommandManager as _getSlashCommandManager,
  resetSlashCommandManager as _resetSlashCommandManager,
} from '../commands/slash-commands.js';

export {
  _SlashCommandManager as SlashCommandManager,
  _getSlashCommandManager as getSlashCommandManager,
  _resetSlashCommandManager as resetSlashCommandManager,
};
export type {
  SlashCommand,
  SlashCommandArgument,
  SlashCommandResult
} from '../commands/slash-commands.js';

// Hook System (inspired by Claude Code)
import {
  HookSystem as _HookSystem,
  getHookSystem as _getHookSystem,
  resetHookSystem as _resetHookSystem,
} from '../hooks/hook-system.js';

export {
  _HookSystem as HookSystem,
  _getHookSystem as getHookSystem,
  _resetHookSystem as resetHookSystem,
};
export type {
  Hook,
  HookType,
  HooksConfig,
  HookResult,
  HookContext
} from '../hooks/hook-system.js';

// Security Modes (inspired by Codex CLI)
import {
  SecurityModeManager as _SecurityModeManager,
  getSecurityModeManager as _getSecurityModeManager,
  resetSecurityModeManager as _resetSecurityModeManager,
} from '../security/security-modes.js';

export {
  _SecurityModeManager as SecurityModeManager,
  _getSecurityModeManager as getSecurityModeManager,
  _resetSecurityModeManager as resetSecurityModeManager,
};
export type {
  SecurityMode,
  SecurityModeConfig,
  ApprovalRequest,
  ApprovalResult
} from '../security/security-modes.js';

// Voice Input (inspired by Aider)
import {
  VoiceInputManager as _VoiceInputManager,
  getVoiceInputManager as _getVoiceInputManager,
  resetVoiceInputManager as _resetVoiceInputManager,
} from '../input/voice-input-enhanced.js';

export {
  _VoiceInputManager as VoiceInputManager,
  _getVoiceInputManager as getVoiceInputManager,
  _resetVoiceInputManager as resetVoiceInputManager,
};
export type {
  VoiceInputConfig,
  TranscriptionResult,
  VoiceInputState
} from '../input/voice-input-enhanced.js';

// Background Tasks (inspired by Codex CLI Cloud)
import {
  BackgroundTaskManager as _BackgroundTaskManager,
  getBackgroundTaskManager as _getBackgroundTaskManager,
  resetBackgroundTaskManager as _resetBackgroundTaskManager,
} from '../tasks/background-tasks.js';

export {
  _BackgroundTaskManager as BackgroundTaskManager,
  _getBackgroundTaskManager as getBackgroundTaskManager,
  _resetBackgroundTaskManager as resetBackgroundTaskManager,
};
export type {
  BackgroundTask,
  TaskResult,
  TaskStatus,
  TaskPriority,
  TaskListOptions
} from '../tasks/background-tasks.js';

// Project Initialization
export {
  initGrokProject,
  formatInitResult,
  type InitOptions,
  type InitResult
} from '../utils/init-project.js';

// MCP Config Extensions
export {
  loadMCPConfig,
  saveMCPConfig,
  saveProjectMCPConfig,
  createMCPConfigTemplate,
  hasProjectMCPConfig,
  getMCPConfigPaths,
  addMCPServer,
  removeMCPServer,
  getMCPServer
} from '../mcp/config.js';

/**
 * Initialize all enhanced features
 */
export function initializeEnhancedFeatures(workingDirectory: string = process.cwd()): {
  checkpoints: ReturnType<typeof _getPersistentCheckpointManager>;
  slashCommands: ReturnType<typeof _getSlashCommandManager>;
  hooks: ReturnType<typeof _getHookSystem>;
  security: ReturnType<typeof _getSecurityModeManager>;
  voiceInput: ReturnType<typeof _getVoiceInputManager>;
  tasks: ReturnType<typeof _getBackgroundTaskManager>;
} {
  return {
    checkpoints: _getPersistentCheckpointManager({ maxCheckpoints: 100 }),
    slashCommands: _getSlashCommandManager(workingDirectory),
    hooks: _getHookSystem(workingDirectory),
    security: _getSecurityModeManager(workingDirectory),
    voiceInput: _getVoiceInputManager(),
    tasks: _getBackgroundTaskManager()
  };
}

/**
 * Reset all enhanced features (useful for testing)
 */
export function resetAllEnhancedFeatures(): void {
  _resetPersistentCheckpointManager();
  _resetSlashCommandManager();
  _resetHookSystem();
  _resetSecurityModeManager();
  _resetVoiceInputManager();
  _resetBackgroundTaskManager();
}

/**
 * Get feature status summary
 */
export function getFeatureStatusSummary(): string {
  const checkpoints = _getPersistentCheckpointManager();
  const slashCommands = _getSlashCommandManager();
  const hooks = _getHookSystem();
  const security = _getSecurityModeManager();
  const voiceInput = _getVoiceInputManager();
  const tasks = _getBackgroundTaskManager();

  const checkpointStats = checkpoints.getStats();
  const taskStats = tasks.getStats();

  let output = '🌟 Grok CLI Enhanced Features\n' + '═'.repeat(60) + '\n\n';

  output += '📸 Persistent Checkpoints\n';
  output += `   • ${checkpointStats.count} checkpoints stored\n`;
  output += `   • Storage: ${checkpoints.getHistoryDir()}\n\n`;

  output += '📚 Slash Commands\n';
  output += `   • ${slashCommands.getCommands().length} commands available\n`;
  output += `   • Built-in + custom from .grok/commands/\n\n`;

  output += '🪝 Hook System\n';
  output += `   • Status: ${hooks.isEnabled() ? '✅ Enabled' : '❌ Disabled'}\n`;
  output += `   • ${Array.from(hooks.getAllHooks().values()).flat().length} hooks configured\n\n`;

  output += '🛡️ Security Mode\n';
  output += `   • Current: ${security.getMode().toUpperCase()}\n`;
  output += `   • Network: ${security.getConfig().networkDisabled ? 'Disabled' : 'Enabled'}\n\n`;

  output += '🎤 Voice Input\n';
  output += `   • Status: ${voiceInput.isEnabled() ? '✅ Enabled' : '❌ Disabled'}\n`;
  output += `   • Provider: ${voiceInput.getConfig().provider}\n\n`;

  output += '📋 Background Tasks\n';
  output += `   • Total: ${taskStats.total} | Running: ${taskStats.running} | Pending: ${taskStats.pending}\n`;

  output += '\n' + '─'.repeat(60) + '\n';
  output += '💡 Use /help to see all available commands';

  return output;
}
