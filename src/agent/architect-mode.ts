import { GrokClient, GrokMessage, GrokToolCall } from "../grok/client.js";
import { EventEmitter } from "events";

export interface ArchitectProposal {
  summary: string;
  steps: ArchitectStep[];
  files: string[];
  risks: string[];
  estimatedChanges: number;
}

export interface ArchitectStep {
  order: number;
  description: string;
  type: "create" | "edit" | "delete" | "command" | "test";
  target?: string;  // File path or command
  details?: string;
}

export interface ArchitectConfig {
  architectModel?: string;  // Model for design phase
  editorModel?: string;     // Model for implementation phase
  autoApprove?: boolean;    // Auto-approve implementation after design
  maxSteps?: number;        // Maximum steps in a proposal
}

const ARCHITECT_SYSTEM_PROMPT = `You are an expert software architect. Your role is to analyze coding requests and create detailed implementation plans.

When given a task, you should:
1. Analyze the requirements thoroughly
2. Identify all files that need to be created or modified
3. Break down the implementation into clear, ordered steps
4. Consider potential risks and edge cases
5. Estimate the scope of changes

Respond with a JSON object in this exact format:
{
  "summary": "Brief summary of the proposed changes",
  "steps": [
    {
      "order": 1,
      "description": "What this step does",
      "type": "create|edit|delete|command|test",
      "target": "path/to/file.ts or command",
      "details": "Specific implementation details"
    }
  ],
  "files": ["list", "of", "affected", "files"],
  "risks": ["potential risk 1", "potential risk 2"],
  "estimatedChanges": 150
}

Be thorough but concise. Focus on actionable steps.`;

const EDITOR_SYSTEM_PROMPT = `You are a precise code editor. You will receive an implementation plan from an architect and execute each step exactly as specified.

For each step:
1. Read the target file if it exists
2. Make the specified changes
3. Verify the changes are correct
4. Move to the next step

Do not deviate from the plan. If you encounter an issue, report it clearly.`;

export class ArchitectMode extends EventEmitter {
  private architectClient: GrokClient;
  private editorClient: GrokClient;
  private config: ArchitectConfig;
  private currentProposal: ArchitectProposal | null = null;
  private isActive: boolean = false;

  constructor(
    apiKey: string,
    baseURL?: string,
    config: ArchitectConfig = {}
  ) {
    super();
    this.config = {
      architectModel: config.architectModel || "grok-3-latest",
      editorModel: config.editorModel || "grok-code-fast-1",
      autoApprove: config.autoApprove || false,
      maxSteps: config.maxSteps || 20,
      ...config,
    };

    this.architectClient = new GrokClient(
      apiKey,
      this.config.architectModel!,
      baseURL
    );
    this.editorClient = new GrokClient(
      apiKey,
      this.config.editorModel!,
      baseURL
    );
  }

  async analyze(request: string, context?: string): Promise<ArchitectProposal> {
    this.emit("architect:start", { request });

    const messages: GrokMessage[] = [
      { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
      {
        role: "user",
        content: context
          ? `Context:\n${context}\n\nRequest:\n${request}`
          : request,
      },
    ];

    try {
      const response = await this.architectClient.chat(messages);
      const content = response.choices[0]?.message?.content || "";

      // Parse the JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Architect did not return valid JSON proposal");
      }

      const proposal = JSON.parse(jsonMatch[0]) as ArchitectProposal;

      // Validate proposal
      if (!proposal.steps || proposal.steps.length === 0) {
        throw new Error("Architect proposal has no steps");
      }

      if (proposal.steps.length > this.config.maxSteps!) {
        proposal.steps = proposal.steps.slice(0, this.config.maxSteps!);
        proposal.summary += ` (truncated to ${this.config.maxSteps} steps)`;
      }

      this.currentProposal = proposal;
      this.emit("architect:proposal", proposal);

      return proposal;
    } catch (error: any) {
      this.emit("architect:error", { error: error.message });
      throw error;
    }
  }

  async implement(
    proposal?: ArchitectProposal,
    tools?: any[],
    onStepComplete?: (step: ArchitectStep, result: any) => void
  ): Promise<{ success: boolean; results: any[] }> {
    const targetProposal = proposal || this.currentProposal;

    if (!targetProposal) {
      throw new Error("No proposal to implement. Run analyze() first.");
    }

    this.emit("editor:start", { proposal: targetProposal });
    this.isActive = true;

    const results: any[] = [];

    try {
      for (const step of targetProposal.steps) {
        if (!this.isActive) {
          this.emit("editor:cancelled");
          break;
        }

        this.emit("editor:step", { step });

        const stepPrompt = this.buildStepPrompt(step, targetProposal);

        const messages: GrokMessage[] = [
          { role: "system", content: EDITOR_SYSTEM_PROMPT },
          { role: "user", content: stepPrompt },
        ];

        const response = await this.editorClient.chat(messages, tools);

        const result = {
          step,
          response: response.choices[0]?.message,
          success: true,
        };

        results.push(result);

        if (onStepComplete) {
          onStepComplete(step, result);
        }

        this.emit("editor:step-complete", result);
      }

      this.emit("editor:complete", { results });
      return { success: true, results };
    } catch (error: any) {
      this.emit("editor:error", { error: error.message });
      return { success: false, results };
    } finally {
      this.isActive = false;
    }
  }

  private buildStepPrompt(step: ArchitectStep, proposal: ArchitectProposal): string {
    let prompt = `Execute step ${step.order} of the implementation plan.\n\n`;
    prompt += `Overall goal: ${proposal.summary}\n\n`;
    prompt += `Step ${step.order}: ${step.description}\n`;
    prompt += `Type: ${step.type}\n`;

    if (step.target) {
      prompt += `Target: ${step.target}\n`;
    }

    if (step.details) {
      prompt += `\nDetails:\n${step.details}\n`;
    }

    prompt += `\nExecute this step now.`;

    return prompt;
  }

  async analyzeAndImplement(
    request: string,
    context?: string,
    tools?: any[],
    onApproval?: (proposal: ArchitectProposal) => Promise<boolean>
  ): Promise<{ proposal: ArchitectProposal; results: any[] }> {
    // Phase 1: Architect designs the solution
    const proposal = await this.analyze(request, context);

    // Check for approval
    if (!this.config.autoApprove && onApproval) {
      const approved = await onApproval(proposal);
      if (!approved) {
        throw new Error("Implementation not approved by user");
      }
    }

    // Phase 2: Editor implements the solution
    const { results } = await this.implement(proposal, tools);

    return { proposal, results };
  }

  cancel(): void {
    this.isActive = false;
  }

  getCurrentProposal(): ArchitectProposal | null {
    return this.currentProposal;
  }

  formatProposal(proposal: ArchitectProposal): string {
    let output = `\n📐 ARCHITECT PROPOSAL\n${"═".repeat(50)}\n\n`;
    output += `📋 Summary: ${proposal.summary}\n\n`;

    output += `📁 Affected Files (${proposal.files.length}):\n`;
    for (const file of proposal.files) {
      output += `   • ${file}\n`;
    }

    output += `\n📝 Implementation Steps (${proposal.steps.length}):\n`;
    for (const step of proposal.steps) {
      const icon = this.getStepIcon(step.type);
      output += `   ${step.order}. ${icon} ${step.description}\n`;
      if (step.target) {
        output += `      └─ ${step.target}\n`;
      }
    }

    if (proposal.risks.length > 0) {
      output += `\n⚠️  Risks:\n`;
      for (const risk of proposal.risks) {
        output += `   • ${risk}\n`;
      }
    }

    output += `\n📊 Estimated Changes: ~${proposal.estimatedChanges} lines\n`;
    output += `${"═".repeat(50)}\n`;

    return output;
  }

  private getStepIcon(type: string): string {
    switch (type) {
      case "create":
        return "➕";
      case "edit":
        return "✏️";
      case "delete":
        return "🗑️";
      case "command":
        return "⚡";
      case "test":
        return "🧪";
      default:
        return "•";
    }
  }
}

// Factory function
export function createArchitectMode(
  apiKey: string,
  baseURL?: string,
  config?: ArchitectConfig
): ArchitectMode {
  return new ArchitectMode(apiKey, baseURL, config);
}
