import { GrokClient } from '../grok/client.js';

export type LoadBalancingStrategy = 'round-robin' | 'least-loaded' | 'cost-optimized';

export interface AccountConfig {
  apiKey: string;
  name: string;
}

export interface AccountUsage {
  requests: number;
  tokens: number;
  cost: number;
  lastRequestTime: number;
  requestsInCurrentMinute: number;
  currentMinuteStart: number;
}

export interface AccountStats {
  name: string;
  requests: number;
  tokens: number;
  cost: number;
  requestsPerMinute: number;
  available: boolean;
}

export class AccountManager {
  private accounts: Map<string, GrokClient> = new Map();
  private usage: Map<string, AccountUsage> = new Map();
  private strategy: LoadBalancingStrategy = 'round-robin';
  private currentIndex: number = 0;
  private readonly maxRequestsPerMinute: number = 60;

  // Model costs per 1K tokens (input + output averaged)
  private readonly modelCosts: Record<string, number> = {
    'grok-code-fast-1': 0.005,
    'grok-3-fast': 0.008,
    'grok-4': 0.015,
  };

  constructor(
    accounts: AccountConfig[],
    strategy: LoadBalancingStrategy = 'round-robin'
  ) {
    if (accounts.length === 0) {
      throw new Error('At least one account is required');
    }

    this.strategy = strategy;

    for (const account of accounts) {
      const client = new GrokClient(account.apiKey);
      this.accounts.set(account.name, client);
      this.usage.set(account.name, {
        requests: 0,
        tokens: 0,
        cost: 0,
        lastRequestTime: 0,
        requestsInCurrentMinute: 0,
        currentMinuteStart: Date.now(),
      });
    }
  }

  /**
   * Get a client based on the current load balancing strategy
   */
  getClient(model?: string): { client: GrokClient; accountName: string } {
    const accountName = this.selectAccount(model);
    const client = this.accounts.get(accountName)!;

    // Update rate limiting
    this.updateRateLimiting(accountName);

    return { client, accountName };
  }

  /**
   * Select an account based on the strategy
   */
  private selectAccount(model?: string): string {
    const availableAccounts = this.getAvailableAccounts();

    if (availableAccounts.length === 0) {
      // If all accounts are rate-limited, wait and retry
      throw new Error('All accounts are currently rate-limited. Please try again in a moment.');
    }

    switch (this.strategy) {
      case 'round-robin':
        return this.roundRobinSelect(availableAccounts);

      case 'least-loaded':
        return this.leastLoadedSelect(availableAccounts);

      case 'cost-optimized':
        return this.costOptimizedSelect(availableAccounts, model);

      default:
        return this.roundRobinSelect(availableAccounts);
    }
  }

  /**
   * Round-robin selection
   */
  private roundRobinSelect(accounts: string[]): string {
    const account = accounts[this.currentIndex % accounts.length];
    this.currentIndex = (this.currentIndex + 1) % accounts.length;
    return account;
  }

  /**
   * Select account with least load
   */
  private leastLoadedSelect(accounts: string[]): string {
    return accounts.reduce((prev, curr) => {
      const prevUsage = this.usage.get(prev)!;
      const currUsage = this.usage.get(curr)!;

      return currUsage.requests < prevUsage.requests ? curr : prev;
    });
  }

  /**
   * Select account optimized for cost
   */
  private costOptimizedSelect(accounts: string[], model?: string): string {
    // For cost optimization, we prefer the account with lower total cost
    // This helps distribute costs evenly across accounts
    return accounts.reduce((prev, curr) => {
      const prevUsage = this.usage.get(prev)!;
      const currUsage = this.usage.get(curr)!;

      return currUsage.cost < prevUsage.cost ? curr : prev;
    });
  }

  /**
   * Get accounts that are not rate-limited
   */
  private getAvailableAccounts(): string[] {
    const now = Date.now();
    const available: string[] = [];

    for (const [name, usage] of this.usage.entries()) {
      // Reset counter if we're in a new minute
      if (now - usage.currentMinuteStart > 60000) {
        usage.requestsInCurrentMinute = 0;
        usage.currentMinuteStart = now;
      }

      // Check if account is available
      if (usage.requestsInCurrentMinute < this.maxRequestsPerMinute) {
        available.push(name);
      }
    }

    return available;
  }

  /**
   * Update rate limiting counters
   */
  private updateRateLimiting(accountName: string): void {
    const usage = this.usage.get(accountName)!;
    const now = Date.now();

    // Reset counter if we're in a new minute
    if (now - usage.currentMinuteStart > 60000) {
      usage.requestsInCurrentMinute = 0;
      usage.currentMinuteStart = now;
    }

    usage.requestsInCurrentMinute++;
    usage.requests++;
    usage.lastRequestTime = now;
  }

  /**
   * Record token usage and cost for an account
   */
  recordUsage(accountName: string, tokens: number, model: string): void {
    const usage = this.usage.get(accountName);
    if (!usage) return;

    usage.tokens += tokens;

    // Calculate cost based on model
    const costPerToken = (this.modelCosts[model] || 0.01) / 1000;
    const cost = tokens * costPerToken;
    usage.cost += cost;
  }

  /**
   * Get usage statistics for all accounts
   */
  getStats(): AccountStats[] {
    const now = Date.now();
    const stats: AccountStats[] = [];

    for (const [name, usage] of this.usage.entries()) {
      // Reset counter if we're in a new minute
      if (now - usage.currentMinuteStart > 60000) {
        usage.requestsInCurrentMinute = 0;
        usage.currentMinuteStart = now;
      }

      stats.push({
        name,
        requests: usage.requests,
        tokens: usage.tokens,
        cost: parseFloat(usage.cost.toFixed(4)),
        requestsPerMinute: usage.requestsInCurrentMinute,
        available: usage.requestsInCurrentMinute < this.maxRequestsPerMinute,
      });
    }

    return stats;
  }

  /**
   * Reset all usage statistics
   */
  resetStats(): void {
    for (const usage of this.usage.values()) {
      usage.requests = 0;
      usage.tokens = 0;
      usage.cost = 0;
      usage.requestsInCurrentMinute = 0;
      usage.currentMinuteStart = Date.now();
    }
  }

  /**
   * Set load balancing strategy
   */
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Get current strategy
   */
  getStrategy(): LoadBalancingStrategy {
    return this.strategy;
  }
}
