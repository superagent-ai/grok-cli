/**
 * Model validation and utility functions
 */

import { SUPPORTED_MODELS } from '../config/constants.js';
import { ValidationError } from './errors.js';

export type ModelName = keyof typeof SUPPORTED_MODELS;
export type ModelProvider = 'xai' | 'anthropic' | 'google' | 'unknown';

export interface ModelInfo {
  maxTokens: number;
  provider: ModelProvider;
  isSupported: boolean;
}

/**
 * Check if a model is officially supported
 */
export function isSupportedModel(model: string): model is ModelName {
  return model in SUPPORTED_MODELS;
}

/**
 * Get information about a model
 */
export function getModelInfo(model: string): ModelInfo {
  if (isSupportedModel(model)) {
    return {
      ...SUPPORTED_MODELS[model],
      isSupported: true,
    };
  }

  // Return default info for unknown models
  return {
    maxTokens: 8192,
    provider: 'unknown',
    isSupported: false,
  };
}

/**
 * Validate a model name and throw if invalid
 * @param model Model name to validate
 * @param strict If true, only accept officially supported models
 */
export function validateModel(model: string, strict: boolean = false): void {
  if (!model || model.trim() === '') {
    throw new ValidationError('Model name cannot be empty', 'model', model);
  }

  if (strict && !isSupportedModel(model)) {
    const supportedList = Object.keys(SUPPORTED_MODELS).join(', ');
    throw new ValidationError(
      `Unsupported model: ${model}. Supported models: ${supportedList}`,
      'model',
      model
    );
  }
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: ModelProvider = 'xai'): string {
  switch (provider) {
    case 'xai':
      return 'grok-beta';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'google':
      return 'gemini-2.5-pro';
    default:
      return 'grok-beta';
  }
}

/**
 * Get a list of all supported models
 */
export function getSupportedModels(): ModelName[] {
  return Object.keys(SUPPORTED_MODELS) as ModelName[];
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: ModelProvider): string[] {
  return Object.entries(SUPPORTED_MODELS)
    .filter(([_, info]) => info.provider === provider)
    .map(([name]) => name);
}

/**
 * Suggest a model based on a partial name (fuzzy matching)
 */
export function suggestModel(partial: string): string[] {
  const lowerPartial = partial.toLowerCase();
  const models = getSupportedModels();

  // Exact match first
  const exactMatch = models.filter((m) => m.toLowerCase() === lowerPartial);
  if (exactMatch.length > 0) return exactMatch;

  // Starts with
  const startsWith = models.filter((m) =>
    m.toLowerCase().startsWith(lowerPartial)
  );
  if (startsWith.length > 0) return startsWith;

  // Contains
  const contains = models.filter((m) => m.toLowerCase().includes(lowerPartial));
  return contains;
}

/**
 * Format model information for display
 */
export function formatModelInfo(model: string): string {
  const info = getModelInfo(model);

  let output = `Model: ${model}\n`;
  output += `Provider: ${info.provider}\n`;
  output += `Max Tokens: ${info.maxTokens.toLocaleString()}\n`;
  output += `Supported: ${info.isSupported ? 'Yes' : 'No (using default settings)'}`;

  return output;
}
