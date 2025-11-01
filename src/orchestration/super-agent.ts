import { AccountManager } from './account-manager.js';
import { SubAgent, type SubTask, type SubTaskResult, TaskComplexity } from './sub-agent.js';
import type { GrokMessage } from '../grok/client.js';

export type ExecutionStrategy = 'parallel' | 'sequential' | 'adaptive';

export interface OrchestrationTask {
  id: string;
  description: string;
  context?: string;
  maxSubTasks?: number; // Default: 5
}

export interface OrchestrationResult {
  taskId: string;
  description: string;
  subTasks: SubTaskResult[];
  finalResult: string;
  totalTokens: number;
  totalCost: number;
  executionTime: number;
  strategy: ExecutionStrategy;
  success: boolean;
  error?: string;
}

export interface DecomposedTask {
  subTasks: SubTask[];
  recommendedStrategy: ExecutionStrategy;
}

export class SuperAgent {
  private accountManager: AccountManager;
  private subAgent: SubAgent;
  private strategy: ExecutionStrategy = 'adaptive';

  constructor(accountManager: AccountManager) {
    this.accountManager = accountManager;
    this.subAgent = new SubAgent(accountManager);
  }

  /**
   * Orchestrate a complex task
   */
  async orchestrate(task: OrchestrationTask): Promise<OrchestrationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Decompose task into sub-tasks using grok-3-fast
      const decomposed = await this.decomposeTask(task);

      // Step 2: Execute sub-tasks based on strategy
      let subTaskResults: SubTaskResult[];

      if (decomposed.recommendedStrategy === 'parallel' || this.strategy === 'parallel') {
        subTaskResults = await this.executeParallel(decomposed.subTasks);
      } else if (decomposed.recommendedStrategy === 'sequential' || this.strategy === 'sequential') {
        subTaskResults = await this.executeSequential(decomposed.subTasks);
      } else {
        // Adaptive: analyze dependencies and execute accordingly
        subTaskResults = await this.executeAdaptive(decomposed.subTasks);
      }

      // Step 3: Aggregate results using grok-4
      const finalResult = await this.aggregateResults(task, subTaskResults);

      // Calculate totals
      const totalTokens = subTaskResults.reduce((sum, r) => sum + r.tokens, 0);
      const totalCost = subTaskResults.reduce((sum, r) => sum + r.cost, 0);
      const executionTime = Date.now() - startTime;

      // Check if all sub-tasks succeeded
      const success = subTaskResults.every((r) => !r.error);

      return {
        taskId: task.id,
        description: task.description,
        subTasks: subTaskResults,
        finalResult,
        totalTokens,
        totalCost: parseFloat(totalCost.toFixed(6)),
        executionTime,
        strategy: this.strategy,
        success,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        taskId: task.id,
        description: task.description,
        subTasks: [],
        finalResult: '',
        totalTokens: 0,
        totalCost: 0,
        executionTime,
        strategy: this.strategy,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Decompose task into sub-tasks using grok-3-fast
   */
  private async decomposeTask(task: OrchestrationTask): Promise<DecomposedTask> {
    const model = 'grok-3-fast';
    const { client, accountName } = this.accountManager.getClient(model);

    const maxSubTasks = task.maxSubTasks || 5;

    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `You are an expert task decomposition agent. Your job is to break down complex tasks into ${maxSubTasks} or fewer concrete, actionable sub-tasks.

For each sub-task, you must specify:
1. A unique ID (subtask-1, subtask-2, etc.)
2. A clear description
3. Complexity level (simple, medium, or complex)
4. Whether it depends on other sub-tasks

Also recommend an execution strategy:
- parallel: Sub-tasks can run independently
- sequential: Sub-tasks must run in order
- adaptive: Some dependencies exist but partial parallelization is possible

Return your response in the following JSON format:
{
  "subTasks": [
    {
      "id": "subtask-1",
      "description": "...",
      "complexity": "simple|medium|complex",
      "dependencies": []
    }
  ],
  "recommendedStrategy": "parallel|sequential|adaptive"
}`,
      },
      {
        role: 'user',
        content: this.buildDecompositionPrompt(task),
      },
    ];

    const response = await client.chat(messages, [], model);
    const content = response.choices[0]?.message?.content || '{}';

    // Estimate tokens
    const estimatedTokens = this.estimateTokens(messages, content);
    this.accountManager.recordUsage(accountName, estimatedTokens, model);

    // Parse response
    try {
      const parsed = this.parseDecompositionResponse(content);
      return parsed;
    } catch (error: any) {
      throw new Error(`Failed to decompose task: ${error.message}`);
    }
  }

  /**
   * Build decomposition prompt
   */
  private buildDecompositionPrompt(task: OrchestrationTask): string {
    let prompt = `Task: ${task.description}\n\n`;

    if (task.context) {
      prompt += `Context:\n${task.context}\n\n`;
    }

    prompt += 'Please decompose this task into concrete, actionable sub-tasks. Each sub-task should be independently executable and contribute to completing the overall task.';

    return prompt;
  }

  /**
   * Parse decomposition response
   */
  private parseDecompositionResponse(content: string): DecomposedTask {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in decomposition response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      subTasks: parsed.subTasks.map((st: any) => ({
        id: st.id,
        description: st.description,
        complexity: st.complexity as TaskComplexity,
        context: st.context,
      })),
      recommendedStrategy: parsed.recommendedStrategy || 'adaptive',
    };
  }

  /**
   * Execute sub-tasks in parallel
   */
  private async executeParallel(subTasks: SubTask[]): Promise<SubTaskResult[]> {
    const promises = subTasks.map((task) => this.subAgent.executeTask(task));
    return await Promise.all(promises);
  }

  /**
   * Execute sub-tasks sequentially
   */
  private async executeSequential(subTasks: SubTask[]): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];

    for (const task of subTasks) {
      const result = await this.subAgent.executeTask(task);
      results.push(result);

      // Add previous results as context for next task
      if (results.length > 0) {
        const contextSummary = results
          .map((r) => `${r.description}: ${r.result.substring(0, 200)}`)
          .join('\n');
        task.context = (task.context || '') + `\n\nPrevious results:\n${contextSummary}`;
      }
    }

    return results;
  }

  /**
   * Execute sub-tasks adaptively (mix of parallel and sequential)
   */
  private async executeAdaptive(subTasks: SubTask[]): Promise<SubTaskResult[]> {
    // For simplicity, we'll execute in small batches of 2-3 tasks at a time
    const results: SubTaskResult[] = [];
    const batchSize = 2;

    for (let i = 0; i < subTasks.length; i += batchSize) {
      const batch = subTasks.slice(i, i + batchSize);
      const batchResults = await this.executeParallel(batch);
      results.push(...batchResults);

      // Add context from completed tasks to remaining tasks
      if (i + batchSize < subTasks.length) {
        const contextSummary = results
          .map((r) => `${r.description}: ${r.result.substring(0, 200)}`)
          .join('\n');

        for (let j = i + batchSize; j < subTasks.length; j++) {
          subTasks[j].context = (subTasks[j].context || '') + `\n\nPrevious results:\n${contextSummary}`;
        }
      }
    }

    return results;
  }

  /**
   * Aggregate results using grok-4
   */
  private async aggregateResults(
    task: OrchestrationTask,
    subTaskResults: SubTaskResult[]
  ): Promise<string> {
    const model = 'grok-4';
    const { client, accountName } = this.accountManager.getClient(model);

    const messages: GrokMessage[] = [
      {
        role: 'system',
        content: `You are an expert result aggregation agent. Your job is to synthesize the results from multiple sub-tasks into a coherent, comprehensive final result.

Provide a well-structured summary that:
1. Integrates all sub-task results
2. Highlights key findings or outcomes
3. Identifies any issues or errors
4. Provides actionable next steps if applicable`,
      },
      {
        role: 'user',
        content: this.buildAggregationPrompt(task, subTaskResults),
      },
    ];

    const response = await client.chat(messages, [], model);
    const content = response.choices[0]?.message?.content || '';

    // Estimate tokens
    const estimatedTokens = this.estimateTokens(messages, content);
    this.accountManager.recordUsage(accountName, estimatedTokens, model);

    return content;
  }

  /**
   * Build aggregation prompt
   */
  private buildAggregationPrompt(
    task: OrchestrationTask,
    subTaskResults: SubTaskResult[]
  ): string {
    let prompt = `Original Task: ${task.description}\n\n`;
    prompt += `Sub-task Results:\n\n`;

    for (const result of subTaskResults) {
      prompt += `Task: ${result.description}\n`;
      prompt += `Status: ${result.error ? 'FAILED' : 'SUCCESS'}\n`;
      if (result.error) {
        prompt += `Error: ${result.error}\n`;
      } else {
        prompt += `Result:\n${result.result}\n`;
      }
      prompt += `\n---\n\n`;
    }

    prompt += 'Please synthesize these results into a comprehensive final result.';

    return prompt;
  }

  /**
   * Estimate tokens (rough approximation)
   */
  private estimateTokens(messages: GrokMessage[], result: string): number {
    const inputChars = messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return sum + content.length;
    }, 0);

    const outputChars = result.length;
    const totalChars = inputChars + outputChars;

    return Math.ceil(totalChars / 4);
  }

  /**
   * Set execution strategy
   */
  setStrategy(strategy: ExecutionStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Get current strategy
   */
  getStrategy(): ExecutionStrategy {
    return this.strategy;
  }
}
