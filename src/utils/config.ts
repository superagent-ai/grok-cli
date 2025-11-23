/**
 * Configuration management with cascading priority:
 * 1. Command line arguments (highest priority)
 * 2. Environment variables
 * 3. User settings (~/.grok/user-settings.json)
 * 4. Project settings (./.grok/settings.json)
 * 5. Default values (lowest priority)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PATHS } from '../config/constants.js';

export interface UserSettings {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  [key: string]: any;
}

export interface ConfigOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  directory?: string;
}

/**
 * Get the user settings directory path
 */
function getUserSettingsDir(): string {
  return path.join(os.homedir(), PATHS.SETTINGS_DIR);
}

/**
 * Get the user settings file path
 */
function getUserSettingsPath(): string {
  return path.join(getUserSettingsDir(), PATHS.SETTINGS_FILE);
}

/**
 * Ensure user settings directory exists
 */
function ensureUserSettingsDirectory(): void {
  const dir = getUserSettingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load user settings from ~/.grok/user-settings.json
 */
export function loadUserSettings(): UserSettings {
  try {
    ensureUserSettingsDirectory();
    const settingsPath = getUserSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      // Create default settings file
      const defaultSettings: UserSettings = {
        apiKey: '',
        baseURL: '',
        defaultModel: 'grok-4-latest',
      };
      saveUserSettings(defaultSettings);
      return defaultSettings;
    }

    const content = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load user settings:', error);
    return {};
  }
}

/**
 * Save user settings to ~/.grok/user-settings.json
 */
export function saveUserSettings(settings: UserSettings): void {
  try {
    ensureUserSettingsDirectory();
    const settingsPath = getUserSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save user settings:', error);
  }
}

/**
 * Update a specific user setting
 */
export function updateUserSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): void {
  const settings = loadUserSettings();
  settings[key] = value;
  saveUserSettings(settings);
}

/**
 * Get a specific user setting
 */
export function getUserSetting<K extends keyof UserSettings>(
  key: K
): UserSettings[K] {
  const settings = loadUserSettings();
  return settings[key];
}

/**
 * Resolve configuration with cascading priority
 */
export function resolveConfig(options: ConfigOptions = {}): {
  apiKey: string | undefined;
  baseURL: string | undefined;
  model: string | undefined;
} {
  const userSettings = loadUserSettings();

  // API Key resolution (CLI > ENV > User Settings)
  const apiKey =
    options.apiKey ||
    process.env.GROK_API_KEY ||
    process.env.XAI_API_KEY ||
    userSettings.apiKey;

  // Base URL resolution (CLI > ENV > User Settings)
  const baseURL =
    options.baseURL ||
    process.env.GROK_BASE_URL ||
    userSettings.baseURL ||
    undefined;

  // Model resolution (CLI > User Settings > Default)
  const model = options.model || userSettings.defaultModel || 'grok-4-latest';

  return { apiKey, baseURL, model };
}

/**
 * Validate that required configuration is present
 */
export function validateConfig(config: {
  apiKey: string | undefined;
  baseURL: string | undefined;
  model: string | undefined;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push(
      'No API key found. Set GROK_API_KEY or XAI_API_KEY environment variable, ' +
        'provide --api-key flag, or add apiKey to ~/.grok/user-settings.json'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration help text
 */
export function getConfigHelp(): string {
  return `
Configuration Priority (highest to lowest):
1. Command line arguments (--api-key, --base-url, --model)
2. Environment variables (GROK_API_KEY, GROK_BASE_URL)
3. User settings (~/.grok/user-settings.json)
4. Default values

User Settings Location: ${getUserSettingsPath()}

To set up your API key:
  export GROK_API_KEY=your_key_here
  OR
  echo '{"apiKey": "your_key_here"}' > ~/.grok/user-settings.json
`;
}
