/**
 * Agent Mode System
 *
 * Modes:
 * - plan: AI only plans and explains, no file modifications
 * - code: AI can execute all tools (default)
 * - ask: AI only answers questions, no tool usage
 */

export type AgentMode = 'plan' | 'code' | 'ask';

export interface ModeConfig {
  name: AgentMode;
  description: string;
  allowedTools: string[] | 'all' | 'none';
  systemPromptAddition: string;
}

export const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  plan: {
    name: 'plan',
    description: 'Planning mode - AI explains approach without making changes',
    allowedTools: ['view_file', 'search', 'web_search', 'web_fetch'],
    systemPromptAddition: `
CURRENT MODE: PLANNING MODE
In this mode, you should:
- Analyze the request and create a detailed plan
- Explain your approach step by step
- List all files that would need to be modified
- Describe the changes you would make
- DO NOT execute any file modifications or bash commands
- Only use view_file and search to understand the codebase
- When ready to implement, tell the user to switch to /code mode`
  },
  code: {
    name: 'code',
    description: 'Code mode - AI can execute all tools (default)',
    allowedTools: 'all',
    systemPromptAddition: ''
  },
  ask: {
    name: 'ask',
    description: 'Ask mode - AI only answers questions, no tool usage',
    allowedTools: 'none',
    systemPromptAddition: `
CURRENT MODE: ASK MODE
In this mode, you should:
- Only answer questions based on your knowledge
- DO NOT use any tools
- If the user asks to make changes, tell them to switch to /code mode
- Provide explanations, suggestions, and guidance without executing actions`
  }
};

export class AgentModeManager {
  private currentMode: AgentMode = 'code';
  private listeners: ((mode: AgentMode) => void)[] = [];

  getMode(): AgentMode {
    return this.currentMode;
  }

  setMode(mode: AgentMode): void {
    this.currentMode = mode;
    this.listeners.forEach(listener => listener(mode));
  }

  getModeConfig(): ModeConfig {
    return MODE_CONFIGS[this.currentMode];
  }

  isToolAllowed(toolName: string): boolean {
    const config = this.getModeConfig();

    if (config.allowedTools === 'all') return true;
    if (config.allowedTools === 'none') return false;

    return config.allowedTools.includes(toolName);
  }

  getSystemPromptAddition(): string {
    return this.getModeConfig().systemPromptAddition;
  }

  onModeChange(listener: (mode: AgentMode) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  formatModeStatus(): string {
    const config = this.getModeConfig();
    const modeEmojis: Record<AgentMode, string> = {
      plan: '📋',
      code: '💻',
      ask: '❓'
    };
    return `${modeEmojis[this.currentMode]} Mode: ${this.currentMode} - ${config.description}`;
  }

  static getModeHelp(): string {
    return Object.values(MODE_CONFIGS)
      .map(config => `  /${config.name} - ${config.description}`)
      .join('\n');
  }
}

// Singleton instance
let modeManagerInstance: AgentModeManager | null = null;

export function getAgentModeManager(): AgentModeManager {
  if (!modeManagerInstance) {
    modeManagerInstance = new AgentModeManager();
  }
  return modeManagerInstance;
}
