import * as fs from "fs-extra";
import * as path from "path";

export type AutonomyLevel = "suggest" | "confirm" | "auto" | "full" | "yolo";

export interface YOLOConfig {
  enabled: boolean;
  allowList: string[];           // Commands that can always auto-run
  denyList: string[];            // Commands that always require confirmation
  maxAutoEdits: number;          // Max files to edit without confirmation
  maxAutoCommands: number;       // Max bash commands per turn
  safeMode: boolean;             // Disables destructive operations entirely
  allowedPaths: string[];        // Paths where edits are allowed
  blockedPaths: string[];        // Paths where edits are never allowed
  sessionEditCount: number;      // Track edits this session
  sessionCommandCount: number;   // Track commands this session
}

export interface AutonomyConfig {
  level: AutonomyLevel;
  dangerousOperations: string[];  // Always require confirmation
  safeOperations: string[];       // Never require confirmation in auto/full mode
  sessionOverrides: Map<string, AutonomyLevel>;  // Per-operation overrides
  yolo: YOLOConfig;              // YOLO mode configuration
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

const DEFAULT_YOLO_CONFIG: YOLOConfig = {
  enabled: false,
  allowList: [
    "npm test",
    "npm run lint",
    "npm run build",
    "npm run typecheck",
    "git status",
    "git diff",
    "git log",
    "yarn test",
    "pnpm test",
    "cargo test",
    "go test",
    "pytest",
    "jest",
    "vitest",
  ],
  denyList: [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf *",
    "git push --force origin main",
    "git push --force origin master",
    "DROP DATABASE",
    "DROP TABLE",
    "TRUNCATE",
    "format c:",
    "mkfs",
    "> /dev/sda",
  ],
  maxAutoEdits: 10,
  maxAutoCommands: 20,
  safeMode: false,
  allowedPaths: [],  // Empty = all paths allowed
  blockedPaths: [
    "node_modules",
    ".git",
    ".env",
    ".env.local",
    ".env.production",
    "credentials",
    "secrets",
    "*.pem",
    "*.key",
  ],
  sessionEditCount: 0,
  sessionCommandCount: 0,
};

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
      yolo: { ...DEFAULT_YOLO_CONFIG },
    };

    if (fs.existsSync(this.configPath)) {
      try {
        const saved = fs.readJsonSync(this.configPath);
        return {
          ...defaultConfig,
          ...saved,
          sessionOverrides: new Map(Object.entries(saved.sessionOverrides || {})),
          yolo: { ...DEFAULT_YOLO_CONFIG, ...saved.yolo },
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
        yolo: {
          ...this.config.yolo,
          sessionEditCount: 0,      // Don't persist session counts
          sessionCommandCount: 0,
        },
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

  // =====================
  // YOLO Mode Methods
  // =====================

  enableYOLO(safeMode: boolean = false): void {
    this.config.level = "yolo";
    this.config.yolo.enabled = true;
    this.config.yolo.safeMode = safeMode;
    this.resetSessionCounts();
    this.saveConfig();
  }

  disableYOLO(): void {
    this.config.yolo.enabled = false;
    this.config.level = "confirm";
    this.saveConfig();
  }

  isYOLOEnabled(): boolean {
    return this.config.level === "yolo" && this.config.yolo.enabled;
  }

  getYOLOConfig(): YOLOConfig {
    return { ...this.config.yolo };
  }

  updateYOLOConfig(updates: Partial<YOLOConfig>): void {
    this.config.yolo = { ...this.config.yolo, ...updates };
    this.saveConfig();
  }

  addToYOLOAllowList(command: string): void {
    if (!this.config.yolo.allowList.includes(command)) {
      this.config.yolo.allowList.push(command);
      this.saveConfig();
    }
  }

  removeFromYOLOAllowList(command: string): void {
    const index = this.config.yolo.allowList.indexOf(command);
    if (index > -1) {
      this.config.yolo.allowList.splice(index, 1);
      this.saveConfig();
    }
  }

  addToYOLODenyList(command: string): void {
    if (!this.config.yolo.denyList.includes(command)) {
      this.config.yolo.denyList.push(command);
      this.saveConfig();
    }
  }

  removeFromYOLODenyList(command: string): void {
    const index = this.config.yolo.denyList.indexOf(command);
    if (index > -1) {
      this.config.yolo.denyList.splice(index, 1);
      this.saveConfig();
    }
  }

  /**
   * Check if a command should auto-execute in YOLO mode
   */
  shouldYOLOExecute(command: string, type: "bash" | "edit"): { allowed: boolean; reason: string } {
    if (!this.isYOLOEnabled()) {
      return { allowed: false, reason: "YOLO mode not enabled" };
    }

    // Check deny list first (always blocked)
    for (const denied of this.config.yolo.denyList) {
      if (command.toLowerCase().includes(denied.toLowerCase())) {
        return { allowed: false, reason: `Command matches deny list: ${denied}` };
      }
    }

    // In safe mode, block all potentially destructive commands
    if (this.config.yolo.safeMode) {
      const destructive = ["rm", "delete", "drop", "truncate", "format", "mkfs"];
      for (const d of destructive) {
        if (command.toLowerCase().includes(d)) {
          return { allowed: false, reason: `Safe mode: destructive command blocked` };
        }
      }
    }

    // Check session limits
    if (type === "edit" && this.config.yolo.sessionEditCount >= this.config.yolo.maxAutoEdits) {
      return { allowed: false, reason: `Edit limit reached (${this.config.yolo.maxAutoEdits})` };
    }

    if (type === "bash" && this.config.yolo.sessionCommandCount >= this.config.yolo.maxAutoCommands) {
      return { allowed: false, reason: `Command limit reached (${this.config.yolo.maxAutoCommands})` };
    }

    // Check allow list (fast-track)
    for (const allowed of this.config.yolo.allowList) {
      if (command.toLowerCase().startsWith(allowed.toLowerCase())) {
        return { allowed: true, reason: `Matches allow list: ${allowed}` };
      }
    }

    // Default: allow in YOLO mode unless it's dangerous
    if (this.isDangerousOperation(command)) {
      return { allowed: false, reason: "Dangerous operation requires confirmation" };
    }

    return { allowed: true, reason: "YOLO mode auto-execution" };
  }

  /**
   * Check if a file path is allowed for editing in YOLO mode
   */
  isPathAllowedForYOLO(filePath: string): { allowed: boolean; reason: string } {
    if (!this.isYOLOEnabled()) {
      return { allowed: false, reason: "YOLO mode not enabled" };
    }

    const normalizedPath = path.normalize(filePath);

    // Check blocked paths
    for (const blocked of this.config.yolo.blockedPaths) {
      if (blocked.includes("*")) {
        // Glob pattern
        const pattern = blocked.replace(/\*/g, ".*");
        if (new RegExp(pattern).test(normalizedPath)) {
          return { allowed: false, reason: `Path matches blocked pattern: ${blocked}` };
        }
      } else if (normalizedPath.includes(blocked)) {
        return { allowed: false, reason: `Path is blocked: ${blocked}` };
      }
    }

    // Check allowed paths (if specified)
    if (this.config.yolo.allowedPaths.length > 0) {
      for (const allowed of this.config.yolo.allowedPaths) {
        if (normalizedPath.startsWith(allowed) || normalizedPath.includes(allowed)) {
          return { allowed: true, reason: `Path is in allowed list` };
        }
      }
      return { allowed: false, reason: "Path not in allowed paths list" };
    }

    return { allowed: true, reason: "Path allowed by default" };
  }

  /**
   * Record an auto-execution in YOLO mode
   */
  recordYOLOExecution(type: "bash" | "edit"): void {
    if (type === "edit") {
      this.config.yolo.sessionEditCount++;
    } else {
      this.config.yolo.sessionCommandCount++;
    }
  }

  /**
   * Reset session counts (call at session start)
   */
  resetSessionCounts(): void {
    this.config.yolo.sessionEditCount = 0;
    this.config.yolo.sessionCommandCount = 0;
  }

  /**
   * Get remaining auto-executions
   */
  getRemainingYOLOExecutions(): { edits: number; commands: number } {
    return {
      edits: Math.max(0, this.config.yolo.maxAutoEdits - this.config.yolo.sessionEditCount),
      commands: Math.max(0, this.config.yolo.maxAutoCommands - this.config.yolo.sessionCommandCount),
    };
  }

  formatYOLOStatus(): string {
    const yolo = this.config.yolo;
    const remaining = this.getRemainingYOLOExecutions();

    let output = `\n⚡ YOLO Mode Status\n${"═".repeat(50)}\n\n`;
    output += `Status: ${yolo.enabled ? "🟢 ENABLED" : "🔴 DISABLED"}\n`;
    output += `Safe Mode: ${yolo.safeMode ? "ON (destructive commands blocked)" : "OFF"}\n\n`;

    output += `📊 Session Limits:\n`;
    output += `   Edits: ${yolo.sessionEditCount}/${yolo.maxAutoEdits} (${remaining.edits} remaining)\n`;
    output += `   Commands: ${yolo.sessionCommandCount}/${yolo.maxAutoCommands} (${remaining.commands} remaining)\n\n`;

    output += `✅ Allow List (${yolo.allowList.length} commands):\n`;
    for (const cmd of yolo.allowList.slice(0, 5)) {
      output += `   • ${cmd}\n`;
    }
    if (yolo.allowList.length > 5) {
      output += `   ... and ${yolo.allowList.length - 5} more\n`;
    }

    output += `\n🚫 Deny List (${yolo.denyList.length} patterns):\n`;
    for (const cmd of yolo.denyList.slice(0, 5)) {
      output += `   • ${cmd}\n`;
    }
    if (yolo.denyList.length > 5) {
      output += `   ... and ${yolo.denyList.length - 5} more\n`;
    }

    output += `\n🛡️ Blocked Paths (${yolo.blockedPaths.length}):\n`;
    for (const p of yolo.blockedPaths.slice(0, 5)) {
      output += `   • ${p}\n`;
    }
    if (yolo.blockedPaths.length > 5) {
      output += `   ... and ${yolo.blockedPaths.length - 5} more\n`;
    }

    output += `\n${"═".repeat(50)}\n`;
    return output;
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
