import { AccountManager } from './account-manager.js';
import type { GrokMessage } from '../grok/client.js';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface SubTask {
  id: string;
  description: string;
  complexity: TaskComplexity;
  context?: string;
}

export interface SubTaskResult {
  taskId: string;
  description: string;
  result: string;
  model: string;
  tokens: number;
  cost: number;
  accountUsed: string;
  executionTime: number;
  error?: string;
}

export class SubAgent {
  private accountManager: AccountManager;

  // Model selection based on complexity
  private readonly complexityModelMap: Record<TaskComplexity, string> = {
    simple: 'grok-code-fast-1',
    medium: 'grok-3-fast',
    complex: 'grok-4',
  };

  // Model costs per 1K tokens
  private readonly modelCosts: Record<string, number> = {
    'grok-code-fast-1': 0.005,
    'grok-3-fast': 0.008,
    'grok-4': 0.015,
  };

  constructor(accountManager: AccountManager) {
    this.accountManager = accountManager;
  }

  /**
   * Execute a sub-task
   */
  async executeTask(task: SubTask): Promise<SubTaskResult> {
    const startTime = Date.now();

    try {
      // Select model based on complexity
      const model = this.selectModel(task.complexity);

      // Get client from account manager
      const { client, accountName } = this.accountManager.getClient(model);

      // Build messages
      const messages: GrokMessage[] = [
        {
          role: 'system',
          content: this.getSystemPrompt(task.complexity),
        },
        {
          role: 'user',
          content: this.buildTaskPrompt(task),
        },
      ];

      // Execute the task
      const response = await client.chat(messages, [], model);

      // Extract result
      const result = response.choices[0]?.message?.content || '';

      // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
      const estimatedTokens = this.estimateTokens(messages, result);

      // Record usage
      this.accountManager.recordUsage(accountName, estimatedTokens, model);

      // Calculate cost
      const cost = this.calculateCost(estimatedTokens, model);

      const executionTime = Date.now() - startTime;

      return {
        taskId: task.id,
        description: task.description,
        result,
        model,
        tokens: estimatedTokens,
        cost,
        accountUsed: accountName,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        taskId: task.id,
        description: task.description,
        result: '',
        model: this.selectModel(task.complexity),
        tokens: 0,
        cost: 0,
        accountUsed: 'unknown',
        executionTime,
        error: error.message,
      };
    }
  }

  /**
   * Select model based on task complexity
   */
  private selectModel(complexity: TaskComplexity): string {
    return this.complexityModelMap[complexity];
  }

  /**
   * Get system prompt based on complexity
   */
  private getSystemPrompt(complexity: TaskComplexity): string {
    const basePrompt = 'You are an expert AI assistant helping to complete a specific sub-task as part of a larger project.';

    switch (complexity) {
      case 'simple':
        return `${basePrompt} This is a simple task that requires straightforward execution. Be concise and direct in your response.`;

      case 'medium':
        return `${basePrompt} This is a moderately complex task that may require some analysis and reasoning. Provide a thorough but focused response.`;

      case 'complex':
        return `${basePrompt} This is a complex task that requires deep analysis, careful reasoning, and comprehensive output. Take your time to provide a detailed and well-structured response.`;

      default:
        return basePrompt;
    }
  }

  /**
   * Build task prompt with context
   */
  private buildTaskPrompt(task: SubTask): string {
    let prompt = `Task: ${task.description}\n\n`;

    if (task.context) {
      prompt += `Context:\n${task.context}\n\n`;
    }

    prompt += 'Please complete this task and provide a clear, actionable result.';

    return prompt;
  }

  /**
   * Estimate tokens used (rough approximation)
   */
  private estimateTokens(messages: GrokMessage[], result: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    const inputChars = messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return sum + content.length;
    }, 0);

    const outputChars = result.length;
    const totalChars = inputChars + outputChars;

    return Math.ceil(totalChars / 4);
  }

  /**
   * Calculate cost based on tokens and model
   */
  private calculateCost(tokens: number, model: string): number {
    const costPerToken = (this.modelCosts[model] || 0.01) / 1000;
    return parseFloat((tokens * costPerToken).toFixed(6));
  }

  /**
   * Analyze task complexity (helper method)
   * This can be used to automatically determine complexity if not specified
   */
  static analyzeComplexity(description: string): TaskComplexity {
    const lowerDesc = description.toLowerCase();

    // Complex indicators
    const complexIndicators = [
      'analyze',
      'design',
      'architect',
      'refactor',
      'optimize',
      'implement complex',
      'multiple files',
      'system-wide',
    ];

    // Simple indicators
    const simpleIndicators = [
      'fix typo',
      'update',
      'rename',
      'add comment',
      'simple change',
      'minor',
    ];

    // Check for complex indicators
    if (complexIndicators.some((indicator) => lowerDesc.includes(indicator))) {
      return 'complex';
    }

    // Check for simple indicators
    if (simpleIndicators.some((indicator) => lowerDesc.includes(indicator))) {
      return 'simple';
    }

    // Default to medium
    return 'medium';
  }
}
