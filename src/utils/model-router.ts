import * as fs from "fs-extra";
import * as path from "path";
import { EventEmitter } from "events";

export type TaskType =
  | "search"      // Fast searches
  | "planning"    // Architecture and design
  | "coding"      // Code generation/editing
  | "review"      // Code review
  | "debug"       // Debugging
  | "docs"        // Documentation
  | "chat"        // General conversation
  | "complex";    // Complex reasoning

export interface ModelConfig {
  id: string;
  name: string;
  costPer1kInput: number;    // Cost per 1k input tokens
  costPer1kOutput: number;   // Cost per 1k output tokens
  contextWindow: number;     // Max context window
  speed: "fast" | "medium" | "slow";
  capabilities: TaskType[];  // What this model is good at
}

export interface ModelRouterConfig {
  defaultModel: string;
  taskModels: Record<TaskType, string>;
  costThreshold?: number;     // Switch to cheaper model after $X spent
  autoSwitch: boolean;        // Auto-switch based on task
  preferSpeed: boolean;       // Prefer faster models
}

// Available Grok models
const GROK_MODELS: Record<string, ModelConfig> = {
  "grok-3-latest": {
    id: "grok-3-latest",
    name: "Grok 3",
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    contextWindow: 131072,
    speed: "medium",
    capabilities: ["planning", "review", "complex", "docs", "chat"],
  },
  "grok-3-fast": {
    id: "grok-3-fast",
    name: "Grok 3 Fast",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.009,
    contextWindow: 131072,
    speed: "fast",
    capabilities: ["coding", "search", "debug", "chat"],
  },
  "grok-code-fast-1": {
    id: "grok-code-fast-1",
    name: "Grok Code Fast",
    costPer1kInput: 0.002,
    costPer1kOutput: 0.006,
    contextWindow: 65536,
    speed: "fast",
    capabilities: ["coding", "search", "debug"],
  },
  "grok-2-latest": {
    id: "grok-2-latest",
    name: "Grok 2",
    costPer1kInput: 0.002,
    costPer1kOutput: 0.010,
    contextWindow: 131072,
    speed: "medium",
    capabilities: ["coding", "chat", "docs"],
  },
};

const DEFAULT_ROUTER_CONFIG: ModelRouterConfig = {
  defaultModel: "grok-code-fast-1",
  taskModels: {
    search: "grok-code-fast-1",
    planning: "grok-3-latest",
    coding: "grok-code-fast-1",
    review: "grok-3-latest",
    debug: "grok-code-fast-1",
    docs: "grok-3-latest",
    chat: "grok-3-fast",
    complex: "grok-3-latest",
  },
  autoSwitch: true,
  preferSpeed: false,
};

/**
 * Model Router - Dynamic model selection based on task type
 */
export class ModelRouter extends EventEmitter {
  private config: ModelRouterConfig;
  private configPath: string;
  private currentModel: string;
  private sessionCost: number = 0;
  private switchHistory: Array<{ from: string; to: string; reason: string; timestamp: Date }> = [];

  constructor(projectRoot: string = process.cwd()) {
    super();
    this.configPath = path.join(projectRoot, ".grok", "model-router.json");
    this.config = this.loadConfig();
    this.currentModel = this.config.defaultModel;
  }

  private loadConfig(): ModelRouterConfig {
    if (fs.existsSync(this.configPath)) {
      try {
        const saved = fs.readJsonSync(this.configPath);
        return { ...DEFAULT_ROUTER_CONFIG, ...saved };
      } catch (error) {
        // Use defaults
      }
    }
    return { ...DEFAULT_ROUTER_CONFIG };
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      // Ignore save errors
    }
  }

  /**
   * Get the current model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Set the current model manually
   */
  setCurrentModel(modelId: string): boolean {
    if (!GROK_MODELS[modelId]) {
      return false;
    }

    const previousModel = this.currentModel;
    this.currentModel = modelId;

    this.switchHistory.push({
      from: previousModel,
      to: modelId,
      reason: "Manual switch",
      timestamp: new Date(),
    });

    this.emit("model:switched", { from: previousModel, to: modelId, reason: "manual" });
    return true;
  }

  /**
   * Select the best model for a task type
   */
  selectModelForTask(taskType: TaskType): string {
    if (!this.config.autoSwitch) {
      return this.currentModel;
    }

    // Check cost threshold
    if (this.config.costThreshold && this.sessionCost >= this.config.costThreshold) {
      return this.getCheapestModel();
    }

    // Get configured model for task
    const configuredModel = this.config.taskModels[taskType];

    if (configuredModel && GROK_MODELS[configuredModel]) {
      if (configuredModel !== this.currentModel) {
        this.switchModel(configuredModel, `Task type: ${taskType}`);
      }
      return configuredModel;
    }

    // Fallback: find best model for task
    const bestModel = this.findBestModelForTask(taskType);
    if (bestModel !== this.currentModel) {
      this.switchModel(bestModel, `Auto-selected for ${taskType}`);
    }

    return bestModel;
  }

  /**
   * Detect task type from input
   */
  detectTaskType(input: string): TaskType {
    const inputLower = input.toLowerCase();

    // Search indicators
    if (inputLower.match(/\b(find|search|where|locate|grep|look for)\b/)) {
      return "search";
    }

    // Planning indicators
    if (inputLower.match(/\b(plan|design|architect|structure|organize|strategy)\b/)) {
      return "planning";
    }

    // Review indicators
    if (inputLower.match(/\b(review|check|audit|analyze|examine|inspect)\b/)) {
      return "review";
    }

    // Debug indicators
    if (inputLower.match(/\b(debug|fix|error|bug|issue|broken|crash|fail)\b/)) {
      return "debug";
    }

    // Docs indicators
    if (inputLower.match(/\b(document|readme|comment|explain|describe)\b/)) {
      return "docs";
    }

    // Complex reasoning indicators
    if (inputLower.match(/\b(complex|difficult|challenging|think|consider|evaluate)\b/)) {
      return "complex";
    }

    // Coding is default for most requests
    if (inputLower.match(/\b(implement|create|add|build|write|code|function|class|component)\b/)) {
      return "coding";
    }

    return "chat";
  }

  /**
   * Auto-select model based on input
   */
  autoSelectModel(input: string): string {
    const taskType = this.detectTaskType(input);
    return this.selectModelForTask(taskType);
  }

  private findBestModelForTask(taskType: TaskType): string {
    const candidates = Object.entries(GROK_MODELS)
      .filter(([_, config]) => config.capabilities.includes(taskType));

    if (candidates.length === 0) {
      return this.config.defaultModel;
    }

    // Sort by preference
    candidates.sort((a, b) => {
      if (this.config.preferSpeed) {
        const speedOrder = { fast: 0, medium: 1, slow: 2 };
        return speedOrder[a[1].speed] - speedOrder[b[1].speed];
      } else {
        // Prefer by capability (more specific models first)
        return a[1].capabilities.length - b[1].capabilities.length;
      }
    });

    return candidates[0][0];
  }

  private getCheapestModel(): string {
    const sorted = Object.entries(GROK_MODELS)
      .sort((a, b) => {
        const costA = a[1].costPer1kInput + a[1].costPer1kOutput;
        const costB = b[1].costPer1kInput + b[1].costPer1kOutput;
        return costA - costB;
      });

    return sorted[0][0];
  }

  private switchModel(newModel: string, reason: string): void {
    const previousModel = this.currentModel;
    this.currentModel = newModel;

    this.switchHistory.push({
      from: previousModel,
      to: newModel,
      reason,
      timestamp: new Date(),
    });

    this.emit("model:switched", { from: previousModel, to: newModel, reason });
  }

  /**
   * Record token usage and update cost
   */
  recordUsage(inputTokens: number, outputTokens: number): number {
    const modelConfig = GROK_MODELS[this.currentModel];
    if (!modelConfig) return 0;

    const cost =
      (inputTokens / 1000) * modelConfig.costPer1kInput +
      (outputTokens / 1000) * modelConfig.costPer1kOutput;

    this.sessionCost += cost;
    this.emit("usage:recorded", { inputTokens, outputTokens, cost, totalCost: this.sessionCost });

    return cost;
  }

  /**
   * Get session cost
   */
  getSessionCost(): number {
    return this.sessionCost;
  }

  /**
   * Reset session cost
   */
  resetSessionCost(): void {
    this.sessionCost = 0;
  }

  /**
   * Update router configuration
   */
  updateConfig(updates: Partial<ModelRouterConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Get model info
   */
  getModelInfo(modelId?: string): ModelConfig | null {
    return GROK_MODELS[modelId || this.currentModel] || null;
  }

  /**
   * Get all available models
   */
  getAvailableModels(): string[] {
    return Object.keys(GROK_MODELS);
  }

  /**
   * Format router status
   */
  formatStatus(): string {
    const currentConfig = GROK_MODELS[this.currentModel];

    let output = `\n🤖 Model Router Status\n${"═".repeat(50)}\n\n`;
    output += `Current Model: ${this.currentModel}\n`;
    if (currentConfig) {
      output += `  Name: ${currentConfig.name}\n`;
      output += `  Speed: ${currentConfig.speed}\n`;
      output += `  Context: ${currentConfig.contextWindow.toLocaleString()} tokens\n`;
      output += `  Cost: $${currentConfig.costPer1kInput}/1k in, $${currentConfig.costPer1kOutput}/1k out\n`;
    }

    output += `\nSession Cost: $${this.sessionCost.toFixed(4)}\n`;
    if (this.config.costThreshold) {
      output += `Cost Threshold: $${this.config.costThreshold}\n`;
    }

    output += `\nAuto-Switch: ${this.config.autoSwitch ? "ON" : "OFF"}\n`;
    output += `Prefer Speed: ${this.config.preferSpeed ? "ON" : "OFF"}\n`;

    output += `\n📋 Task Model Mapping:\n`;
    for (const [task, model] of Object.entries(this.config.taskModels)) {
      output += `  ${task}: ${model}\n`;
    }

    if (this.switchHistory.length > 0) {
      output += `\n🔄 Recent Switches:\n`;
      for (const switch_ of this.switchHistory.slice(-5)) {
        output += `  ${switch_.from} → ${switch_.to} (${switch_.reason})\n`;
      }
    }

    output += `\n${"═".repeat(50)}\n`;
    return output;
  }

  /**
   * Format available models
   */
  formatAvailableModels(): string {
    let output = `\n📋 Available Models\n${"═".repeat(50)}\n\n`;

    for (const [id, config] of Object.entries(GROK_MODELS)) {
      const current = id === this.currentModel ? " 🟢" : "";
      output += `  ${id}${current}\n`;
      output += `    ${config.name} | ${config.speed} | ${config.contextWindow.toLocaleString()} ctx\n`;
      output += `    Cost: $${config.costPer1kInput}/1k in, $${config.costPer1kOutput}/1k out\n`;
      output += `    Good for: ${config.capabilities.join(", ")}\n`;
      output += `\n`;
    }

    output += `${"═".repeat(50)}\n`;
    return output;
  }
}

// Singleton instance
let modelRouterInstance: ModelRouter | null = null;

export function getModelRouter(projectRoot?: string): ModelRouter {
  if (!modelRouterInstance) {
    modelRouterInstance = new ModelRouter(projectRoot);
  }
  return modelRouterInstance;
}
