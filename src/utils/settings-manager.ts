import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * User-level settings stored in ~/.quietenable/user-settings.json
 * These are global settings that apply across all projects
 */
export interface UserSettings {
  apiKey?: string;           // OpenAI API key
  baseURL?: string;          // API base URL
  defaultModel?: string;     // User's preferred default model
  models?: string[];         // Available models list
  verbosity?: "low" | "medium" | "high"; // Response verbosity
  reasoningEffort?: "minimal" | "low" | "medium" | "high"; // Reasoning effort level
}

/**
 * Project-level settings stored in .quietenable/settings.json
 * These are project-specific settings
 */
export interface ProjectSettings {
  model?: string;            // Current model for this project
  verbosity?: "low" | "medium" | "high"; // Response verbosity for project
  reasoningEffort?: "minimal" | "low" | "medium" | "high"; // Reasoning effort for project
  mcpServers?: Record<string, any>; // MCP server configurations
}

/**
 * Default values for user settings
 */
const DEFAULT_USER_SETTINGS: Partial<UserSettings> = {
  baseURL: "https://api.openai.com/v1",
  defaultModel: "gpt-5",
  models: [
    "gpt-5",
    "grok-4-latest",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-mini-fast"
  ],
  verbosity: "medium",
  reasoningEffort: "medium"
};

/**
 * Default values for project settings
 */
const DEFAULT_PROJECT_SETTINGS: Partial<ProjectSettings> = {
  model: "gpt-5",
  verbosity: "medium",
  reasoningEffort: "medium"
};

/**
 * Unified settings manager that handles both user-level and project-level settings
 */
export class SettingsManager {
  private static instance: SettingsManager;
  
  private userSettingsPath: string;
  private projectSettingsPath: string;
  
  private constructor() {
    // User settings path: ~/.quietenable/user-settings.json
    this.userSettingsPath = path.join(os.homedir(), '.quietenable', 'user-settings.json');

    // Project settings path: .quietenable/settings.json (in current working directory)
    this.projectSettingsPath = path.join(process.cwd(), '.quietenable', 'settings.json');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }
  
  /**
   * Ensure directory exists for a given file path
   */
  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
  
  /**
   * Load user settings from ~/.quietenable/user-settings.json
   */
  public loadUserSettings(): UserSettings {
    try {
      if (!fs.existsSync(this.userSettingsPath)) {
        // Create default user settings if file doesn't exist
        this.saveUserSettings(DEFAULT_USER_SETTINGS);
        return { ...DEFAULT_USER_SETTINGS };
      }
      
      const content = fs.readFileSync(this.userSettingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_USER_SETTINGS, ...settings };
    } catch (error) {
      console.warn('Failed to load user settings:', error instanceof Error ? error.message : 'Unknown error');
      return { ...DEFAULT_USER_SETTINGS };
    }
  }
  
  /**
   * Save user settings to ~/.quietenable/user-settings.json
   */
  public saveUserSettings(settings: Partial<UserSettings>): void {
    try {
      this.ensureDirectoryExists(this.userSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };
      if (fs.existsSync(this.userSettingsPath)) {
        try {
          const content = fs.readFileSync(this.userSettingsPath, 'utf-8');
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_USER_SETTINGS, ...parsed };
        } catch {
          // If file is corrupted, use defaults
          console.warn('Corrupted user settings file, using defaults');
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.userSettingsPath,
        JSON.stringify(mergedSettings, null, 2),
        { mode: 0o600 } // Secure permissions for API key
      );
    } catch (error) {
      console.error('Failed to save user settings:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  /**
   * Update a specific user setting
   */
  public updateUserSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    const settings = { [key]: value } as Partial<UserSettings>;
    this.saveUserSettings(settings);
  }
  
  /**
   * Get a specific user setting
   */
  public getUserSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
    const settings = this.loadUserSettings();
    return settings[key];
  }
  
  /**
   * Load project settings from .quietenable/settings.json
   */
  public loadProjectSettings(): ProjectSettings {
    try {
      if (!fs.existsSync(this.projectSettingsPath)) {
        // Create default project settings if file doesn't exist
        this.saveProjectSettings(DEFAULT_PROJECT_SETTINGS);
        return { ...DEFAULT_PROJECT_SETTINGS };
      }
      
      const content = fs.readFileSync(this.projectSettingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      // Merge with defaults
      return { ...DEFAULT_PROJECT_SETTINGS, ...settings };
    } catch (error) {
      console.warn('Failed to load project settings:', error instanceof Error ? error.message : 'Unknown error');
      return { ...DEFAULT_PROJECT_SETTINGS };
    }
  }
  
  /**
   * Save project settings to .quietenable/settings.json
   */
  public saveProjectSettings(settings: Partial<ProjectSettings>): void {
    try {
      this.ensureDirectoryExists(this.projectSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
      if (fs.existsSync(this.projectSettingsPath)) {
        try {
          const content = fs.readFileSync(this.projectSettingsPath, 'utf-8');
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_PROJECT_SETTINGS, ...parsed };
        } catch {
          // If file is corrupted, use defaults
          console.warn('Corrupted project settings file, using defaults');
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.projectSettingsPath,
        JSON.stringify(mergedSettings, null, 2)
      );
    } catch (error) {
      console.error('Failed to save project settings:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  /**
   * Update a specific project setting
   */
  public updateProjectSetting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): void {
    const settings = { [key]: value } as Partial<ProjectSettings>;
    this.saveProjectSettings(settings);
  }
  
  /**
   * Get a specific project setting
   */
  public getProjectSetting<K extends keyof ProjectSettings>(key: K): ProjectSettings[K] {
    const settings = this.loadProjectSettings();
    return settings[key];
  }
  
  /**
   * Get the current model with proper fallback logic:
   * 1. Project-specific model setting
   * 2. User's default model
   * 3. System default
   */
  public getCurrentModel(): string {
    const projectModel = this.getProjectSetting('model');
    if (projectModel) {
      return projectModel;
    }
    
    const userDefaultModel = this.getUserSetting('defaultModel');
    if (userDefaultModel) {
      return userDefaultModel;
    }
    
    return DEFAULT_PROJECT_SETTINGS.model || 'gpt-5';
  }
  
  /**
   * Set the current model for the project
   */
  public setCurrentModel(model: string): void {
    this.updateProjectSetting('model', model);
  }
  
  /**
   * Get available models list from user settings
   */
  public getAvailableModels(): string[] {
    const models = this.getUserSetting('models');
    return models || DEFAULT_USER_SETTINGS.models || [];
  }

  /**
   * Get verbosity setting with precedence: env > project > user > default
   */
  public getVerbosity(): string {
    const envVerbosity = process.env.QUIETENABLE_VERBOSITY;
    if (envVerbosity) {
      return envVerbosity;
    }

    const projectVerbosity = this.getProjectSetting('verbosity');
    if (projectVerbosity) {
      return projectVerbosity;
    }

    const userVerbosity = this.getUserSetting('verbosity');
    return (
      userVerbosity ||
      DEFAULT_PROJECT_SETTINGS.verbosity ||
      'medium'
    );
  }

  /**
   * Get reasoning effort setting with precedence: env > project > user > default
   */
  public getReasoningEffort(): string {
    const envReasoning = process.env.QUIETENABLE_REASONING_EFFORT;
    if (envReasoning) {
      return envReasoning;
    }

    const projectReasoning = this.getProjectSetting('reasoningEffort');
    if (projectReasoning) {
      return projectReasoning;
    }

    const userReasoning = this.getUserSetting('reasoningEffort');
    return (
      userReasoning ||
      DEFAULT_PROJECT_SETTINGS.reasoningEffort ||
      'medium'
    );
  }
  
  /**
   * Get API key from user settings or environment
   */
  public getApiKey(): string | undefined {
    // First check environment variable
    const envApiKey = process.env.QUIETENABLE_API_KEY;
    if (envApiKey) {
      return envApiKey;
    }
    
    // Then check user settings
    return this.getUserSetting('apiKey');
  }
  
  /**
   * Get base URL from user settings or environment
   */
  public getBaseURL(): string {
    // First check environment variable
    const envBaseURL = process.env.QUIETENABLE_BASE_URL;
    if (envBaseURL) {
      return envBaseURL;
    }
    
    // Then check user settings
    const userBaseURL = this.getUserSetting('baseURL');
    return userBaseURL || DEFAULT_USER_SETTINGS.baseURL || 'https://api.openai.com/v1';
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getSettingsManager(): SettingsManager {
  return SettingsManager.getInstance();
}
