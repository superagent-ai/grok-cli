import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { getPersistenceManager } from './persistence-manager';

export interface ConfirmationPreferences {
  fileOperations: 'always' | 'never' | 'ask';
  bashCommands: 'always' | 'never' | 'ask';
  allOperations: 'always' | 'never' | 'ask';
  rememberSessionChoices: boolean;
}

export interface ContextSettings {
  maxTokens: number;
  bufferTokens: number;
  minRecentTurns: number;
  enablePersistence: boolean;
}

export interface UserSettings {
  apiKey?: string;
  defaultModel?: string;
  confirmationPreferences: ConfirmationPreferences;
  contextSettings: ContextSettings;
  lastWorkingDirectory?: string;
  version: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  confirmationPreferences: {
    fileOperations: 'ask',
    bashCommands: 'ask', 
    allOperations: 'ask',
    rememberSessionChoices: true
  },
  contextSettings: {
    maxTokens: 120000,
    bufferTokens: 8000,
    minRecentTurns: 2,
    enablePersistence: true
  },
  version: '1.0.0'
};

export class UserSettingsManager {
  private static instance: UserSettingsManager;
  private persistenceManager = getPersistenceManager();
  private readonly SETTINGS_FILE = 'user-settings.json';
  private settings: UserSettings;
  private initialized = false;
  private initializing = false;

  constructor() {
    this.settings = { ...DEFAULT_USER_SETTINGS };
  }

  static getInstance(): UserSettingsManager {
    if (!UserSettingsManager.instance) {
      UserSettingsManager.instance = new UserSettingsManager();
    }
    return UserSettingsManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;
    try {
      await this.persistenceManager.initialize();
      await this.loadSettings();
      this.initialized = true;
      console.log('User settings initialized');
    } catch (error) {
      console.warn('Failed to initialize user settings:', error);
      this.initialized = true; // Continue with defaults
    } finally {
      this.initializing = false;
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const savedSettings = await this.persistenceManager.load<UserSettings>(this.SETTINGS_FILE);
      
      if (savedSettings) {
        // Merge with defaults to ensure all properties exist
        this.settings = {
          ...DEFAULT_USER_SETTINGS,
          ...savedSettings,
          confirmationPreferences: {
            ...DEFAULT_USER_SETTINGS.confirmationPreferences,
            ...savedSettings.confirmationPreferences
          },
          contextSettings: {
            ...DEFAULT_USER_SETTINGS.contextSettings,
            ...savedSettings.contextSettings
          }
        };

        // Handle version migration if needed
        await this.migrateSettings();
      } else {
        // No settings file exists, save defaults
        await this.saveSettings();
      }
    } catch (error) {
      console.warn('Failed to load user settings, using defaults:', error);
    }
  }

  private async migrateSettings(): Promise<void> {
    // Handle migration from older versions
    if (!this.settings.version || this.settings.version < '1.0.0') {
      console.log('Migrating user settings to version 1.0.0');
      
      // Add any migration logic here for future versions
      this.settings.version = '1.0.0';
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await this.persistenceManager.save(this.SETTINGS_FILE, this.settings);
    } catch (error) {
      console.error('Failed to save user settings:', error);
    }
  }

  // Getters
  getSettings(): UserSettings {
    return { ...this.settings };
  }

  getApiKey(): string | undefined {
    return this.settings.apiKey;
  }

  getConfirmationPreferences(): ConfirmationPreferences {
    return { ...this.settings.confirmationPreferences };
  }

  getContextSettings(): ContextSettings {
    return { ...this.settings.contextSettings };
  }

  getDefaultModel(): string | undefined {
    return this.settings.defaultModel;
  }

  getLastWorkingDirectory(): string | undefined {
    return this.settings.lastWorkingDirectory;
  }

  // Setters
  async setApiKey(apiKey: string): Promise<void> {
    await this.initialize();
    this.settings.apiKey = apiKey;
    await this.saveSettings();
  }

  async setDefaultModel(model: string): Promise<void> {
    await this.initialize();
    this.settings.defaultModel = model;
    await this.saveSettings();
  }

  async setConfirmationPreferences(preferences: Partial<ConfirmationPreferences>): Promise<void> {
    await this.initialize();
    this.settings.confirmationPreferences = {
      ...this.settings.confirmationPreferences,
      ...preferences
    };
    await this.saveSettings();
  }

  async setContextSettings(contextSettings: Partial<ContextSettings>): Promise<void> {
    await this.initialize();
    this.settings.contextSettings = {
      ...this.settings.contextSettings,
      ...contextSettings
    };
    await this.saveSettings();
  }

  async setLastWorkingDirectory(directory: string): Promise<void> {
    await this.initialize();
    this.settings.lastWorkingDirectory = directory;
    await this.saveSettings();
  }

  // Utility methods
  async resetToDefaults(): Promise<void> {
    const apiKey = this.settings.apiKey; // Preserve API key
    this.settings = {
      ...DEFAULT_USER_SETTINGS,
      apiKey
    };
    await this.saveSettings();
  }

  async exportSettings(): Promise<string> {
    await this.initialize();
    // Export settings without sensitive data like API key
    const exportData = {
      ...this.settings,
      apiKey: undefined
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importSettings(settingsJson: string): Promise<boolean> {
    try {
      const importedSettings = JSON.parse(settingsJson);
      
      // Validate the imported settings structure
      if (this.validateSettings(importedSettings)) {
        const apiKey = this.settings.apiKey; // Preserve current API key
        
        this.settings = {
          ...DEFAULT_USER_SETTINGS,
          ...importedSettings,
          apiKey, // Keep current API key
          confirmationPreferences: {
            ...DEFAULT_USER_SETTINGS.confirmationPreferences,
            ...importedSettings.confirmationPreferences
          },
          contextSettings: {
            ...DEFAULT_USER_SETTINGS.contextSettings,
            ...importedSettings.contextSettings
          }
        };
        
        await this.saveSettings();
        return true;
      }
    } catch (error) {
      console.error('Failed to import settings:', error);
    }
    return false;
  }

  private validateSettings(settings: any): boolean {
    // Basic validation of settings structure
    if (!settings || typeof settings !== 'object') return false;
    
    // Validate confirmation preferences if present
    if (settings.confirmationPreferences) {
      const prefs = settings.confirmationPreferences;
      const validValues = ['always', 'never', 'ask'];
      
      if (prefs.fileOperations && !validValues.includes(prefs.fileOperations)) return false;
      if (prefs.bashCommands && !validValues.includes(prefs.bashCommands)) return false;
      if (prefs.allOperations && !validValues.includes(prefs.allOperations)) return false;
    }
    
    // Validate context settings if present
    if (settings.contextSettings) {
      const context = settings.contextSettings;
      
      if (context.maxTokens && (typeof context.maxTokens !== 'number' || context.maxTokens < 1000)) return false;
      if (context.bufferTokens && (typeof context.bufferTokens !== 'number' || context.bufferTokens < 0)) return false;
      if (context.minRecentTurns && (typeof context.minRecentTurns !== 'number' || context.minRecentTurns < 0)) return false;
    }
    
    return true;
  }
}

// Singleton instance
export function getUserSettingsManager(): UserSettingsManager {
  return UserSettingsManager.getInstance();
}