import * as fs from "fs-extra";
import * as path from "path";

export type AutonomyLevel = "suggest" | "confirm" | "auto" | "full";

export interface AutonomyConfig {
  level: AutonomyLevel;
  dangerousOperations: string[];  // Always require confirmation
  safeOperations: string[];       // Never require confirmation in auto/full mode
  sessionOverrides: Map<string, AutonomyLevel>;  // Per-operation overrides
}

const DEFAULT_DANGEROUS_OPERATIONS = [
  "rm",
  "rm -rf",
  "delete",
  "DROP",
  "TRUNCATE",
  "git push --force",
  "git reset --hard",
  "chmod 777",
  "sudo",
  "curl | bash",
  "wget | sh",
];

const DEFAULT_SAFE_OPERATIONS = [
  "view_file",
  "search",
  "git status",
  "git log",
  "git diff",
  "ls",
  "cat",
  "pwd",
  "echo",
];

export class AutonomyManager {
  private config: AutonomyConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), ".grok", "autonomy.json");
    this.config = this.loadConfig();
  }

  private loadConfig(): AutonomyConfig {
    const defaultConfig: AutonomyConfig = {
      level: "confirm",
      dangerousOperations: [...DEFAULT_DANGEROUS_OPERATIONS],
      safeOperations: [...DEFAULT_SAFE_OPERATIONS],
      sessionOverrides: new Map(),
    };

    if (fs.existsSync(this.configPath)) {
      try {
        const saved = fs.readJsonSync(this.configPath);
        return {
          ...defaultConfig,
          ...saved,
          sessionOverrides: new Map(Object.entries(saved.sessionOverrides || {})),
        };
      } catch (error) {
        console.warn("Failed to load autonomy config:", error);
      }
    }

    return defaultConfig;
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      fs.ensureDirSync(dir);

      const toSave = {
        ...this.config,
        sessionOverrides: Object.fromEntries(this.config.sessionOverrides),
      };

      fs.writeJsonSync(this.configPath, toSave, { spaces: 2 });
    } catch (error) {
      console.warn("Failed to save autonomy config:", error);
    }
  }

  getLevel(): AutonomyLevel {
    return this.config.level;
  }

  setLevel(level: AutonomyLevel): void {
    this.config.level = level;
    this.saveConfig();
  }

  setOperationOverride(operation: string, level: AutonomyLevel): void {
    this.config.sessionOverrides.set(operation, level);
  }

  clearOperationOverride(operation: string): void {
    this.config.sessionOverrides.delete(operation);
  }

  clearAllOverrides(): void {
    this.config.sessionOverrides.clear();
  }

  /**
   * Determines if confirmation is required for an operation
   * @param operation The operation type or command
   * @param toolName Optional tool name for more specific checks
   * @returns true if confirmation is required
   */
  shouldConfirm(operation: string, toolName?: string): boolean {
    // Check for operation-specific override first
    const override = this.config.sessionOverrides.get(operation);
    if (override) {
      return this.levelRequiresConfirmation(override, operation);
    }

    // Check if this is a dangerous operation (always confirm)
    if (this.isDangerousOperation(operation)) {
      return true;
    }

    // Check if this is a safe operation (never confirm in auto/full)
    if (this.isSafeOperation(operation, toolName)) {
      return this.config.level === "suggest" || this.config.level === "confirm";
    }

    // Default behavior based on level
    return this.levelRequiresConfirmation(this.config.level, operation);
  }

  private levelRequiresConfirmation(level: AutonomyLevel, operation: string): boolean {
    switch (level) {
      case "suggest":
        return true;  // Always show and confirm
      case "confirm":
        return true;  // Standard confirmation
      case "auto":
        return this.isDangerousOperation(operation);  // Only dangerous ops
      case "full":
        return false;  // Never confirm (except critical)
      default:
        return true;
    }
  }

  private isDangerousOperation(operation: string): boolean {
    const opLower = operation.toLowerCase();
    return this.config.dangerousOperations.some((dangerous) =>
      opLower.includes(dangerous.toLowerCase())
    );
  }

  private isSafeOperation(operation: string, toolName?: string): boolean {
    // Check tool name
    if (toolName && this.config.safeOperations.includes(toolName)) {
      return true;
    }

    // Check operation string
    const opLower = operation.toLowerCase();
    return this.config.safeOperations.some((safe) =>
      opLower.startsWith(safe.toLowerCase())
    );
  }

  addDangerousOperation(operation: string): void {
    if (!this.config.dangerousOperations.includes(operation)) {
      this.config.dangerousOperations.push(operation);
      this.saveConfig();
    }
  }

  removeDangerousOperation(operation: string): void {
    const index = this.config.dangerousOperations.indexOf(operation);
    if (index > -1) {
      this.config.dangerousOperations.splice(index, 1);
      this.saveConfig();
    }
  }

  addSafeOperation(operation: string): void {
    if (!this.config.safeOperations.includes(operation)) {
      this.config.safeOperations.push(operation);
      this.saveConfig();
    }
  }

  removeSafeOperation(operation: string): void {
    const index = this.config.safeOperations.indexOf(operation);
    if (index > -1) {
      this.config.safeOperations.splice(index, 1);
      this.saveConfig();
    }
  }

  formatStatus(): string {
    const levelDescriptions: Record<AutonomyLevel, string> = {
      suggest: "Only suggest changes, always confirm",
      confirm: "Standard confirmation for all operations",
      auto: "Auto-execute safe operations, confirm dangerous ones",
      full: "Full autonomy, minimal confirmations",
    };

    let output = `Autonomy Level: ${this.config.level.toUpperCase()}\n`;
    output += `  ${levelDescriptions[this.config.level]}\n\n`;

    output += `Dangerous Operations (always confirm):\n`;
    for (const op of this.config.dangerousOperations.slice(0, 5)) {
      output += `  ⚠️  ${op}\n`;
    }
    if (this.config.dangerousOperations.length > 5) {
      output += `  ... and ${this.config.dangerousOperations.length - 5} more\n`;
    }

    output += `\nSafe Operations (auto-approved in auto/full mode):\n`;
    for (const op of this.config.safeOperations.slice(0, 5)) {
      output += `  ✓ ${op}\n`;
    }
    if (this.config.safeOperations.length > 5) {
      output += `  ... and ${this.config.safeOperations.length - 5} more\n`;
    }

    if (this.config.sessionOverrides.size > 0) {
      output += `\nSession Overrides:\n`;
      for (const [op, level] of this.config.sessionOverrides) {
        output += `  ${op}: ${level}\n`;
      }
    }

    return output;
  }

  formatHelp(): string {
    return `
Autonomy Levels:
  suggest  - Show all changes, always require confirmation
  confirm  - Standard mode, confirm before executing
  auto     - Auto-execute safe ops, confirm dangerous ones
  full     - Maximum autonomy, minimal confirmations

Commands:
  /autonomy <level>     - Set autonomy level
  /autonomy status      - Show current settings
  /autonomy allow <op>  - Mark operation as safe
  /autonomy deny <op>   - Mark operation as dangerous

Examples:
  /autonomy auto
  /autonomy allow "npm test"
  /autonomy deny "git push --force"
`;
  }
}

// Singleton instance
let autonomyManagerInstance: AutonomyManager | null = null;

export function getAutonomyManager(): AutonomyManager {
  if (!autonomyManagerInstance) {
    autonomyManagerInstance = new AutonomyManager();
  }
  return autonomyManagerInstance;
}
