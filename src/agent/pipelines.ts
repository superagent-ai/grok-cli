import { EventEmitter } from "events";
import { SubagentManager, SubagentResult, getSubagentManager } from "./subagents.js";
import { GrokToolCall } from "../grok/client.js";
import { ToolResult } from "../types/index.js";

export interface PipelineStage {
  name: string;
  agent: string;              // Subagent type
  inputTransform?: string;    // Template to transform input (use ${previousOutput}, ${context})
  outputCapture?: string;     // Variable name to capture output
  timeout?: number;           // Stage timeout in ms
  retryOnFailure?: boolean;   // Retry this stage if it fails
  maxRetries?: number;        // Max retry attempts
  condition?: string;         // Condition to run this stage (e.g., "previousOutput.includes('error')")
}

export interface AgentPipeline {
  name: string;
  description: string;
  stages: PipelineStage[];
  passContext: boolean;       // Pass output to next stage as context
  haltOnFailure: boolean;     // Stop pipeline if a stage fails
  timeout?: number;           // Overall pipeline timeout
  variables?: Record<string, string>;  // Initial variables
}

export interface PipelineResult {
  success: boolean;
  pipelineName: string;
  stageResults: Map<string, StageResult>;
  capturedVariables: Record<string, string>;
  totalDuration: number;
  failedStage?: string;
  error?: string;
}

export interface StageResult {
  stageName: string;
  agentType: string;
  result: SubagentResult;
  duration: number;
  retries: number;
}

// Predefined pipelines
export const PREDEFINED_PIPELINES: Record<string, AgentPipeline> = {
  "code-review": {
    name: "code-review",
    description: "Comprehensive code review pipeline",
    stages: [
      {
        name: "explore",
        agent: "explorer",
        outputCapture: "codebaseContext",
        timeout: 60000,
      },
      {
        name: "review",
        agent: "code-reviewer",
        inputTransform: "Review the following code with this context:\n${codebaseContext}\n\nFocus on: ${task}",
        outputCapture: "reviewOutput",
        timeout: 120000,
      },
      {
        name: "test",
        agent: "test-runner",
        inputTransform: "Run tests to verify the code quality. Previous review found:\n${reviewOutput}",
        outputCapture: "testResults",
        timeout: 180000,
      },
    ],
    passContext: true,
    haltOnFailure: false,
  },

  "bug-fix": {
    name: "bug-fix",
    description: "Debug and fix pipeline",
    stages: [
      {
        name: "debug",
        agent: "debugger",
        inputTransform: "Debug this issue: ${task}",
        outputCapture: "debugAnalysis",
        timeout: 120000,
      },
      {
        name: "fix",
        agent: "refactorer",
        inputTransform: "Based on this debug analysis, implement the fix:\n${debugAnalysis}\n\nOriginal issue: ${task}",
        outputCapture: "fixOutput",
        timeout: 180000,
      },
      {
        name: "verify",
        agent: "test-runner",
        inputTransform: "Run tests to verify the fix works. Original issue: ${task}",
        outputCapture: "testResults",
        timeout: 120000,
      },
    ],
    passContext: true,
    haltOnFailure: true,
  },

  "feature-development": {
    name: "feature-development",
    description: "Full feature development pipeline",
    stages: [
      {
        name: "analyze",
        agent: "explorer",
        inputTransform: "Analyze the codebase to understand where to implement: ${task}",
        outputCapture: "analysis",
        timeout: 60000,
      },
      {
        name: "implement",
        agent: "refactorer",
        inputTransform: "Implement this feature based on analysis:\n${analysis}\n\nFeature: ${task}",
        outputCapture: "implementation",
        timeout: 300000,
      },
      {
        name: "test",
        agent: "test-runner",
        inputTransform: "Run tests for the new feature: ${task}",
        outputCapture: "testResults",
        timeout: 180000,
      },
      {
        name: "document",
        agent: "documenter",
        inputTransform: "Document the new feature:\n${implementation}\n\nFeature: ${task}",
        outputCapture: "documentation",
        timeout: 120000,
      },
    ],
    passContext: true,
    haltOnFailure: false,
  },

  "security-audit": {
    name: "security-audit",
    description: "Security-focused code audit",
    stages: [
      {
        name: "explore",
        agent: "explorer",
        inputTransform: "Explore the codebase focusing on security-sensitive areas: ${task}",
        outputCapture: "securityContext",
        timeout: 60000,
      },
      {
        name: "review",
        agent: "code-reviewer",
        inputTransform: "Perform a security-focused code review. Look for:\n- SQL injection\n- XSS vulnerabilities\n- Authentication issues\n- Data exposure\n\nContext:\n${securityContext}\n\nFocus: ${task}",
        outputCapture: "securityReview",
        timeout: 180000,
      },
    ],
    passContext: true,
    haltOnFailure: false,
  },

  "documentation": {
    name: "documentation",
    description: "Generate comprehensive documentation",
    stages: [
      {
        name: "explore",
        agent: "explorer",
        inputTransform: "Explore and understand the codebase structure for documentation: ${task}",
        outputCapture: "codebaseStructure",
        timeout: 60000,
      },
      {
        name: "document",
        agent: "documenter",
        inputTransform: "Generate comprehensive documentation based on:\n${codebaseStructure}\n\nDocumentation focus: ${task}",
        outputCapture: "documentation",
        timeout: 180000,
      },
    ],
    passContext: true,
    haltOnFailure: false,
  },
};

/**
 * Agent Pipeline Runner - Execute multi-stage agent workflows
 */
export class PipelineRunner extends EventEmitter {
  private manager: SubagentManager;
  private customPipelines: Map<string, AgentPipeline> = new Map();
  private isRunning: boolean = false;
  private currentPipeline: string | null = null;

  constructor(apiKey: string, baseURL?: string) {
    super();
    this.manager = getSubagentManager(apiKey, baseURL);
  }

  /**
   * Register a custom pipeline
   */
  registerPipeline(pipeline: AgentPipeline): void {
    this.customPipelines.set(pipeline.name, pipeline);
  }

  /**
   * Get a pipeline by name
   */
  getPipeline(name: string): AgentPipeline | null {
    return PREDEFINED_PIPELINES[name] || this.customPipelines.get(name) || null;
  }

  /**
   * Get all available pipelines
   */
  getAvailablePipelines(): string[] {
    return [
      ...Object.keys(PREDEFINED_PIPELINES),
      ...this.customPipelines.keys(),
    ];
  }

  /**
   * Run a pipeline
   */
  async runPipeline(
    pipelineName: string,
    task: string,
    options: {
      tools?: any[];
      executeTool?: (toolCall: GrokToolCall) => Promise<ToolResult>;
      initialVariables?: Record<string, string>;
    } = {}
  ): Promise<PipelineResult> {
    const pipeline = this.getPipeline(pipelineName);

    if (!pipeline) {
      return {
        success: false,
        pipelineName,
        stageResults: new Map(),
        capturedVariables: {},
        totalDuration: 0,
        error: `Pipeline not found: ${pipelineName}`,
      };
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.currentPipeline = pipelineName;

    const stageResults = new Map<string, StageResult>();
    const variables: Record<string, string> = {
      task,
      ...pipeline.variables,
      ...options.initialVariables,
    };

    this.emit("pipeline:start", { pipeline: pipelineName, stages: pipeline.stages.length });

    let previousOutput = "";
    let failedStage: string | undefined;

    try {
      for (const stage of pipeline.stages) {
        if (!this.isRunning) {
          break;
        }

        // Check condition if specified
        if (stage.condition) {
          try {
            const conditionMet = this.evaluateCondition(stage.condition, variables, previousOutput);
            if (!conditionMet) {
              this.emit("pipeline:stage-skipped", { stage: stage.name, reason: "Condition not met" });
              continue;
            }
          } catch (error) {
            // If condition evaluation fails, run the stage anyway
          }
        }

        this.emit("pipeline:stage-start", { stage: stage.name, agent: stage.agent });

        const stageStartTime = Date.now();
        let retries = 0;
        let stageResult: SubagentResult | null = null;

        // Build input from template
        const input = stage.inputTransform
          ? this.interpolateTemplate(stage.inputTransform, variables, previousOutput)
          : task;

        // Run stage with retries
        while (retries <= (stage.maxRetries || 0)) {
          try {
            stageResult = await this.manager.spawn(stage.agent, input, {
              context: pipeline.passContext ? previousOutput : undefined,
              tools: options.tools,
              executeTool: options.executeTool,
            });

            if (stageResult.success || !stage.retryOnFailure) {
              break;
            }
            retries++;
          } catch (error) {
            if (retries >= (stage.maxRetries || 0)) {
              throw error;
            }
            retries++;
          }
        }

        if (!stageResult) {
          throw new Error(`Stage ${stage.name} produced no result`);
        }

        const stageDuration = Date.now() - stageStartTime;

        stageResults.set(stage.name, {
          stageName: stage.name,
          agentType: stage.agent,
          result: stageResult,
          duration: stageDuration,
          retries,
        });

        // Capture output variable
        if (stage.outputCapture) {
          variables[stage.outputCapture] = stageResult.output;
        }

        previousOutput = stageResult.output;

        this.emit("pipeline:stage-complete", {
          stage: stage.name,
          success: stageResult.success,
          duration: stageDuration,
        });

        // Check if we should halt
        if (!stageResult.success && pipeline.haltOnFailure) {
          failedStage = stage.name;
          break;
        }
      }
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      this.emit("pipeline:error", { error: error.message });

      return {
        success: false,
        pipelineName,
        stageResults,
        capturedVariables: variables,
        totalDuration,
        error: error.message,
      };
    } finally {
      this.isRunning = false;
      this.currentPipeline = null;
    }

    const totalDuration = Date.now() - startTime;
    const allSucceeded = Array.from(stageResults.values()).every((sr) => sr.result.success);

    this.emit("pipeline:complete", {
      pipeline: pipelineName,
      success: allSucceeded && !failedStage,
      totalDuration,
    });

    return {
      success: allSucceeded && !failedStage,
      pipelineName,
      stageResults,
      capturedVariables: variables,
      totalDuration,
      failedStage,
    };
  }

  /**
   * Stop the current pipeline
   */
  stop(): void {
    this.isRunning = false;
    this.manager.stopAll();
    this.emit("pipeline:stopped");
  }

  /**
   * Interpolate variables into a template string
   */
  private interpolateTemplate(
    template: string,
    variables: Record<string, string>,
    previousOutput: string
  ): string {
    let result = template;

    // Replace ${previousOutput}
    result = result.replace(/\$\{previousOutput\}/g, previousOutput);

    // Replace other variables
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    }

    return result;
  }

  /**
   * Evaluate a condition string
   */
  private evaluateCondition(
    condition: string,
    variables: Record<string, string>,
    previousOutput: string
  ): boolean {
    // Simple condition evaluation (be careful with eval in production!)
    // For safety, we only support simple checks
    if (condition.includes("previousOutput.includes")) {
      const match = condition.match(/previousOutput\.includes\(['"]([^'"]+)['"]\)/);
      if (match) {
        return previousOutput.includes(match[1]);
      }
    }

    if (condition.includes("previousOutput.length")) {
      const match = condition.match(/previousOutput\.length\s*(>|<|>=|<=|===|==)\s*(\d+)/);
      if (match) {
        const op = match[1];
        const num = parseInt(match[2]);
        switch (op) {
          case ">": return previousOutput.length > num;
          case "<": return previousOutput.length < num;
          case ">=": return previousOutput.length >= num;
          case "<=": return previousOutput.length <= num;
          case "===":
          case "==": return previousOutput.length === num;
        }
      }
    }

    // Check variable conditions
    for (const [key, value] of Object.entries(variables)) {
      if (condition === `${key}`) {
        return !!value;
      }
    }

    return true; // Default to running the stage
  }

  /**
   * Format pipeline result for display
   */
  formatResult(result: PipelineResult): string {
    let output = `\n🔗 Pipeline Results: ${result.pipelineName}\n${"═".repeat(50)}\n\n`;
    output += `Status: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}\n`;
    output += `Duration: ${(result.totalDuration / 1000).toFixed(2)}s\n`;

    if (result.failedStage) {
      output += `Failed at: ${result.failedStage}\n`;
    }
    if (result.error) {
      output += `Error: ${result.error}\n`;
    }

    output += `\n📋 Stage Results:\n`;

    for (const [stageName, stageResult] of result.stageResults) {
      const status = stageResult.result.success ? "✅" : "❌";
      output += `\n${status} ${stageName} (${stageResult.agentType})\n`;
      output += `   Duration: ${(stageResult.duration / 1000).toFixed(2)}s`;
      if (stageResult.retries > 0) {
        output += ` | Retries: ${stageResult.retries}`;
      }
      output += `\n`;
      output += `   Tools: ${stageResult.result.toolsUsed.join(", ") || "none"}\n`;
      output += `   Output: ${stageResult.result.output.slice(0, 150)}${stageResult.result.output.length > 150 ? "..." : ""}\n`;
    }

    if (Object.keys(result.capturedVariables).length > 0) {
      output += `\n📦 Captured Variables:\n`;
      for (const [key, value] of Object.entries(result.capturedVariables)) {
        if (key !== "task") {
          output += `   ${key}: ${value.slice(0, 50)}${value.length > 50 ? "..." : ""}\n`;
        }
      }
    }

    output += `\n${"═".repeat(50)}\n`;
    return output;
  }

  /**
   * Format available pipelines for display
   */
  formatAvailablePipelines(): string {
    let output = "Available Pipelines:\n\n";

    const allPipelines = [
      ...Object.entries(PREDEFINED_PIPELINES),
      ...this.customPipelines.entries(),
    ];

    for (const [name, pipeline] of allPipelines) {
      output += `  🔗 ${name}\n`;
      output += `     ${pipeline.description}\n`;
      output += `     Stages: ${pipeline.stages.map((s) => s.name).join(" → ")}\n`;
      output += `\n`;
    }

    return output;
  }
}

// Singleton instance
let pipelineRunnerInstance: PipelineRunner | null = null;

export function getPipelineRunner(apiKey: string, baseURL?: string): PipelineRunner {
  if (!pipelineRunnerInstance) {
    pipelineRunnerInstance = new PipelineRunner(apiKey, baseURL);
  }
  return pipelineRunnerInstance;
}
