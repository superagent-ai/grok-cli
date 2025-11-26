import { ChatEntry } from "../agent/grok-agent.js";
import { getAutonomyManager, AutonomyLevel } from "../utils/autonomy-manager.js";
import { getMemoryManager } from "../memory/persistent-memory.js";
import { getSkillManager } from "../skills/skill-manager.js";
import { getCostTracker } from "../utils/cost-tracker.js";
import { getWorkspaceDetector } from "../utils/workspace-detector.js";
import { getBranchManager } from "../persistence/conversation-branches.js";
import { getCommentWatcher } from "../tools/comment-watcher.js";

/**
 * Enhanced Command Handler - Processes special command tokens
 * Returns the chat entry to display, or null if command should be passed to AI
 */
export interface CommandHandlerResult {
  handled: boolean;
  entry?: ChatEntry;
  passToAI?: boolean;
  prompt?: string;
}

export class EnhancedCommandHandler {
  private conversationHistory: ChatEntry[] = [];

  setConversationHistory(history: ChatEntry[]): void {
    this.conversationHistory = history;
  }

  /**
   * Handle a special command token
   */
  async handleCommand(
    token: string,
    args: string[],
    _fullInput: string
  ): Promise<CommandHandlerResult> {
    switch (token) {
      case "__YOLO_MODE__":
        return this.handleYoloMode(args);

      case "__PIPELINE__":
        return this.handlePipeline(args);

      case "__SKILL__":
        return this.handleSkill(args);

      case "__COST__":
        return this.handleCost(args);

      case "__FORK__":
        return this.handleFork(args);

      case "__BRANCHES__":
        return this.handleBranches();

      case "__CHECKOUT__":
        return this.handleCheckout(args);

      case "__MERGE__":
        return this.handleMerge(args);

      case "__SCAN_TODOS__":
        return this.handleScanTodos();

      case "__ADDRESS_TODO__":
        return this.handleAddressTodo(args);

      case "__MEMORY__":
        return this.handleMemory(args);

      case "__REMEMBER__":
        return this.handleRemember(args);

      case "__WORKSPACE__":
        return this.handleWorkspace();

      case "__PARALLEL__":
        return this.handleParallel(args);

      case "__MODEL_ROUTER__":
        return this.handleModelRouter(args);

      case "__GENERATE_TESTS__":
        return this.handleGenerateTests(args);

      case "__AUTONOMY__":
        return this.handleAutonomy(args);

      default:
        return { handled: false };
    }
  }

  /**
   * YOLO Mode - Full auto-execution with guardrails
   */
  private handleYoloMode(args: string[]): CommandHandlerResult {
    const autonomyManager = getAutonomyManager();
    const action = args[0]?.toLowerCase();

    let content: string;

    switch (action) {
      case "on":
        autonomyManager.enableYOLO(false);
        autonomyManager.updateYOLOConfig({
          maxAutoEdits: 50,
          maxAutoCommands: 100,
        });
        content = `🚀 YOLO MODE: ENABLED

⚡ Auto-approval is ON for all operations
⚠️  Guardrails: 50 auto-edits, 100 commands per session

Use /yolo off to disable, /yolo safe for restricted mode`;
        break;

      case "safe":
        autonomyManager.enableYOLO(true);
        autonomyManager.updateYOLOConfig({
          maxAutoEdits: 20,
          maxAutoCommands: 30,
          allowedPaths: ["src/", "test/", "tests/"],
        });
        content = `🛡️ YOLO MODE: SAFE

✅ Auto-approval ON with restrictions:
   • Max 20 edits, 30 commands
   • Allowed paths: src/, test/, tests/

Use /yolo on for full mode, /yolo off to disable`;
        break;

      case "off":
        autonomyManager.disableYOLO();
        content = `⏸️ YOLO MODE: DISABLED

Manual approval is now required for operations.`;
        break;

      case "allow":
        if (args[1]) {
          autonomyManager.addToYOLOAllowList(args[1]);
          content = `✅ Added "${args[1]}" to YOLO allowed commands`;
        } else {
          content = `Usage: /yolo allow <command>`;
        }
        break;

      case "deny":
        if (args[1]) {
          autonomyManager.addToYOLODenyList(args[1]);
          content = `🚫 Added "${args[1]}" to YOLO denied commands`;
        } else {
          content = `Usage: /yolo deny <command>`;
        }
        break;

      case "status":
      default:
        content = autonomyManager.formatYOLOStatus();
        break;
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Pipeline - Run agent workflows
   */
  private handlePipeline(args: string[]): CommandHandlerResult {
    const pipelineName = args[0];

    if (!pipelineName) {
      const content = `🔄 Available Pipelines

  • code-review: Comprehensive code review workflow
  • bug-fix: Systematic bug fixing workflow
  • feature-development: Feature development workflow
  • security-audit: Security audit workflow
  • documentation: Documentation generation workflow

Usage: /pipeline <name> [target]

Example: /pipeline code-review src/utils.ts`;

      return {
        handled: true,
        entry: {
          type: "assistant",
          content,
          timestamp: new Date(),
        },
      };
    }

    const target = args.slice(1).join(" ") || process.cwd();

    const pipelineSteps: Record<string, string> = {
      "code-review": `1. Analyze code structure
2. Check for code smells and anti-patterns
3. Review error handling
4. Check test coverage
5. Provide improvement suggestions`,
      "bug-fix": `1. Reproduce the issue
2. Analyze error messages and logs
3. Identify root cause
4. Implement fix
5. Verify fix and add tests`,
      "feature-development": `1. Understand requirements
2. Design implementation approach
3. Implement feature
4. Write tests
5. Document changes`,
      "security-audit": `1. Scan for common vulnerabilities
2. Check authentication/authorization
3. Review data handling
4. Check dependencies
5. Provide security recommendations`,
      "documentation": `1. Analyze code structure
2. Generate API documentation
3. Create usage examples
4. Update README if needed
5. Add inline comments`,
    };

    const steps = pipelineSteps[pipelineName] || "Execute the pipeline steps";

    return {
      handled: true,
      passToAI: true,
      prompt: `Run the ${pipelineName} pipeline on: ${target}

This involves:
${steps}

Execute each step and report results.`,
    };
  }

  /**
   * Skill - Manage specialized skills
   */
  private handleSkill(args: string[]): CommandHandlerResult {
    const skillManager = getSkillManager();
    const action = args[0]?.toLowerCase();

    let content: string;

    if (!action || action === "list") {
      const skills = skillManager.getAvailableSkills();
      const active = skillManager.getActiveSkill();

      content = `🎯 Available Skills

${skills
  .map((name) => {
    const skill = skillManager.getSkill(name);
    const isActive = active?.name === name;
    return `  ${isActive ? "✅" : "⚪"} ${name}\n     ${skill?.description || ""}`;
  })
  .join("\n\n")}

Commands:
  /skill list              - Show all skills
  /skill activate <name>   - Enable a skill
  /skill deactivate        - Disable current skill
  /skill <name>            - Quick activate`;
    } else if (action === "activate" && args[1]) {
      const skill = skillManager.activateSkill(args[1]);
      content = skill
        ? `✅ Activated skill: ${skill.name}\n\n${skill.description}`
        : `❌ Skill not found: ${args[1]}`;
    } else if (action === "deactivate") {
      skillManager.deactivateSkill();
      content = `⏸️ Skill deactivated`;
    } else {
      // Try to activate as skill name
      const skill = skillManager.activateSkill(action);
      if (skill) {
        content = `✅ Activated skill: ${skill.name}\n\n${skill.description}`;
      } else {
        content = `❌ Unknown skill: ${action}\n\nUse /skill list to see available skills`;
      }
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Cost - Track API usage costs
   */
  private handleCost(args: string[]): CommandHandlerResult {
    const costTracker = getCostTracker();
    const action = args[0]?.toLowerCase();

    let content: string;

    switch (action) {
      case "budget":
        if (args[1]) {
          const budget = parseFloat(args[1]);
          costTracker.setBudgetLimit(budget);
          content = `💰 Session budget set to $${budget.toFixed(2)}`;
        } else {
          content = `Usage: /cost budget <amount>`;
        }
        break;

      case "daily":
        if (args[1]) {
          const daily = parseFloat(args[1]);
          costTracker.setDailyLimit(daily);
          content = `📅 Daily limit set to $${daily.toFixed(2)}`;
        } else {
          content = `Usage: /cost daily <amount>`;
        }
        break;

      case "export":
        const report = costTracker.getReport();
        content = `📊 Cost Report\n\n${JSON.stringify(report, null, 2)}`;
        break;

      case "reset":
        costTracker.resetSession();
        content = `🔄 Cost tracking reset`;
        break;

      case "status":
      default:
        content = costTracker.formatDashboard();
        break;
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Fork - Create conversation branch
   */
  private handleFork(args: string[]): CommandHandlerResult {
    const branchManager = getBranchManager();
    const branchName = args.join(" ") || `branch-${Date.now()}`;

    const branch = branchManager.fork(branchName);

    return {
      handled: true,
      entry: {
        type: "assistant",
        content: `🔀 Created branch: ${branch.name}

ID: ${branch.id}
Messages: ${branch.messages.length}

Use /branches to see all branches
Use /checkout <id> to switch branches`,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Branches - List conversation branches
   */
  private handleBranches(): CommandHandlerResult {
    const branchManager = getBranchManager();
    const branches = branchManager.getAllBranches();
    const currentId = branchManager.getCurrentBranchId();

    let content = `🌳 Conversation Branches\n${"═".repeat(50)}\n\n`;

    for (const branch of branches) {
      const isCurrent = branch.id === currentId;
      content += `${isCurrent ? "→ " : "  "}${branch.name} (${branch.id})\n`;
      content += `    Messages: ${branch.messages.length} | Created: ${new Date(branch.createdAt).toLocaleString()}\n\n`;
    }

    content += `\nCommands:\n  /fork <name>     - Create new branch\n  /checkout <id>   - Switch branch\n  /merge <id>      - Merge branch`;

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Checkout - Switch to a branch
   */
  private handleCheckout(args: string[]): CommandHandlerResult {
    const branchManager = getBranchManager();
    const branchId = args[0];

    if (!branchId) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `Usage: /checkout <branch-id>

Use /branches to see available branches`,
          timestamp: new Date(),
        },
      };
    }

    const result = branchManager.checkout(branchId);

    if (result) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `✅ Switched to branch: ${result.name}

Loaded ${result.messages.length} messages`,
          timestamp: new Date(),
        },
      };
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content: `❌ Branch not found: ${branchId}`,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Merge - Merge a branch
   */
  private handleMerge(args: string[]): CommandHandlerResult {
    const branchManager = getBranchManager();
    const branchId = args[0];

    if (!branchId) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `Usage: /merge <branch-id>`,
          timestamp: new Date(),
        },
      };
    }

    const result = branchManager.merge(branchId);

    return {
      handled: true,
      entry: {
        type: "assistant",
        content: result
          ? `✅ Merged branch: ${branchId}`
          : `❌ Merge failed: Branch not found or same as current`,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Scan Todos - Find AI-directed comments
   */
  private async handleScanTodos(): Promise<CommandHandlerResult> {
    const commentWatcher = getCommentWatcher();

    await commentWatcher.scanProject();
    const content = commentWatcher.formatComments();

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Address Todo - Handle specific AI comment
   */
  private async handleAddressTodo(
    args: string[]
  ): Promise<CommandHandlerResult> {
    const commentWatcher = getCommentWatcher();
    const index = parseInt(args[0], 10);

    if (isNaN(index)) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `Usage: /address-todo <index>

Run /scan-todos first to see available items`,
          timestamp: new Date(),
        },
      };
    }

    const comments = commentWatcher.getDetectedComments();

    if (index < 1 || index > comments.length) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `❌ Invalid index. Available: 1-${comments.length}`,
          timestamp: new Date(),
        },
      };
    }

    const comment = comments[index - 1];
    const prompt = commentWatcher.generatePromptForComment(comment);

    return {
      handled: true,
      passToAI: true,
      prompt,
    };
  }

  /**
   * Memory - Manage persistent memory
   */
  private async handleMemory(args: string[]): Promise<CommandHandlerResult> {
    const memoryManager = getMemoryManager();
    await memoryManager.initialize();

    const action = args[0]?.toLowerCase();

    let content: string;

    switch (action) {
      case "recall":
        if (args[1]) {
          const value = memoryManager.recall(args[1]);
          content = value
            ? `📝 ${args[1]}: ${value}`
            : `❌ Memory not found: ${args[1]}`;
        } else {
          content = `Usage: /memory recall <key>`;
        }
        break;

      case "forget":
        if (args[1]) {
          await memoryManager.forget(args[1]);
          content = `🗑️ Forgot: ${args[1]}`;
        } else {
          content = `Usage: /memory forget <key>`;
        }
        break;

      case "list":
      default:
        content = memoryManager.formatMemories();
        break;
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Remember - Quick memory store
   */
  private async handleRemember(args: string[]): Promise<CommandHandlerResult> {
    const memoryManager = getMemoryManager();
    await memoryManager.initialize();

    const key = args[0];
    const value = args.slice(1).join(" ");

    if (!key || !value) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `Usage: /remember <key> <value>`,
          timestamp: new Date(),
        },
      };
    }

    await memoryManager.remember(key, value);

    return {
      handled: true,
      entry: {
        type: "assistant",
        content: `✅ Remembered: ${key} = ${value}`,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Workspace - Detect project configuration
   */
  private async handleWorkspace(): Promise<CommandHandlerResult> {
    const detector = getWorkspaceDetector();

    await detector.detect();
    const content = detector.formatDetectionResults();

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Parallel - Run parallel subagents
   */
  private handleParallel(args: string[]): CommandHandlerResult {
    const task = args.join(" ");

    if (!task) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `🔀 Parallel Subagent Runner

Usage: /parallel <task description>

Example: /parallel analyze all TypeScript files in src/

This will execute the task using parallel subagents where beneficial.`,
          timestamp: new Date(),
        },
      };
    }

    return {
      handled: true,
      passToAI: true,
      prompt: `Execute this task using parallel subagents where beneficial:

${task}

Consider splitting into parallel operations for:
- Independent file analysis
- Multiple search queries
- Concurrent API calls`,
    };
  }

  /**
   * Model Router - Configure dynamic model selection
   */
  private handleModelRouter(args: string[]): CommandHandlerResult {
    const action = args[0]?.toLowerCase();

    let content: string;

    switch (action) {
      case "auto":
        content = `🤖 Model Router: AUTO MODE

Models will be selected automatically based on task type.

Task Types:
  • search   → Fast model for quick searches
  • planning → Smart model for planning
  • coding   → Best model for code generation
  • review   → Smart model for reviews
  • debug    → Best model for debugging
  • docs     → Fast model for documentation
  • chat     → Default model for conversations`;
        break;

      case "manual":
        content = `🎛️ Model Router: MANUAL MODE

Use /model to change models manually.`;
        break;

      case "status":
      default:
        content = `🔄 Model Router Status

Mode: Manual (use /model-router auto to enable)

Task-to-Model Mapping:
  • search   → grok-code-fast-1
  • planning → grok-4-latest
  • coding   → grok-4-latest
  • review   → grok-4-latest
  • debug    → grok-4-latest
  • docs     → grok-code-fast-1
  • chat     → grok-code-fast-1

Commands:
  /model-router auto    - Enable auto selection
  /model-router manual  - Disable auto selection`;
        break;
    }

    return {
      handled: true,
      entry: {
        type: "assistant",
        content,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Generate Tests - Create test scaffolds
   */
  private handleGenerateTests(args: string[]): CommandHandlerResult {
    const targetFile = args[0];

    if (!targetFile) {
      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `🧪 Test Generator

Usage: /generate-tests <file>

Example: /generate-tests src/utils/helpers.ts

This will:
1. Analyze the file
2. Detect the test framework
3. Generate comprehensive tests`,
          timestamp: new Date(),
        },
      };
    }

    return {
      handled: true,
      passToAI: true,
      prompt: `Generate comprehensive tests for: ${targetFile}

1. Read and analyze the file
2. Identify all testable functions/methods
3. Generate unit tests covering:
   - Happy paths
   - Edge cases
   - Error conditions
4. Use the detected test framework conventions
5. Create the test file in the appropriate location`,
    };
  }

  /**
   * Autonomy - Set autonomy level
   */
  private handleAutonomy(args: string[]): CommandHandlerResult {
    const autonomyManager = getAutonomyManager();
    const level = args[0]?.toLowerCase() as AutonomyLevel;

    if (level && ["suggest", "confirm", "auto", "full", "yolo"].includes(level)) {
      autonomyManager.setLevel(level);

      const descriptions: Record<AutonomyLevel, string> = {
        suggest: "Suggests changes, you approve each one",
        confirm: "Asks for confirmation on important operations",
        auto: "Auto-approves safe operations, confirms destructive ones",
        full: "Auto-approves all operations (use with caution)",
        yolo: "Full auto mode with no confirmations",
      };

      return {
        handled: true,
        entry: {
          type: "assistant",
          content: `🎚️ Autonomy Level: ${level.toUpperCase()}

${descriptions[level]}`,
          timestamp: new Date(),
        },
      };
    }

    const current = autonomyManager.getLevel();
    return {
      handled: true,
      entry: {
        type: "assistant",
        content: `🎚️ Autonomy Settings

Current: ${current.toUpperCase()}

Levels:
  suggest  - Suggests changes, you approve each
  confirm  - Confirms important operations
  auto     - Auto-approves safe operations
  full     - Auto-approves everything
  yolo     - No confirmations at all

Usage: /autonomy <level>`,
        timestamp: new Date(),
      },
    };
  }
}

// Singleton instance
let enhancedCommandHandlerInstance: EnhancedCommandHandler | null = null;

export function getEnhancedCommandHandler(): EnhancedCommandHandler {
  if (!enhancedCommandHandlerInstance) {
    enhancedCommandHandlerInstance = new EnhancedCommandHandler();
  }
  return enhancedCommandHandlerInstance;
}

export function resetEnhancedCommandHandler(): void {
  enhancedCommandHandlerInstance = null;
}
