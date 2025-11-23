import { getSettingsManager, UserSettings, ProjectSettings } from './settings-manager.js';

export interface ModelOption {
  model: string;
}

export type ModelConfig = string;

// Re-export interfaces for backward compatibility
export { UserSettings, ProjectSettings };

/**
 * Get the effective current model
 * Priority: project current model > user default model > system default
 */
export function getCurrentModel(): string {
  const manager = getSettingsManager();
  return manager.getCurrentModel();
}

/**
 * Load model configuration
 * Priority: user-settings.json models > default hardcoded
 */
export function loadModelConfig(): ModelOption[] {
  const manager = getSettingsManager();
  const models = manager.getAvailableModels();

  return models.map(model => ({
    model: model.trim()
  }));
}

/**
 * Get default models list
 */
export function getDefaultModels(): string[] {
  const manager = getSettingsManager();
  return manager.getAvailableModels();
}

/**
 * Update the current model in project settings
 */
export function updateCurrentModel(modelName: string): void {
  const manager = getSettingsManager();
  manager.setCurrentModel(modelName);
}

/**
 * Update the user's default model preference
 */
export function updateDefaultModel(modelName: string): void {
  const manager = getSettingsManager();
  manager.updateUserSetting('defaultModel', modelName);
}
