import fs from 'fs';
import path from 'path';

interface Settings {
  selectedModel?: string;
  [key: string]: any;
}

const SETTINGS_DIR = '.grok';
const SETTINGS_FILE = 'settings.json';

function getSettingsPath(): string {
  return path.join(process.cwd(), SETTINGS_DIR, SETTINGS_FILE);
}

function ensureSettingsDirectory(): void {
  const settingsDir = path.join(process.cwd(), SETTINGS_DIR);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }
}

const DEFAULT_SETTINGS: Settings = {
  selectedModel: 'grok-4-latest'
};

export function loadSettings(): Settings {
  try {
    ensureSettingsDirectory();
    const settingsPath = getSettingsPath();
    
    if (!fs.existsSync(settingsPath)) {
      saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    
    const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(settingsContent);
  } catch (error) {
    console.warn('Failed to load settings:', error);
    return {};
  }
}

export function saveSettings(settings: Settings): void {
  try {
    ensureSettingsDirectory();
    const settingsPath = getSettingsPath();
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const currentSettings = loadSettings();
  currentSettings[key] = value;
  saveSettings(currentSettings);
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  const settings = loadSettings();
  return settings[key];
}