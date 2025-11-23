/**
 * Grok CLI Enhanced Features
 *
 * This module exports all the enhanced features inspired by:
 * - Claude Code (slash commands, hooks, MCP config)
 * - OpenAI Codex CLI (security modes, code review)
 * - Gemini CLI (persistent checkpoints, restore)
 * - Aider (voice input, multi-model)
 */

// Import for local use
import {
  PersistentCheckpointManager as PCM,
  getPersistentCheckpointManager as getPCM,
  resetPersistentCheckpointManager as resetPCM,
} from '../checkpoints/persistent-checkpoint-manager.js';

import {
  SlashCommandManager as SCM,
  getSlashCommandManager as getSCM,
  resetSlashCommandManager as resetSCM,
} from '../commands/slash-commands.js';

import {
  HookSystem as HS,
  getHookSystem as getHS,
  resetHookSystem as resetHS,
} from '../hooks/hook-system.js';

import {
  SecurityModeManager as SMM,
  getSecurityModeManager as getSMM,
  resetSecurityModeManager as resetSMM,
} from '../security/security-modes.js';

import {
  VoiceInputManager as VIM,
  getVoiceInputManager as getVIM,
  resetVoiceInputManager as resetVIM,
} from '../input/voice-input-enhanced.js';

import {
  BackgroundTaskManager as BTM,
  getBackgroundTaskManager as getBTM,
  resetBackgroundTaskManager as resetBTM,
} from '../tasks/background-tasks.js';

// Re-export everything

// Persistent Checkpoints (inspired by Gemini CLI)
export {
  PersistentCheckpointManager,
  getPersistentCheckpointManager,
  resetPersistentCheckpointManager,
  type PersistentCheckpoint,
  type FileSnapshot,
  type CheckpointIndex,
  type PersistentCheckpointManagerOptions
} from '../checkpoints/persistent-checkpoint-manager.js';

// Slash Commands (inspired by Claude Code)
export {
  SlashCommandManager,
  getSlashCommandManager,
  resetSlashCommandManager,
  type SlashCommand,
  type SlashCommandArgument,
  type SlashCommandResult
} from '../commands/slash-commands.js';

// Hook System (inspired by Claude Code)
export {
  HookSystem,
  getHookSystem,
  resetHookSystem,
  type Hook,
  type HookType,
  type HooksConfig,
  type HookResult,
  type HookContext
} from '../hooks/hook-system.js';

// Security Modes (inspired by Codex CLI)
export {
  SecurityModeManager,
  getSecurityModeManager,
  resetSecurityModeManager,
  type SecurityMode,
  type SecurityModeConfig,
  type ApprovalRequest,
  type ApprovalResult
} from '../security/security-modes.js';

// Voice Input (inspired by Aider)
export {
  VoiceInputManager,
  getVoiceInputManager,
  resetVoiceInputManager,
  type VoiceInputConfig,
  type TranscriptionResult,
  type VoiceInputState
} from '../input/voice-input-enhanced.js';

// Background Tasks (inspired by Codex CLI Cloud)
export {
  BackgroundTaskManager,
  getBackgroundTaskManager,
  resetBackgroundTaskManager,
  type BackgroundTask,
  type TaskResult,
  type TaskStatus,
  type TaskPriority,
  type TaskListOptions
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
  checkpoints: ReturnType<typeof getPCM>;
  slashCommands: ReturnType<typeof getSCM>;
  hooks: ReturnType<typeof getHS>;
  security: ReturnType<typeof getSMM>;
  voiceInput: ReturnType<typeof getVIM>;
  tasks: ReturnType<typeof getBTM>;
} {
  return {
    checkpoints: getPCM({ maxCheckpoints: 100 }),
    slashCommands: getSCM(workingDirectory),
    hooks: getHS(workingDirectory),
    security: getSMM(workingDirectory),
    voiceInput: getVIM(),
    tasks: getBTM()
  };
}

/**
 * Reset all enhanced features (useful for testing)
 */
export function resetAllEnhancedFeatures(): void {
  resetPCM();
  resetSCM();
  resetHS();
  resetSMM();
  resetVIM();
  resetBTM();
}

/**
 * Get feature status summary
 */
export function getFeatureStatusSummary(): string {
  const checkpoints = getPCM();
  const slashCommands = getSCM();
  const hooks = getHS();
  const security = getSMM();
  const voiceInput = getVIM();
  const tasks = getBTM();

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
