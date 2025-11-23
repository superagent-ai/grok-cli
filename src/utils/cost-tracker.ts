import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestamp: Date;
  cost: number;
}

export interface CostReport {
  sessionCost: number;
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  totalCost: number;
  sessionTokens: { input: number; output: number };
  modelBreakdown: Record<string, { cost: number; calls: number }>;
  recentUsage: TokenUsage[];
}

export interface CostConfig {
  budgetLimit?: number;        // Stop/warn when exceeded
  dailyLimit?: number;         // Daily spending limit
  alertThreshold?: number;     // Alert at this percentage of budget
  trackHistory: boolean;       // Store usage history
  historyDays: number;         // Days of history to keep
}

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

// Model pricing (approximate, update as needed)
const MODEL_PRICING: Record<string, ModelPricing> = {
  "grok-3-latest": { inputPer1k: 0.005, outputPer1k: 0.015 },
  "grok-3-fast": { inputPer1k: 0.003, outputPer1k: 0.009 },
  "grok-code-fast-1": { inputPer1k: 0.002, outputPer1k: 0.006 },
  "grok-2-latest": { inputPer1k: 0.002, outputPer1k: 0.010 },
  // Fallback for unknown models
  "default": { inputPer1k: 0.003, outputPer1k: 0.010 },
};

const DEFAULT_CONFIG: CostConfig = {
  trackHistory: true,
  historyDays: 30,
  alertThreshold: 0.8,
};

/**
 * Cost Tracker - Track API usage and costs
 */
export class CostTracker extends EventEmitter {
  private config: CostConfig;
  private configPath: string;
  private historyPath: string;
  private sessionUsage: TokenUsage[] = [];
  private history: TokenUsage[] = [];
  private sessionStart: Date;

  constructor(config: Partial<CostConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.configPath = path.join(os.homedir(), ".grok", "cost-config.json");
    this.historyPath = path.join(os.homedir(), ".grok", "cost-history.json");
    this.sessionStart = new Date();

    this.loadConfig();
    this.loadHistory();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const saved = fs.readJsonSync(this.configPath);
        this.config = { ...this.config, ...saved };
      }
    } catch (error) {
      // Use defaults
    }
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      // Ignore
    }
  }

  private loadHistory(): void {
    if (!this.config.trackHistory) return;

    try {
      if (fs.existsSync(this.historyPath)) {
        const saved = fs.readJsonSync(this.historyPath);
        this.history = saved.map((u: any) => ({
          ...u,
          timestamp: new Date(u.timestamp),
        }));

        // Prune old history
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.historyDays);
        this.history = this.history.filter((u) => u.timestamp >= cutoff);
      }
    } catch (error) {
      this.history = [];
    }
  }

  private saveHistory(): void {
    if (!this.config.trackHistory) return;

    try {
      const dir = path.dirname(this.historyPath);
      fs.ensureDirSync(dir);
      fs.writeJsonSync(this.historyPath, this.history, { spaces: 2 });
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING["default"];
    return (inputTokens / 1000) * pricing.inputPer1k +
           (outputTokens / 1000) * pricing.outputPer1k;
  }

  /**
   * Record token usage
   */
  recordUsage(inputTokens: number, outputTokens: number, model: string): TokenUsage {
    const cost = this.calculateCost(inputTokens, outputTokens, model);
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      model,
      timestamp: new Date(),
      cost,
    };

    this.sessionUsage.push(usage);
    this.history.push(usage);

    // Check budget alerts
    this.checkBudgetAlerts();

    // Save history periodically
    if (this.history.length % 10 === 0) {
      this.saveHistory();
    }

    this.emit("usage:recorded", usage);

    return usage;
  }

  /**
   * Check and emit budget alerts
   */
  private checkBudgetAlerts(): void {
    const report = this.getReport();

    if (this.config.budgetLimit) {
      const percentage = report.monthlyCost / this.config.budgetLimit;

      if (percentage >= 1) {
        this.emit("budget:exceeded", {
          limit: this.config.budgetLimit,
          current: report.monthlyCost,
        });
      } else if (this.config.alertThreshold && percentage >= this.config.alertThreshold) {
        this.emit("budget:warning", {
          limit: this.config.budgetLimit,
          current: report.monthlyCost,
          percentage: percentage * 100,
        });
      }
    }

    if (this.config.dailyLimit && report.dailyCost >= this.config.dailyLimit) {
      this.emit("daily-limit:exceeded", {
        limit: this.config.dailyLimit,
        current: report.dailyCost,
      });
    }
  }

  /**
   * Get cost report
   */
  getReport(): CostReport {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const sessionCost = this.sessionUsage.reduce((sum, u) => sum + u.cost, 0);
    const sessionTokens = {
      input: this.sessionUsage.reduce((sum, u) => sum + u.inputTokens, 0),
      output: this.sessionUsage.reduce((sum, u) => sum + u.outputTokens, 0),
    };

    const dailyCost = this.history
      .filter((u) => u.timestamp >= dayStart)
      .reduce((sum, u) => sum + u.cost, 0);

    const weeklyCost = this.history
      .filter((u) => u.timestamp >= weekStart)
      .reduce((sum, u) => sum + u.cost, 0);

    const monthlyCost = this.history
      .filter((u) => u.timestamp >= monthStart)
      .reduce((sum, u) => sum + u.cost, 0);

    const totalCost = this.history.reduce((sum, u) => sum + u.cost, 0);

    // Model breakdown
    const modelBreakdown: Record<string, { cost: number; calls: number }> = {};
    for (const usage of this.history) {
      if (!modelBreakdown[usage.model]) {
        modelBreakdown[usage.model] = { cost: 0, calls: 0 };
      }
      modelBreakdown[usage.model].cost += usage.cost;
      modelBreakdown[usage.model].calls += 1;
    }

    return {
      sessionCost,
      dailyCost,
      weeklyCost,
      monthlyCost,
      totalCost,
      sessionTokens,
      modelBreakdown,
      recentUsage: this.sessionUsage.slice(-10),
    };
  }

  /**
   * Set budget limit
   */
  setBudgetLimit(limit: number): void {
    this.config.budgetLimit = limit;
    this.saveConfig();
  }

  /**
   * Set daily limit
   */
  setDailyLimit(limit: number): void {
    this.config.dailyLimit = limit;
    this.saveConfig();
  }

  /**
   * Reset session tracking
   */
  resetSession(): void {
    this.sessionUsage = [];
    this.sessionStart = new Date();
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  /**
   * Export history to CSV
   */
  exportToCsv(): string {
    let csv = "timestamp,model,input_tokens,output_tokens,cost\n";

    for (const usage of this.history) {
      csv += `${usage.timestamp.toISOString()},${usage.model},${usage.inputTokens},${usage.outputTokens},${usage.cost.toFixed(6)}\n`;
    }

    return csv;
  }

  /**
   * Format cost dashboard
   */
  formatDashboard(): string {
    const report = this.getReport();

    let output = `\n💰 Cost Tracking Dashboard\n${"═".repeat(50)}\n\n`;

    // Session stats
    output += `📊 Current Session\n`;
    output += `   Cost: $${report.sessionCost.toFixed(4)}\n`;
    output += `   Tokens: ${report.sessionTokens.input.toLocaleString()} in / ${report.sessionTokens.output.toLocaleString()} out\n`;
    output += `   Started: ${this.sessionStart.toLocaleString()}\n\n`;

    // Period costs
    output += `📅 Period Costs\n`;
    output += `   Today:    $${report.dailyCost.toFixed(4)}\n`;
    output += `   Week:     $${report.weeklyCost.toFixed(4)}\n`;
    output += `   Month:    $${report.monthlyCost.toFixed(4)}\n`;
    output += `   All Time: $${report.totalCost.toFixed(4)}\n\n`;

    // Budget status
    if (this.config.budgetLimit) {
      const percentage = (report.monthlyCost / this.config.budgetLimit) * 100;
      const bar = this.createProgressBar(percentage, 20);
      output += `🎯 Budget\n`;
      output += `   ${bar} ${percentage.toFixed(1)}%\n`;
      output += `   $${report.monthlyCost.toFixed(2)} / $${this.config.budgetLimit.toFixed(2)}\n\n`;
    }

    if (this.config.dailyLimit) {
      const percentage = (report.dailyCost / this.config.dailyLimit) * 100;
      output += `📆 Daily Limit: $${report.dailyCost.toFixed(2)} / $${this.config.dailyLimit.toFixed(2)} (${percentage.toFixed(1)}%)\n\n`;
    }

    // Model breakdown
    if (Object.keys(report.modelBreakdown).length > 0) {
      output += `🤖 Model Breakdown\n`;
      const sorted = Object.entries(report.modelBreakdown)
        .sort((a, b) => b[1].cost - a[1].cost);

      for (const [model, stats] of sorted) {
        output += `   ${model}: $${stats.cost.toFixed(4)} (${stats.calls} calls)\n`;
      }
      output += `\n`;
    }

    // Recent usage
    if (report.recentUsage.length > 0) {
      output += `📝 Recent Usage\n`;
      for (const usage of report.recentUsage.slice(-5)) {
        output += `   ${usage.timestamp.toLocaleTimeString()} | ${usage.model} | $${usage.cost.toFixed(4)}\n`;
      }
    }

    output += `\n${"═".repeat(50)}\n`;
    output += `💡 Commands: /cost, /cost budget <amount>, /cost export\n`;

    return output;
  }

  private createProgressBar(percentage: number, width: number): string {
    const filled = Math.min(Math.round((percentage / 100) * width), width);
    const empty = width - filled;
    const color = percentage >= 100 ? "🔴" : percentage >= 80 ? "🟡" : "🟢";
    return `${color} [${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }
}

// Singleton instance
let costTrackerInstance: CostTracker | null = null;

export function getCostTracker(config?: Partial<CostConfig>): CostTracker {
  if (!costTrackerInstance) {
    costTrackerInstance = new CostTracker(config);
  }
  return costTrackerInstance;
}
